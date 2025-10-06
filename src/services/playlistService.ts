import { promises as fs } from "fs";
import axios from "axios";
import {
  ChatMessage,
  ChatPlaylistContext,
  GenrePlaylist,
  LikedSong,
  Playlist,
  Song,
  TrackSearchCandidate,
  UnresolvedTrackSelection,
} from "../interfaces";
import statusBroadcaster, { StatusContext } from "./statusBroadcaster";
import { savedPlaylistsPath } from "../config/paths";
import { log } from "../utils/logger";
import { formatSpotifyError } from "../utils/errors";
import { sleep } from "../utils/sleep";
import {
  extractArtistTokens,
  extractSpotifyPlaylistId,
  normalizeForMatch,
} from "../utils/spotify";
import { RequestQueue } from "./requestQueue";
import { spotifyApi } from "./spotifyClient";
import {
  generateCustomPlaylistWithGemini,
  generatePlaylistsWithGemini,
  resolveMissingTracksWithGemini,
  sanitizeChatPlaylistContext,
  normalizeChatMessages,
} from "./geminiService";
import { geminiConfig } from "../config/env";

export const requestQueue = new RequestQueue();

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
  { key: "electronic", label: "Electronic", test: /electro|electronic|synth/i },
  { key: "dance", label: "Dance", test: /\bdance\b/i },
  { key: "metal", label: "Metal", test: /\bmetal\b/i },
  { key: "punk", label: "Punk", test: /\bpunk\b/i },
  { key: "indie", label: "Indie", test: /\bindie\b/i },
  { key: "latin", label: "Latin", test: /latin|reggaeton|cumbia|bossa|samba|mpb/i },
  { key: "country", label: "Country", test: /\bcountry\b/i },
  { key: "folk", label: "Folk", test: /\bfolk\b/i },
  { key: "classical", label: "Classical", test: /classical|orchestral|baroque/i },
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
  if (!genre) return "No genre";
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
  const plural = count === 1 ? "track" : "tracks";
  if (genre === "No genre") {
    return `${count} favorite ${plural} without a defined genre yet.`;
  }
  return `${count} liked ${plural} channeling the energy of ${genre}. Perfect for diving into the vibe.`;
}

function resolveGenreGroup(genres: string[]): { key: string; label: string } {
  if (!genres?.length) {
    return { key: "no-genre", label: "No genre" };
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

export async function getAllLikedSongs(
  statusContext?: StatusContext
): Promise<LikedSong[]> {
  let allTracks: LikedSong[] = [];
  let offset = 0;
  const limit = 50;
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
      artistId: item.track.artists[0]?.id ?? undefined,
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

export function buildCandidateFromTrack(
  track: SpotifyApi.TrackObjectFull | null | undefined
): TrackSearchCandidate | null {
  if (!track?.uri || !track.name) {
    return null;
  }

  const artistNames = (track.artists ?? [])
    .map((artist) => artist?.name)
    .filter(Boolean)
    .join(", ");

  if (!artistNames) {
    return null;
  }

  const releaseDate = track.album?.release_date;
  let releaseYear: number | undefined;
  if (releaseDate) {
    const yearMatch = releaseDate.match(/^(\d{4})/);
    if (yearMatch) {
      releaseYear = Number(yearMatch[1]);
    }
  }

  return {
    uri: track.uri,
    title: track.name,
    artist: artistNames,
    album: track.album?.name ?? undefined,
    popularity:
      typeof track.popularity === "number" && track.popularity >= 0
        ? track.popularity
        : undefined,
    previewUrl: track.preview_url ?? null,
    explicit: typeof track.explicit === "boolean" ? track.explicit : undefined,
    durationMs:
      typeof track.duration_ms === "number" ? track.duration_ms : undefined,
    releaseYear,
  };
}

export function trackMatchesRequested(
  track: SpotifyApi.TrackObjectFull | null | undefined,
  song: Song
): boolean {
  if (!track?.name || !song?.title || !song?.artist) {
    return false;
  }

  const trackTitle = normalizeForMatch(track.name);
  const requestedTitle = normalizeForMatch(song.title);

  if (!trackTitle || !requestedTitle) {
    return false;
  }

  const titleMatch =
    trackTitle === requestedTitle ||
    trackTitle.includes(requestedTitle) ||
    requestedTitle.includes(trackTitle);

  if (!titleMatch) {
    return false;
  }

  const trackArtists = (track.artists ?? [])
    .map((artist) => normalizeForMatch(artist?.name))
    .filter(Boolean);

  if (!trackArtists.length) {
    return false;
  }

  const requestedArtists = extractArtistTokens(song.artist);
  if (!requestedArtists.length) {
    return false;
  }

  return requestedArtists.some((artistToken) =>
    trackArtists.some(
      (candidate) =>
        candidate === artistToken ||
        candidate.includes(artistToken) ||
        artistToken.includes(candidate)
    )
  );
}

export async function findTrackUris(
  songs: Song[],
  playlistName?: string
): Promise<{ uris: (string | undefined)[]; unresolved: UnresolvedTrackSelection[] }> {
  const delayBetweenSongsMs = 120;
  const uris: (string | undefined)[] = new Array(songs.length).fill(undefined);
  const unresolved: UnresolvedTrackSelection[] = [];

  const queriesForSong = (song: Song): string[] => {
    const rawQueries = [
      `track:${song.title} artist:${song.artist}`,
      `${song.title} ${song.artist}`,
      `${song.title}`,
    ];

    return Array.from(
      new Set(
        rawQueries
          .map((query) => query.trim())
          .filter((query) => Boolean(query))
      )
    );
  };

  for (let index = 0; index < songs.length; index += 1) {
    const song = songs[index];

    const result = await requestQueue.add(async () => {
      const queries = queriesForSong(song);

      for (let attempt = 0; attempt < queries.length; attempt += 1) {
        const query = queries[attempt];

        try {
          const searchResponse = await spotifyApi.searchTracks(query, { limit: 20 });

          const items = searchResponse.body.tracks?.items ?? [];

          if (!items.length) {
            continue;
          }

          const matched = items.find((item) =>
            trackMatchesRequested(item, song)
          );

          if (matched?.uri) {
            log(
              `Matched track for "${song.title}" by ${song.artist} from search (${query})$${
                playlistName ? ` in playlist "${playlistName}"` : ""
              }`
            );
            return { uri: matched.uri };
          }

          const candidates = items
            .map((item) => buildCandidateFromTrack(item))
            .filter((candidate): candidate is TrackSearchCandidate => Boolean(candidate))
            .slice(0, 10);

          log(
            `Deferring track selection for "${song.title}" by ${song.artist}; sending top ${candidates.length} results to Gemini.`
          );

          return {
            unresolved: {
              index,
              requested: { ...song },
              searchQuery: query,
              candidates,
            },
          };
        } catch (error) {
          if ((error as any)?.statusCode === 429) {
            throw error;
          }

          log(
            `Error searching for track "${song.title}" by ${song.artist} with query "${query}": ${formatSpotifyError(
              error
            )}`
          );
        }
      }

      const fallbackQuery = queries[0] ?? `${song.title} ${song.artist}`;
      log(
        `No Spotify results for "${song.title}" by ${song.artist}. Marking as unresolved.`
      );

      return {
        unresolved: {
          index,
          requested: { ...song },
          searchQuery: fallbackQuery,
          candidates: [],
        },
      };
    });

    if (result?.uri) {
      uris[index] = result.uri;
    } else if (result?.unresolved) {
      unresolved.push(result.unresolved);
    }

    if (index < songs.length - 1) {
      await sleep(delayBetweenSongsMs);
    }
  }

  return { uris, unresolved };
}

function sanitizePlaylistData(playlist: Playlist): Playlist {
  return {
    name: playlist.name.trim().slice(0, 100),
    description: playlist.description.trim().slice(0, 300),
    songs: playlist.songs,
  };
}

export function broadcastPlaylistSongs(
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

export async function generateOrLoadPlaylists(
  likedSongs: LikedSong[],
  modelName?: string
): Promise<Playlist[]> {
  if (!modelName) {
    try {
      log("Attempting to load saved playlists");
      const savedPlaylists = await fs.readFile(savedPlaylistsPath, "utf8");
      log("Using saved playlists");
      return JSON.parse(savedPlaylists) as Playlist[];
    } catch (error) {
      log("No saved playlists found, generating new ones");
    }
  }

  log(
    `Generating new playlists${
      modelName ? ` with Gemini model ${modelName}` : ""
    }`
  );
  return generatePlaylistsWithGemini(likedSongs, modelName);
}

export async function loadOrGeneratePlaylistsForPreview(
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

export async function generateGenrePlaylists(
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
        spotifyApi.getArtists(batch)
      );

      const artists = response.body.artists ?? [];
      artists.forEach((artist) => {
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
      const name = `${genreName} • Liked`;
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

export async function fetchGeminiModels() {
  log("Fetching Gemini model catalog");
  const response = await axios.get(
    "https://generativelanguage.googleapis.com/v1beta/models",
    {
      params: {
        key: geminiConfig.apiKey,
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

  return { models, defaultModel: geminiConfig.defaultModel };
}

export function sanitizeChatPayload(body: unknown): {
  messages: ChatMessage[];
  modelName?: string;
  playlistContext?: ChatPlaylistContext;
} {
  const source = body as Record<string, unknown> | undefined;
  const messages = normalizeChatMessages(source?.messages);
  const modelName =
    typeof source?.model === "string" ? source.model.trim() || undefined : undefined;
  const playlistContext = sanitizeChatPlaylistContext(source?.playlist);

  return {
    messages,
    modelName,
    playlistContext: playlistContext ?? undefined,
  };
}

export function validateLatestMessage(messages: ChatMessage[]): void {
  const latest = messages[messages.length - 1];
  if (!latest || latest.role !== "user") {
    throw new Error("Last message must come from the user.");
  }
}

export async function createCustomPlaylist(
  userPrompt: string,
  modelName?: string
): Promise<Playlist> {
  const trimmedPrompt = userPrompt?.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt must not be empty.");
  }

  return generateCustomPlaylistWithGemini(trimmedPrompt, modelName);
}

export async function resolveUnresolvedTracks(
  playlist: Playlist,
  unresolved: UnresolvedTrackSelection[],
  modelName?: string
): Promise<{
  uris: (string | undefined)[];
  resolvedCount: number;
}> {
  if (!unresolved.length) {
    return { uris: [], resolvedCount: 0 };
  }

  const resolutionMap = await resolveMissingTracksWithGemini(
    {
      name: playlist.name,
      description: playlist.description,
    },
    unresolved,
    modelName
  );

  const uris: (string | undefined)[] = [];
  let resolvedCount = 0;

  unresolved.forEach((item) => {
    const candidate = resolutionMap.get(item.index);
    uris[item.index] = candidate?.uri;

    if (candidate) {
      resolvedCount += 1;
      playlist.songs[item.index] = {
        ...playlist.songs[item.index],
        title: candidate.title,
        artist: candidate.artist,
      };
    }
  });

  return { uris, resolvedCount };
}

export function sanitizePlaylist(playlist: Playlist): Playlist {
  return sanitizePlaylistData(playlist);
}

export { extractSpotifyPlaylistId };