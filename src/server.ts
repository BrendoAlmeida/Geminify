import express, { Request, Response } from "express";
import SpotifyWebApi from "spotify-web-api-node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RequestQueue } from "./requestQueue";
import { formatSpotifyError } from "./utils";
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

const requestQueue = new RequestQueue();

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
]);

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
  const scopes = ["user-library-read", "playlist-modify-private"];
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
  try {
    log("Fetching liked songs");
    const allLikedSongs = await getAllLikedSongs();
    log(`Fetched ${allLikedSongs.length} liked songs`);
    res.json(allLikedSongs);
  } catch (error) {
    log(`Error fetching liked songs: ${error}`);
    res.status(500).send(`Error: ${(error as Error).message}`);
  }
});

app.get("/generate-playlists", async (req: Request, res: Response) => {
  try {
    log("Generating playlists");
    const likedSongs = await getAllLikedSongs();
    const selectedModel =
      typeof req.query.model === "string" ? req.query.model : undefined;
    const playlists = await generateOrLoadPlaylists(likedSongs, selectedModel);

    await fs.writeFile(savedPlaylistsPath, JSON.stringify(playlists, null, 2));
    log(`Generated ${playlists.length} playlists and saved to file`);

    res.json(playlists);
  } catch (error) {
    log(`Error generating playlists: ${error}`);
    res.status(500).send(`Error: ${(error as Error).message}`);
  }
});

async function findTrackUris(
  songs: { title: string; artist: string }[]
): Promise<(string | undefined)[]> {
  const batchSize = 20; // Spotify allows up to 20 tracks per request
  const batches = [];

  for (let i = 0; i < songs.length; i += batchSize) {
    batches.push(songs.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      return requestQueue.add(async () => {
        const uris = await Promise.all(
          batch.map(async (song) => {
            try {
              // First, try to find the exact song
              const exactSearch = await spotifyApi.searchTracks(
                `track:${song.title} artist:${song.artist}`
              );
              if (exactSearch.body.tracks?.items.length ?? 0 > 0) {
                log(`Found exact track: ${song.title} by ${song.artist}`);
                return exactSearch.body.tracks?.items[0].uri;
              }

              // If exact song not found, search for the artist's top tracks
              log(
                `Could not find exact track: ${song.title} by ${song.artist} Searching for artist: ${song.artist}`
              );
              const artistSearch = await spotifyApi.searchArtists(song.artist);
              if (artistSearch.body.artists?.items.length ?? 0 > 0) {
                const artistId = artistSearch.body.artists!.items[0].id;
                const topTracks = await spotifyApi.getArtistTopTracks(
                  artistId,
                  "US"
                );
                if (topTracks.body.tracks.length > 0) {
                  // Randomly select one of the top 5 tracks (or fewer if there aren't 5)
                  const randomIndex = Math.floor(
                    Math.random() * Math.min(5, topTracks.body.tracks.length)
                  );
                  log(`Found track for artist: ${song.artist}`);
                  return topTracks.body.tracks[randomIndex].uri;
                }
              }
              log(`No tracks found for artist: ${song.artist}`);
              return undefined;
            } catch (error) {
              log(
                `Error searching for track "${song.title}" by ${song.artist}: ${formatSpotifyError(error)}`
              );
              return undefined;
            }
          })
        );
        return uris;
      });
    })
  );

  return results.flat();
}

function sanitizePlaylistData(playlist: Playlist): Playlist {
  return {
    name: playlist.name.trim().slice(0, 100), // Spotify has a 100 character limit for playlist names
    description: playlist.description.trim().slice(0, 300), // 300 character limit for descriptions
    songs: playlist.songs,
  };
}

app.get("/preview-playlists", async (_req: Request, res: Response) => {
  try {
    await refreshTokenIfNeeded();

    log("Fetching all playlists for preview");
    const modelName =
      typeof _req.query.model === "string" ? _req.query.model : undefined;
    const playlists = await loadOrGeneratePlaylistsForPreview(modelName);

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
    res.status(500).json({ error: errorMessage });
  }
});

app.post("/create-custom-playlist", async (req: Request, res: Response) => {
  try {
    await refreshTokenIfNeeded();

    const userPrompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
    if (!userPrompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    log(`Received custom playlist prompt: ${userPrompt}`);

    const modelName =
      typeof req.body.model === "string" ? req.body.model.trim() : undefined;
    const customPlaylist = await generateCustomPlaylistWithGemini(
      userPrompt,
      modelName
    );
    const sanitizedPlaylist = sanitizePlaylistData(customPlaylist);
    const trackUris = await findTrackUris(sanitizedPlaylist.songs);

    const validTrackUris = trackUris.filter(
      (uri): uri is string => uri !== undefined
    );

    if (validTrackUris.length === 0) {
      return res
        .status(404)
        .json({ error: "No valid tracks found for the custom playlist" });
    }

    const newPlaylist = await requestQueue.add(() =>
      spotifyApi.createPlaylist(sanitizedPlaylist.name, {
        description: sanitizedPlaylist.description,
        public: false,
      })
    );

    await requestQueue.add(() =>
      spotifyApi.addTracksToPlaylist(newPlaylist.body.id, validTrackUris)
    );

    res.json({
      playlist: {
        id: newPlaylist.body.id,
        name: sanitizedPlaylist.name,
        description: sanitizedPlaylist.description,
        embedUrl: `https://open.spotify.com/embed/playlist/${newPlaylist.body.id}?utm_source=generator`,
        spotifyUrl: `https://open.spotify.com/playlist/${newPlaylist.body.id}`,
        songs: sanitizedPlaylist.songs,
      },
    });
  } catch (error) {
    const errorMessage = formatSpotifyError(error);
    log(`Error creating custom playlist:\n${errorMessage}`);
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

async function getAllLikedSongs(): Promise<LikedSong[]> {
  let allTracks: LikedSong[] = [];
  let offset = 0;
  const limit = 50; // Spotify API allows a maximum of 50 tracks per request
  let total: number;

  do {
    log(`Fetching liked songs: offset ${offset}`);
    const data = await spotifyApi.getMySavedTracks({ limit, offset });
    total = data.body.total;

    const tracks: LikedSong[] = data.body.items.map((item) => ({
      name: item.track.name,
      artist: item.track.artists[0].name,
      id: item.track.id,
    }));

    allTracks = allTracks.concat(tracks);
    offset += limit;
    log(`Fetched ${allTracks.length}/${total} liked songs`);
  } while (offset < total);

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

async function loadOrGeneratePlaylistsForPreview(
  modelName?: string
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

  const likedSongs = await getAllLikedSongs();
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
