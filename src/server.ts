import express, { Request, Response } from "express";
import SpotifyWebApi from "spotify-web-api-node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RequestQueue } from "./requestQueue";
import { exponentialBackoff, formatSpotifyError } from "./utils";
import statusBroadcaster, { StatusContext } from "./statusBroadcaster";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Environment setup
const isDevelopment = process.env.NODE_ENV !== "production";
const savedPlaylistsPath = path.join(__dirname, "..", "saved_playlists.json");
const publicDir = path.join(__dirname, "..", "public");

// Spotify API credentials (you'd need to set these up)
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const geminiDefaultModelName = "gemini-1.5-flash";
const geminiClient = new GoogleGenerativeAI(geminiApiKey);

function getGeminiModel(modelName?: string) {
  return geminiClient.getGenerativeModel({
    model: modelName ?? geminiDefaultModelName,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
}

const tokenPath = path.join(__dirname, "..", "token.json");

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface LikedSong {
  name: string;
  artist: string;
  id: string;
  artistId?: string;
  artistIds?: string[];
}

interface Song {
  title: string;
  artist: string;
  country?: string;
}

interface Playlist {
  name: string;
  description: string;
  songs: Song[];
}

interface PlaylistPreview {
  id: string;
  name: string;
  description: string;
  embedUrl: string;
  spotifyUrl: string;
  songs: Song[];
}

interface GenrePlaylist {
  key: string;
  genre: string;
  name: string;
  description: string;
  count: number;
  songs: Song[];
}

const requestQueue = new RequestQueue();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const GENRE_KEYWORDS: { key: string; label: string; test: RegExp }[] = [
  { key: "k-pop", label: "K-Pop", test: /k[\s-]?pop/i },
  { key: "pop", label: "Pop", test: /\bpop\b/i },
  { key: "rock", label: "Rock", test: /\brock\b/i },
  { key: "hip-hop", label: "Hip-Hop", test: /hip[\s-]?hop/i },
  { key: "rap", label: "Rap", test: /\brap\b/i },
  { key: "r&b", label: "R&B", test: /r&b|r\s*&\s*b|rnb/i },
  { key: "soul", label: "Soul", test: /\bsoul\b/i },
  { key: "jazz", label: "Jazz", test: /\bjazz\b/i },
  { key: "funk", label: "Funk", test: /\bfunk\b/i },
  { key: "house", label: "House", test: /\bhouse\b/i },
  { key: "edm", label: "EDM", test: /\bedm\b/i },
  { key: "electronic", label: "Eletrônica", test: /electro|electronic|synth/i },
  { key: "dance", label: "Dance", test: /\bdance\b/i },
  { key: "metal", label: "Metal", test: /\bmetal\b/i },
  { key: "punk", label: "Punk", test: /\bpunk\b/i },
  { key: "indie", label: "Indie", test: /\bindie\b/i },
  { key: "latin", label: "Latino", test: /latin|reggaeton|cumbia|bossa|samba|mpb/i },
  { key: "country", label: "Country", test: /\bcountry\b/i },
  { key: "folk", label: "Folk", test: /\bfolk\b/i },
  { key: "classical", label: "Clássico", test: /classical|orchestral|baroque/i },
  { key: "lofi", label: "Lo-Fi", test: /lo[\s-]?fi/i },
  { key: "blues", label: "Blues", test: /\bblues\b/i },
  { key: "reggae", label: "Reggae", test: /\breggae\b/i },
  { key: "gospel", label: "Gospel", test: /gospel|worship/i },
  { key: "anime", label: "Anime / J-POP", test: /anime|j\s*-?pop|japanese/i },
];

function formatGenreChunk(chunk: string): string {
  if (!chunk) return "";
  if (chunk.length <= 3) {
    return chunk.toUpperCase();
  }
  return chunk.charAt(0).toUpperCase() + chunk.slice(1);
}

function formatGenreName(genre: string): string {
  if (!genre) return "Sem gênero";
  return genre
    .split(/[\s/]+/)
    .map((segment) =>
      segment
        .split("-")
        .map((part) => formatGenreChunk(part))
        .join("-")
    )
    .join(" ");
}

function createGenreDescription(genre: string, count: number): string {
  const plural = count === 1 ? "música" : "músicas";
  if (genre === "Sem gênero") {
    return `Coleção com ${count} ${plural} favoritas sem gênero definido.`;
  }
  return `${count} ${plural} curtidas com a energia de ${genre}. Perfeitas para mergulhar nesse estilo.`;
}

function resolveGenreGroup(genres: string[]): { key: string; label: string } {
  if (!genres?.length) {
    return { key: "sem-genero", label: "Sem gênero" };
  }

  for (const genre of genres) {
    const match = GENRE_KEYWORDS.find((candidate) => candidate.test.test(genre));
    if (match) {
      return { key: match.key, label: match.label };
    }
  }

  const primary = genres[0];
  const key = primary.toLowerCase().replace(/[^a-z0-9]+/gi, "-");
  return { key, label: formatGenreName(primary) };
}

class MissingTokenError extends Error {
  constructor(message = "Spotify authentication required.") {
    super(message);
    this.name = "MissingTokenError";
  }
}

// Logging function
const log = (message: string) => {
  if (isDevelopment) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
};

const playlistPatterns = [
  /playlist\/([A-Za-z0-9]{16,})/i,
  /spotify:playlist:([A-Za-z0-9]{16,})/i,
];

function extractSpotifyPlaylistId(reference?: string | null): string | null {
  if (!reference) {
    return null;
  }

  const value = reference.trim();
  if (!value) {
    return null;
  }

  for (const pattern of playlistPatterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (/^[A-Za-z0-9]{16,}$/i.test(value)) {
    return value;
  }

  return null;
}

function parseGeminiJson<T>(rawText: string): T {
  let text = rawText.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const snippet = text.slice(0, 500);
    log(
      `Failed to parse Gemini response: ${snippet}${
        text.length > 500 ? "..." : ""
      }`
    );
    throw new Error("Gemini response was not valid JSON");
  }
}

async function generateGeminiJson<T>(
  prompt: string,
  modelName?: string
): Promise<T> {
  log("Sending request to Gemini API");
  const model = getGeminiModel(modelName);
  const result = await model.generateContent(prompt);
  log("Received response from Gemini API");
  const text = result.response.text();
  return parseGeminiJson<T>(text);
}

// Middleware
app.use(express.json());
app.use(express.static(publicDir));

const publicPaths = new Set([
  "/",
  "/favicon.ico",
  "/login",
  "/callback",
  "/gemini-models",
  "/status-stream",
]);

app.get("/status-stream", (req: Request, res: Response) => {
  statusBroadcaster.handleConnection(req, res);
});

// Middleware to refresh token before each request
app.use(async (req: Request, res: Response, next: Function) => {
  if (publicPaths.has(req.path)) {
    return next();
  }

  try {
    log(`Refreshing token for path: ${req.path}`);
    await refreshTokenIfNeeded();
    next();
  } catch (error) {
    if (error instanceof MissingTokenError) {
      log(`Token missing for path ${req.path}`);
      return res
        .status(401)
        .send("Authentication required. Please log in at /login.");
    }

    log(`Token refresh failed: ${error}`);
    res.status(401).send("Authentication required. Please log in again.");
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/gemini-models", async (_req: Request, res: Response) => {
  try {
    log("Fetching Gemini model catalog");
    const response = await axios.get(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        params: {
          key: geminiApiKey,
          pageSize: 50,
        },
      }
    );

    const models = (response.data.models ?? [])
      .filter((model: any) =>
        (model?.supportedGenerationMethods ?? []).includes("generateContent")
      )
      .map((model: any) => ({
        name: model.name,
        displayName: model.displayName ?? model.name,
        description: model.description ?? "",
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
      }))
      .sort((a: { displayName: string }, b: { displayName: string }) =>
        a.displayName.localeCompare(b.displayName)
      );

    res.json({ models, defaultModel: geminiDefaultModelName });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Gemini models";
    log(`Gemini model fetch failed: ${message}`);
    res.status(500).json({ error: message });
  }
});

// Routes
app.get("/login", (_req: Request, res: Response) => {
  log("Initiating Spotify login");
  const scopes = [
    "user-library-read",
    "playlist-modify-private",
    "playlist-read-private",
    "playlist-read-collaborative",
  ];
  res.redirect(spotifyApi.createAuthorizeURL(scopes, "asd"));
});

app.get("/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  try {
    log("Received callback from Spotify");
    const data = await spotifyApi.authorizationCodeGrant(code as string);
    const { access_token, refresh_token, expires_in } = data.body;

    await fs.writeFile(
      tokenPath,
      JSON.stringify({
        access_token,
        refresh_token,
        expires_at: Date.now() + expires_in * 1000,
      })
    );

    log("Login successful, tokens saved");
    res.send("Login successful! You can now use the other endpoints.");
  } catch (error) {
    log(`Login error: ${error}`);
    res.status(400).send(`Error: ${(error as Error).message}`);
  }
});

app.get("/liked-songs", async (_req: Request, res: Response) => {
  const statusContext = statusBroadcaster.hasSubscribers()
    ? statusBroadcaster.createContext("liked-songs")
    : undefined;
  try {
    log("Fetching liked songs");
    const allLikedSongs = await getAllLikedSongs(statusContext);
    log(`Fetched ${allLikedSongs.length} liked songs`);
    res.json(allLikedSongs);
  } catch (error) {
    log(`Error fetching liked songs: ${error}`);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.statusError(statusContext, {
        message: formatSpotifyError(error),
      });
    }
    res.status(500).send(`Error: ${(error as Error).message}`);
  }
});

app.get("/generate-playlists", async (req: Request, res: Response) => {
  const statusContext = statusBroadcaster.hasSubscribers()
    ? statusBroadcaster.createContext("generate-playlists")
    : undefined;
  try {
    log("Generating playlists");
    const likedSongs = await getAllLikedSongs(statusContext);
    const selectedModel =
      typeof req.query.model === "string" ? req.query.model : undefined;

    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.geminiStart(statusContext, {
        model: selectedModel ?? geminiDefaultModelName,
        label: "Gerando playlists com Gemini…",
      });
    }

    const playlists = await generateOrLoadPlaylists(
      likedSongs,
      selectedModel
    );

    broadcastPlaylistSongs(playlists, statusContext);

    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.geminiComplete(statusContext, {
        totalPlaylists: playlists.length,
        label: "Playlists prontas!",
      });
    }

    await fs.writeFile(savedPlaylistsPath, JSON.stringify(playlists, null, 2));
    log(`Generated ${playlists.length} playlists and saved to file`);

    res.json(playlists);
  } catch (error) {
    log(`Error generating playlists: ${error}`);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.statusError(statusContext, {
        message: formatSpotifyError(error),
      });
    }
    res.status(500).send(`Error: ${(error as Error).message}`);
  }
});

app.get("/genre-playlists", async (_req: Request, res: Response) => {
  const statusContext = statusBroadcaster.hasSubscribers()
    ? statusBroadcaster.createContext("genre-playlists")
    : undefined;

  try {
    await refreshTokenIfNeeded();

    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.statusMessage(statusContext, {
        message: "Organizando músicas curtidas por gênero…",
      });
    }

    const playlists = await generateGenrePlaylists(statusContext);
    const totalSongs = playlists.reduce(
      (sum: number, playlist: GenrePlaylist) => sum + playlist.count,
      0
    );

    res.json({
      playlists,
      summary: {
        totalPlaylists: playlists.length,
        totalSongs,
      },
    });
  } catch (error) {
    log(`Error generating genre playlists: ${error}`);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.statusError(statusContext, {
        message: formatSpotifyError(error),
      });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

async function findTrackUris(
  songs: { title: string; artist: string }[]
): Promise<(string | undefined)[]> {
  const batchSize = 5; // keep requests gentle to avoid rate limiting
  const delayBetweenSongsMs = 120;
  const batches: { title: string; artist: string }[][] = [];

  for (let i = 0; i < songs.length; i += batchSize) {
    batches.push(songs.slice(i, i + batchSize));
  }

  const trackResults: (string | undefined)[] = [];

  for (const batch of batches) {
    const uris = await requestQueue.add(async () => {
      const batchUris: (string | undefined)[] = [];

      for (let index = 0; index < batch.length; index += 1) {
        const song = batch[index];
        const uri = await exponentialBackoff(async () => {
          try {
            const exactSearch = await spotifyApi.searchTracks(
              `track:${song.title} artist:${song.artist}`
            );

            if ((exactSearch.body.tracks?.items.length ?? 0) > 0) {
              log(`Found exact track: ${song.title} by ${song.artist}`);
              return exactSearch.body.tracks!.items[0].uri;
            }

            log(
              `Could not find exact track: ${song.title} by ${song.artist} Searching for artist: ${song.artist}`
            );

            const artistSearch = await spotifyApi.searchArtists(song.artist);
            if ((artistSearch.body.artists?.items.length ?? 0) > 0) {
              const artistId = artistSearch.body.artists!.items[0].id;
              const topTracks = await spotifyApi.getArtistTopTracks(
                artistId,
                "US"
              );

              if (topTracks.body.tracks.length > 0) {
                const randomIndex = Math.floor(
                  Math.random() * Math.min(5, topTracks.body.tracks.length)
                );
                log(`Found track for artist: ${song.artist}`);
                return topTracks.body.tracks[randomIndex].uri;
              }
            }

            log(`No tracks found for artist: ${song.artist}`);
            return undefined;
          } catch (error: any) {
            if (error?.statusCode === 429) {
              throw error;
            }

            log(
              `Error searching for track "${song.title}" by ${song.artist}: ${formatSpotifyError(error)}`
            );
            return undefined;
          }
        });

        batchUris.push(uri);

        if (index < batch.length - 1) {
          await sleep(delayBetweenSongsMs);
        }
      }

      return batchUris;
    });

    trackResults.push(...uris);
  }

  return trackResults;
}

function sanitizePlaylistData(playlist: Playlist): Playlist {
  return {
    name: playlist.name.trim().slice(0, 100), // Spotify has a 100 character limit for playlist names
    description: playlist.description.trim().slice(0, 300), // 300 character limit for descriptions
    songs: playlist.songs,
  };
}

function broadcastPlaylistSongs(
  playlists: Playlist | Playlist[],
  statusContext?: StatusContext
) {
  if (!statusContext || !statusBroadcaster.hasSubscribers()) {
    return;
  }

  const items = Array.isArray(playlists) ? playlists : [playlists];
  const limit = 160;
  let sent = 0;

  outer: for (let playlistIndex = 0; playlistIndex < items.length; playlistIndex += 1) {
    const playlist = items[playlistIndex];
    if (!playlist?.songs?.length) {
      continue;
    }

    for (let songIndex = 0; songIndex < playlist.songs.length; songIndex += 1) {
      const song = playlist.songs[songIndex];
      if (!song?.title || !song?.artist) {
        continue;
      }

      statusBroadcaster.geminiSong(statusContext, {
        title: song.title,
        artist: song.artist,
        country: song.country,
        playlist: playlist.name,
        playlistIndex: playlistIndex + 1,
        position: songIndex + 1,
      });

      sent += 1;
      if (sent >= limit) {
        break outer;
      }
    }
  }
}

app.get("/preview-playlists", async (_req: Request, res: Response) => {
  const statusContext = statusBroadcaster.hasSubscribers()
    ? statusBroadcaster.createContext("preview")
    : undefined;
  try {
    await refreshTokenIfNeeded();

    log("Fetching all playlists for preview");
    const modelName =
      typeof _req.query.model === "string" ? _req.query.model : undefined;
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.geminiStart(statusContext, {
        model: modelName ?? geminiDefaultModelName,
        label: "Gerando playlists surpresa…",
      });
    }
    const playlists = await loadOrGeneratePlaylistsForPreview(
      modelName,
      statusContext
    );

    broadcastPlaylistSongs(playlists, statusContext);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.geminiComplete(statusContext, {
        totalPlaylists: playlists.length,
        label: "Playlists surpresa prontas!",
      });
    }

    const createdPlaylistIds: string[] = [];
    const previewPayload: PlaylistPreview[] = [];

    for (const playlist of playlists) {
      try {
        log(`Processing playlist: ${playlist.name}`);
        const trackUris = await findTrackUris(playlist.songs);

        const validTrackUris = trackUris.filter(
          (uri): uri is string => uri !== undefined
        );
        log(
          `Found ${validTrackUris.length} valid track URIs for ${playlist.name}`
        );

        if (validTrackUris.length === 0) {
          log(`No valid tracks found for playlist: ${playlist.name}`);
          continue;
        }

        const sanitizedPlaylist = sanitizePlaylistData(playlist);

        log(`Attempting to create playlist: ${sanitizedPlaylist.name}`);
        log(`Playlist description: ${sanitizedPlaylist.description}`);
        log(`Number of valid tracks: ${validTrackUris.length}`);

        const newPlaylist = await requestQueue.add(() =>
          spotifyApi.createPlaylist(sanitizedPlaylist.name, {
            description: sanitizedPlaylist.description,
            public: false,
          })
        );

        log(`Successfully created playlist: ${newPlaylist.body.id}`);

        const batchSize = 100; // Spotify allows up to 100 tracks per request
        for (let i = 0; i < validTrackUris.length; i += batchSize) {
          const batch = validTrackUris.slice(i, i + batchSize);
          await requestQueue.add(() =>
            spotifyApi.addTracksToPlaylist(newPlaylist.body.id, batch)
          );
        }

        createdPlaylistIds.push(newPlaylist.body.id);
        previewPayload.push({
          id: newPlaylist.body.id,
          name: sanitizedPlaylist.name,
          description: sanitizedPlaylist.description,
          embedUrl: `https://open.spotify.com/embed/playlist/${newPlaylist.body.id}?utm_source=generator`,
          spotifyUrl: `https://open.spotify.com/playlist/${newPlaylist.body.id}`,
          songs: sanitizedPlaylist.songs,
        });
      } catch (error) {
        const errorMessage = formatSpotifyError(error);
        log(`Error processing playlist "${playlist.name}":\n${errorMessage}`);
      }
    }

    if (previewPayload.length === 0) {
      throw new Error("No valid playlists could be created");
    }

    log("Sending JSON response with playlist previews");
    res.json({ playlists: previewPayload });

    // // Optional: Delete the created playlists after a certain time
    // setTimeout(async () => {
    //   try {
    //     for (const playlistId of createdPlaylistIds) {
    //       await requestQueue.add(() => spotifyApi.unfollowPlaylist(playlistId));
    //       log(`Deleted playlist: ${playlistId}`);
    //     }
    //   } catch (error) {
    //     log(`Error deleting playlists: ${formatSpotifyError(error)}`);
    //   }
    // }, 3600000); // Delete after 1 hour
  } catch (error) {
    const errorMessage = formatSpotifyError(error);
    log(`Error creating preview playlists:\n${errorMessage}`);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.statusError(statusContext, {
        message: errorMessage,
      });
    }
    res.status(500).json({ error: errorMessage });
  }
});

app.get("/user-playlists", async (_req: Request, res: Response) => {
  try {
    await refreshTokenIfNeeded();
  } catch (error) {
    if (error instanceof MissingTokenError) {
      return res.status(401).json({ error: error.message });
    }

    log(`Failed to refresh token before loading playlists: ${error}`);
    return res
      .status(500)
      .json({ error: "Failed to refresh Spotify token. Please try again." });
  }

  try {
    const limit = 50;
    let offset = 0;
    const maxPlaylists = 200;

    const meResponse = await requestQueue.add(() => spotifyApi.getMe());
    const currentUserId = meResponse.body?.id ?? "";
    const currentUserDisplayName =
      meResponse.body?.display_name || currentUserId || undefined;

    const collected: Array<{
      id: string;
      name: string;
      description: string;
      trackCount: number;
      collaborative: boolean;
      canEdit: boolean;
      owner?: string;
      image?: string | null;
    }> = [];

    while (collected.length < maxPlaylists) {
      const response = await requestQueue.add(() =>
        spotifyApi.getUserPlaylists({ limit, offset })
      );
      const body = response.body;
      const items = body?.items ?? [];
      const total = typeof body?.total === "number" ? body.total : undefined;

      for (const playlist of items) {
        if (!playlist?.id || !playlist?.name) continue;

        const ownerId = playlist.owner?.id ?? "";
        const isOwnedByUser = Boolean(currentUserId && ownerId === currentUserId);
        const isCollaborative = Boolean(playlist.collaborative);
        const canEdit = isOwnedByUser || isCollaborative;

        if (!canEdit) {
          continue;
        }

        const ownerLabel =
          isOwnedByUser && currentUserDisplayName
            ? currentUserDisplayName
            : playlist.owner?.display_name || playlist.owner?.id;

        collected.push({
          id: playlist.id,
          name: playlist.name,
          description: playlist.description ?? "",
          trackCount: playlist.tracks?.total ?? 0,
          collaborative: Boolean(playlist.collaborative),
          canEdit,
          owner: ownerLabel,
          image: playlist.images?.[0]?.url ?? null,
        });

        if (collected.length >= maxPlaylists) {
          break;
        }
      }

      offset += items.length;
      const reachedEnd =
        !items.length ||
        (typeof total === "number" ? offset >= total : items.length < limit);
      if (reachedEnd) {
        break;
      }
    }

    res.json({ playlists: collected });
  } catch (error) {
    const errorMessage = formatSpotifyError(error);
    log(`Error fetching user playlists:\n${errorMessage}`);

    const statusCode = (error as any)?.statusCode;

    if (statusCode === 401) {
      await fs.unlink(tokenPath).catch(() => undefined);
      return res.status(401).json({
        error: "Precisamos que você faça login novamente no Spotify.",
      });
    }

    if (statusCode === 403) {
      await fs.unlink(tokenPath).catch(() => undefined);
      return res.status(403).json({
        error:
          "O Spotify solicitou novas permissões para listar suas playlists. Faça login novamente para continuar.",
      });
    }

    res
      .status(500)
      .json({ error: "Failed to load playlists from Spotify." });
  }
});

app.post("/create-custom-playlist", async (req: Request, res: Response) => {
  const statusContext = statusBroadcaster.hasSubscribers()
    ? statusBroadcaster.createContext("custom")
    : undefined;
  try {
    await refreshTokenIfNeeded();

    const userPrompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
    if (!userPrompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const playlistReference =
      typeof req.body.playlistId === "string" ? req.body.playlistId.trim() : "";
    const targetPlaylistId = extractSpotifyPlaylistId(playlistReference);

    if (playlistReference && !targetPlaylistId) {
      return res.status(400).json({
        error: "Could not understand that playlist link. Paste a Spotify playlist URL or ID.",
      });
    }

    log(`Received custom playlist prompt: ${userPrompt}`);

    let existingPlaylist: SpotifyApi.SinglePlaylistResponse | null = null;
    if (targetPlaylistId) {
      try {
        const playlistResponse = await requestQueue.add(() =>
          spotifyApi.getPlaylist(targetPlaylistId)
        );
        existingPlaylist = playlistResponse.body;
      } catch (error: any) {
        const statusCode = error?.statusCode;
        const formatted = formatSpotifyError(error);
        log(`Failed to load target playlist ${targetPlaylistId}:
${formatted}`);
        if (statusCode === 404) {
          return res.status(404).json({
            error: "We couldn't find that playlist. Make sure the link is correct and try again.",
          });
        }
        if (statusCode === 403) {
          return res.status(403).json({
            error: "We can't edit that playlist. Check that you own it or it's collaborative.",
          });
        }
        throw error;
      }
    }

    const modelName =
      typeof req.body.model === "string" ? req.body.model.trim() : undefined;
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.geminiStart(statusContext, {
        model: modelName ?? geminiDefaultModelName,
        label: "Criando playlist personalizada…",
        promptPreview: userPrompt.slice(0, 160),
      });
    }
    const customPlaylist = await generateCustomPlaylistWithGemini(
      userPrompt,
      modelName
    );
    const sanitizedPlaylist = sanitizePlaylistData(customPlaylist);
    broadcastPlaylistSongs(sanitizedPlaylist, statusContext);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.geminiComplete(statusContext, {
        totalPlaylists: 1,
        label: targetPlaylistId
          ? "Sugestões prontas para atualizar sua playlist!"
          : "Playlist personalizada pronta!",
        songs: sanitizedPlaylist.songs?.slice(0, 80),
      });
    }
    const trackUris = await findTrackUris(sanitizedPlaylist.songs);

    const validTrackUris = trackUris.filter(
      (uri): uri is string => uri !== undefined
    );

    if (validTrackUris.length === 0) {
      return res
        .status(404)
        .json({ error: "No valid tracks found for the custom playlist" });
    }

    const uniqueTrackUris = Array.from(new Set(validTrackUris));

    if (statusContext && statusBroadcaster.hasSubscribers() && targetPlaylistId) {
      statusBroadcaster.statusMessage(statusContext, {
        message: existingPlaylist?.name
          ? `Atualizando “${existingPlaylist.name}”…`
          : "Atualizando sua playlist…",
      });
    }

    let responsePayload: {
      id: string;
      name: string;
      description: string;
      embedUrl: string;
      spotifyUrl: string;
      songs: Song[];
      upgraded?: boolean;
    };

    if (targetPlaylistId && existingPlaylist) {
      await requestQueue.add(() =>
        spotifyApi.addTracksToPlaylist(targetPlaylistId, uniqueTrackUris)
      );

      const description = sanitizedPlaylist.description
        ? sanitizedPlaylist.description
        : existingPlaylist.description || sanitizedPlaylist.name;

      if (description) {
        try {
          await requestQueue.add(() =>
            spotifyApi.changePlaylistDetails(targetPlaylistId, {
              description,
            })
          );
        } catch (error: any) {
          log(
            `Failed to update playlist description for ${targetPlaylistId}:
${formatSpotifyError(error)}`
          );
        }
      }

      if (statusContext && statusBroadcaster.hasSubscribers()) {
        statusBroadcaster.statusMessage(statusContext, {
          message: "Novas faixas adicionadas à sua playlist!",
        });
      }

      responsePayload = {
        id: targetPlaylistId,
        name: existingPlaylist.name || sanitizedPlaylist.name,
        description,
        embedUrl: `https://open.spotify.com/embed/playlist/${targetPlaylistId}?utm_source=generator`,
        spotifyUrl: `https://open.spotify.com/playlist/${targetPlaylistId}`,
        songs: sanitizedPlaylist.songs,
        upgraded: true,
      };
    } else {
      const newPlaylist = await requestQueue.add(() =>
        spotifyApi.createPlaylist(sanitizedPlaylist.name, {
          description: sanitizedPlaylist.description,
          public: false,
        })
      );

      await requestQueue.add(() =>
        spotifyApi.addTracksToPlaylist(newPlaylist.body.id, uniqueTrackUris)
      );

      responsePayload = {
        id: newPlaylist.body.id,
        name: sanitizedPlaylist.name,
        description: sanitizedPlaylist.description,
        embedUrl: `https://open.spotify.com/embed/playlist/${newPlaylist.body.id}?utm_source=generator`,
        spotifyUrl: `https://open.spotify.com/playlist/${newPlaylist.body.id}`,
        songs: sanitizedPlaylist.songs,
      };
    }

    res.json({
      playlist: responsePayload,
    });
  } catch (error) {
    const errorMessage = formatSpotifyError(error);
    log(`Error creating custom playlist:\n${errorMessage}`);
    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.statusError(statusContext, {
        message: errorMessage,
      });
    }
    res.status(500).json({ error: errorMessage });
  }
});

async function refreshTokenIfNeeded(): Promise<void> {
  let tokenData: TokenData;

  try {
    tokenData = JSON.parse(await fs.readFile(tokenPath, "utf8"));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      log("Token file not found. User must log in to Spotify.");
      throw new MissingTokenError();
    }

    log(`Failed to read token file: ${error}`);
    throw new Error("Failed to refresh token. Please log in again.");
  }

  try {
    if (Date.now() > tokenData.expires_at - 300000) {
      log("Access token expired or expiring soon, refreshing");
      spotifyApi.setRefreshToken(tokenData.refresh_token);
      const data = await spotifyApi.refreshAccessToken();
      const { access_token, expires_in } = data.body;

      await fs.writeFile(
        tokenPath,
        JSON.stringify({
          access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Date.now() + expires_in * 1000,
        })
      );

      spotifyApi.setAccessToken(access_token);
      log("Access token refreshed and saved");
    } else {
      log("Access token still valid");
      spotifyApi.setAccessToken(tokenData.access_token);
    }
  } catch (error) {
    log(`Failed to refresh token: ${error}`);
    throw new Error("Failed to refresh token. Please log in again.");
  }
}

async function getAllLikedSongs(
  statusContext?: StatusContext
): Promise<LikedSong[]> {
  let allTracks: LikedSong[] = [];
  let offset = 0;
  const limit = 50; // Spotify API allows a maximum of 50 tracks per request
  let total: number;
  const shouldBroadcast = Boolean(
    statusContext && statusBroadcaster.hasSubscribers()
  );
  const maxBroadcast = 120;
  let broadcastCount = 0;
  let hasAnnounced = false;

  do {
    log(`Fetching liked songs: offset ${offset}`);
    const data = await spotifyApi.getMySavedTracks({ limit, offset });
    total = data.body.total;

    if (shouldBroadcast && !hasAnnounced) {
      statusBroadcaster.likedStart(statusContext!, { total });
      hasAnnounced = true;
    }

    const tracks: LikedSong[] = data.body.items.map((item) => ({
      name: item.track.name,
      artist: item.track.artists[0]?.name ?? "",
      id: item.track.id,
      artistId: item.track.artists[0]?.id,
      artistIds: item.track.artists.map((artist) => artist.id).filter(Boolean),
    }));

    tracks.forEach((track, index) => {
      allTracks.push(track);
      if (shouldBroadcast && broadcastCount < maxBroadcast) {
        statusBroadcaster.likedSong(statusContext!, {
          name: track.name,
          artist: track.artist,
          id: track.id,
          index: offset + index + 1,
          total,
        });
        broadcastCount += 1;
      }
    });
    offset += limit;
    log(`Fetched ${allTracks.length}/${total} liked songs`);
  } while (offset < total);

  if (shouldBroadcast) {
    statusBroadcaster.likedComplete(statusContext!, {
      total: allTracks.length,
    });
  }

  return allTracks;
}

async function generateOrLoadPlaylists(
  likedSongs: LikedSong[],
  modelName?: string
): Promise<Playlist[]> {
  if (isDevelopment && !modelName) {
    try {
      log("Attempting to load saved playlists");
      const savedPlaylists = await fs.readFile(savedPlaylistsPath, "utf8");
      log("Using saved playlists");
      return JSON.parse(savedPlaylists);
    } catch (error) {
      log("No saved playlists found, generating new ones");
      return generatePlaylistsWithGemini(likedSongs);
    }
  }

  log(
    `Generating new playlists${
      modelName ? ` with Gemini model ${modelName}` : ""
    }`
  );
  return generatePlaylistsWithGemini(likedSongs, modelName);
}

async function generateCustomPlaylistWithGemini(
  userPrompt: string,
  modelName?: string
): Promise<Playlist> {
  log("Generating custom playlist with Gemini");
  const prompt = `
You are an innovative AI DJ tasked with creating a unique and engaging playlist based on the following user prompt:

"${userPrompt}"

Instructions:
1. Create a playlist with 20-25 songs that fits the theme or mood described in the prompt.
2. Give the playlist a creative, catchy name that reflects its theme.
3. Provide a brief, engaging description for the playlist (max 50 words).
4. Include a mix of well-known and lesser-known tracks that fit the theme.
5. Make unexpected connections between songs where appropriate.
6. Avoid overly obvious song choices; aim for originality and creativity in selections.

Diversity and theme balance:
7. Include 2-3 songs from artists specifically mentioned in the user prompt.
8. Allow up to 3 songs per artist, but aim for variety when possible.
9. Include at least 3 lesser-known or up-and-coming artists in the genre.
10. Include artists from at least 3 different countries.
11. Include 1-2 crossover tracks from related genres that fit the overall mood and theme.

Song selection process:
12. Prioritize maintaining the theme and mood of the playlist over strict diversity rules.
13. For each song, consider how it fits the theme and contributes to the playlist's overall feel.
14. If including multiple songs from one artist, ensure they showcase different aspects of their style.
15. Consider instrumental tracks or remixes that fit the theme to add variety.

Respond with a JSON object representing the playlist. The object should have the following structure:
{
  "name": "Playlist Name",
  "description": "Brief, engaging description of the playlist (max 50 words)",
  "songs": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "country": "Artist's Country of Origin"
    },
    ...
  ]
}

Your response should contain only the JSON object, with no additional text or explanation.
  `;

  return generateGeminiJson<Playlist>(prompt, modelName);
}

async function generatePlaylistsWithGemini(
  likedSongs: LikedSong[],
  modelName?: string
): Promise<Playlist[]> {
  log(
    `Generating playlists with Gemini${
      modelName ? ` model ${modelName}` : ""
    }`
  );
  const prompt = `
    You are an innovative AI DJ tasked with creating unique and engaging playlists from a user's collection of liked songs. Your goal is to surprise and delight the user with unexpected combinations and creative themes.

    Instructions:
    1. Create 5-7 distinctive playlists.
    2. Each playlist should have 15-30 songs, but the exact number can vary based on the theme.
    3. Give each playlist a creative, catchy name that reflects its theme.
    4. Provide a brief, engaging description for each playlist.
    5. Think beyond generic categories like genre or era. Consider themes based on:
       - Specific moods or emotions
       - Narrative arcs
       - Unconventional connections between songs
       - Imaginary scenarios
    6. Include a mix of well-known and lesser-known tracks in each playlist.
    7. Make unexpected connections between songs where appropriate.

    Respond with a JSON array of playlist objects. Each playlist object should have the following structure:
    {
      "name": "Playlist Name",
      "description": "Brief, engaging description of the playlist",
      "songs": [
        {
          "title": "Song Title",
          "artist": "Artist Name"
        },
        ...
      ]
    }

    Your response should contain only the JSON array, with no additional text or explanation.

    Here's the list of liked songs:
    ${JSON.stringify(likedSongs)}
  `;

  return generateGeminiJson<Playlist[]>(prompt, modelName);
}

async function generateGenrePlaylists(
  statusContext?: StatusContext
): Promise<GenrePlaylist[]> {
  const likedSongs = await getAllLikedSongs(statusContext);
  if (!likedSongs.length) {
    return [];
  }

  const allArtistIds = likedSongs
    .flatMap((song) => song.artistIds ?? (song.artistId ? [song.artistId] : []))
    .filter((id): id is string => Boolean(id));

  const uniqueArtistIds = Array.from(new Set(allArtistIds));

  if (statusContext && statusBroadcaster.hasSubscribers()) {
    statusBroadcaster.genreStart(statusContext, {
      totalSongs: likedSongs.length,
      totalArtists: uniqueArtistIds.length,
    });
  }

  const artistGenreMap = new Map<string, string[]>();
  const artistBatchSize = 50;
  let processedArtists = 0;

  for (let i = 0; i < uniqueArtistIds.length; i += artistBatchSize) {
    const batch = uniqueArtistIds.slice(i, i + artistBatchSize);

    try {
      const response = await requestQueue.add(() =>
        exponentialBackoff(() => spotifyApi.getArtists(batch))
      );

      const artists = response.body.artists ?? [];
      artists.forEach((artist: SpotifyApi.ArtistObjectFull | null | undefined) => {
        if (artist?.id) {
          artistGenreMap.set(artist.id, artist.genres ?? []);
        }
      });
    } catch (error) {
      log(
        `Error fetching artist genres for batch: ${formatSpotifyError(error)}`
      );
    }

    processedArtists += batch.length;

    if (statusContext && statusBroadcaster.hasSubscribers()) {
      statusBroadcaster.genreProgress(statusContext, {
        stage: "artists",
        processed: processedArtists,
        total: uniqueArtistIds.length,
      });
    }

    await sleep(150);
  }

  const groups = new Map<
    string,
    {
      label: string;
      songs: Song[];
    }
  >();

  likedSongs.forEach((song) => {
    const primaryArtistId = song.artistId ?? song.artistIds?.[0];
    const genres = (primaryArtistId && artistGenreMap.get(primaryArtistId)) || [];
    const { key, label } = resolveGenreGroup(genres);

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        songs: [],
      });
    }

    const group = groups.get(key)!;
    group.songs.push({
      title: song.name,
      artist: song.artist,
    });
  });

  if (statusContext && statusBroadcaster.hasSubscribers()) {
    statusBroadcaster.genreProgress(statusContext, {
      stage: "grouping",
      processed: likedSongs.length,
      total: likedSongs.length,
    });
  }

  const playlists: GenrePlaylist[] = Array.from(groups.entries())
    .map(([key, value]) => {
      const count = value.songs.length;
      const genreName = value.label;
      const name = `${genreName} • Curtidas`;
      const description = createGenreDescription(genreName, count);

      return {
        key,
        genre: genreName,
        name,
        description,
        count,
        songs: value.songs,
      };
    })
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));

  if (statusContext && statusBroadcaster.hasSubscribers()) {
    const sampleSongs = playlists
      .flatMap((playlist) =>
        playlist.songs
          .slice(0, 3)
          .map((song) => `${song.title} — ${song.artist}`)
      )
      .filter(Boolean)
      .slice(0, 80);

    statusBroadcaster.genreComplete(statusContext, {
      totalPlaylists: playlists.length,
      totalSongs: likedSongs.length,
      songs: sampleSongs,
    });
  }

  return playlists;
}

async function loadOrGeneratePlaylistsForPreview(
  modelName?: string,
  statusContext?: StatusContext
): Promise<Playlist[]> {
  if (!modelName) {
    try {
      log("Attempting to load saved playlists for preview");
      const savedPlaylists = await fs.readFile(savedPlaylistsPath, "utf8");
      log("Using saved playlists from disk");
      return JSON.parse(savedPlaylists) as Playlist[];
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "ENOENT") {
        log(`Failed to load saved playlists: ${error}`);
        throw error;
      }

      log(
        "saved_playlists.json not found. Generating new playlists for preview."
      );
    }
  }

  const likedSongs = await getAllLikedSongs(statusContext);
  const playlists = await generatePlaylistsWithGemini(likedSongs, modelName);
  if (!modelName) {
    await fs.writeFile(savedPlaylistsPath, JSON.stringify(playlists, null, 2));
    log("New playlists generated and saved to disk");
  }
  return playlists;
}

app.listen(port, () => {
  log(`Server running at http://localhost:${port}`);
});
