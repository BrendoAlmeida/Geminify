import { promises as fs } from "fs";
import axios from "axios";
import statusBroadcaster from "./statusBroadcaster.js";
import { savedPlaylistsPath } from "../config/paths.js";
import { log } from "../utils/logger.js";
import { formatSpotifyError } from "../utils/errors.js";
import { sleep } from "../utils/sleep.js";
import { extractArtistTokens, extractSpotifyPlaylistId, normalizeForMatch, } from "../utils/spotify.js";
import { RequestQueue } from "./requestQueue.js";
import { generateCustomPlaylistWithGemini, generatePlaylistsWithGemini, resolveMissingTracksWithGemini, sanitizeChatPlaylistContext, normalizeChatMessages, } from "./geminiService.js";
import { geminiConfig } from "../config/env.js";
export const requestQueue = new RequestQueue();
const GENRE_KEYWORDS = [
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
function formatGenreChunk(chunk) {
    if (!chunk)
        return "";
    if (chunk.length <= 3) {
        return chunk.toUpperCase();
    }
    return chunk.charAt(0).toUpperCase() + chunk.slice(1);
}
function formatGenreName(genre) {
    if (!genre)
        return "No genre";
    return genre
        .split(/[\s/]+/)
        .map((segment) => segment
        .split("-")
        .map((part) => formatGenreChunk(part))
        .join("-"))
        .join(" ");
}
function createGenreDescription(genre, count) {
    const plural = count === 1 ? "track" : "tracks";
    if (genre === "No genre") {
        return `${count} favorite ${plural} without a defined genre yet.`;
    }
    return `${count} liked ${plural} channeling the energy of ${genre}. Perfect for diving into the vibe.`;
}
function resolveGenreGroup(genres) {
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
export async function getAllLikedSongs(userSpotifyApi, statusContext) {
    let allTracks = [];
    let offset = 0;
    const limit = 50;
    let total;
    const shouldBroadcast = Boolean(statusContext && statusBroadcaster.hasSubscribers());
    const maxBroadcast = 120;
    let broadcastCount = 0;
    let hasAnnounced = false;
    do {
        log(`Fetching liked songs: offset ${offset}`);
        const data = await userSpotifyApi.getMySavedTracks({ limit, offset });
        total = data.body.total;
        if (shouldBroadcast && !hasAnnounced) {
            statusBroadcaster.likedStart(statusContext, { total });
            hasAnnounced = true;
        }
        const tracks = data.body.items.map((item) => ({
            name: item.track.name,
            artist: item.track.artists[0]?.name ?? "",
            id: item.track.id,
            artistId: item.track.artists[0]?.id ?? undefined,
            artistIds: item.track.artists.map((artist) => artist.id).filter(Boolean),
        }));
        tracks.forEach((track, index) => {
            allTracks.push(track);
            if (shouldBroadcast && broadcastCount < maxBroadcast) {
                statusBroadcaster.likedSong(statusContext, {
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
        statusBroadcaster.likedComplete(statusContext, {
            total: allTracks.length,
        });
    }
    return allTracks;
}
export function buildCandidateFromTrack(track) {
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
    let releaseYear;
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
        popularity: typeof track.popularity === "number" && track.popularity >= 0
            ? track.popularity
            : undefined,
        previewUrl: track.preview_url ?? null,
        explicit: typeof track.explicit === "boolean" ? track.explicit : undefined,
        durationMs: typeof track.duration_ms === "number" ? track.duration_ms : undefined,
        releaseYear,
    };
}
export function trackMatchesRequested(track, song) {
    if (!track?.name || !song?.title || !song?.artist) {
        return false;
    }
    const trackTitle = normalizeForMatch(track.name);
    const requestedTitle = normalizeForMatch(song.title);
    if (!trackTitle || !requestedTitle) {
        return false;
    }
    const titleMatch = trackTitle === requestedTitle ||
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
    return requestedArtists.some((artistToken) => trackArtists.some((candidate) => candidate === artistToken ||
        candidate.includes(artistToken) ||
        artistToken.includes(candidate)));
}
export async function findTrackUris(userSpotifyApi, songs, playlistName) {
    const delayBetweenSongsMs = 120;
    const uris = new Array(songs.length).fill(undefined);
    const unresolved = [];
    const queriesForSong = (song) => {
        const rawQueries = [
            `track:${song.title} artist:${song.artist}`,
            `${song.title} ${song.artist}`,
            `${song.title}`,
        ];
        return Array.from(new Set(rawQueries
            .map((query) => query.trim())
            .filter((query) => Boolean(query))));
    };
    for (let index = 0; index < songs.length; index += 1) {
        const song = songs[index];
        const result = await requestQueue.add(async () => {
            const queries = queriesForSong(song);
            for (let attempt = 0; attempt < queries.length; attempt += 1) {
                const query = queries[attempt];
                try {
                    const searchResponse = await userSpotifyApi.searchTracks(query, { limit: 20 });
                    const items = searchResponse.body.tracks?.items ?? [];
                    if (!items.length) {
                        continue;
                    }
                    const matched = items.find((item) => trackMatchesRequested(item, song));
                    if (matched?.uri) {
                        log(`Matched track for "${song.title}" by ${song.artist} from search (${query})$${playlistName ? ` in playlist "${playlistName}"` : ""}`);
                        return { uri: matched.uri };
                    }
                    const candidates = items
                        .map((item) => buildCandidateFromTrack(item))
                        .filter((candidate) => Boolean(candidate))
                        .slice(0, 10);
                    log(`Deferring track selection for "${song.title}" by ${song.artist}; sending top ${candidates.length} results to Gemini.`);
                    return {
                        unresolved: {
                            index,
                            requested: { ...song },
                            searchQuery: query,
                            candidates,
                        },
                    };
                }
                catch (error) {
                    if (error?.statusCode === 429) {
                        throw error;
                    }
                    log(`Error searching for track "${song.title}" by ${song.artist} with query "${query}": ${formatSpotifyError(error)}`);
                }
            }
            const fallbackQuery = queries[0] ?? `${song.title} ${song.artist}`;
            log(`No Spotify results for "${song.title}" by ${song.artist}. Marking as unresolved.`);
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
        }
        else if (result?.unresolved) {
            unresolved.push(result.unresolved);
        }
        if (index < songs.length - 1) {
            await sleep(delayBetweenSongsMs);
        }
    }
    return { uris, unresolved };
}
function sanitizePlaylistData(playlist) {
    return {
        name: playlist.name.trim().slice(0, 100),
        description: playlist.description.trim().slice(0, 300),
        songs: playlist.songs,
    };
}
export function broadcastPlaylistSongs(playlists, statusContext) {
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
export async function generateOrLoadPlaylists(likedSongs, modelName) {
    if (!modelName) {
        try {
            log("Attempting to load saved playlists");
            const savedPlaylists = await fs.readFile(savedPlaylistsPath, "utf8");
            log("Using saved playlists");
            return JSON.parse(savedPlaylists);
        }
        catch (error) {
            log("No saved playlists found, generating new ones");
        }
    }
    log(`Generating new playlists${modelName ? ` with Gemini model ${modelName}` : ""}`);
    return generatePlaylistsWithGemini(likedSongs, modelName);
}
export async function loadOrGeneratePlaylistsForPreview(userSpotifyApi, modelName, statusContext) {
    if (!modelName) {
        try {
            log("Attempting to load saved playlists for preview");
            const savedPlaylists = await fs.readFile(savedPlaylistsPath, "utf8");
            log("Using saved playlists from disk");
            return JSON.parse(savedPlaylists);
        }
        catch (error) {
            const nodeError = error;
            if (nodeError?.code !== "ENOENT") {
                log(`Failed to load saved playlists: ${error}`);
                throw error;
            }
            log("saved_playlists.json not found. Generating new playlists for preview.");
        }
    }
    const likedSongs = await getAllLikedSongs(userSpotifyApi, statusContext);
    const playlists = await generatePlaylistsWithGemini(likedSongs, modelName);
    if (!modelName) {
        await fs.writeFile(savedPlaylistsPath, JSON.stringify(playlists, null, 2));
        log("New playlists generated and saved to disk");
    }
    return playlists;
}
export async function generateGenrePlaylists(userSpotifyApi, statusContext) {
    const likedSongs = await getAllLikedSongs(userSpotifyApi, statusContext);
    if (!likedSongs.length) {
        return [];
    }
    const allArtistIds = likedSongs
        .flatMap((song) => song.artistIds ?? (song.artistId ? [song.artistId] : []))
        .filter((id) => Boolean(id));
    const uniqueArtistIds = Array.from(new Set(allArtistIds));
    if (statusContext && statusBroadcaster.hasSubscribers()) {
        statusBroadcaster.genreStart(statusContext, {
            totalSongs: likedSongs.length,
            totalArtists: uniqueArtistIds.length,
        });
    }
    const artistGenreMap = new Map();
    const artistBatchSize = 50;
    let processedArtists = 0;
    for (let i = 0; i < uniqueArtistIds.length; i += artistBatchSize) {
        const batch = uniqueArtistIds.slice(i, i + artistBatchSize);
        try {
            const response = await requestQueue.add(() => userSpotifyApi.getArtists(batch));
            const artists = response.body.artists ?? [];
            artists.forEach((artist) => {
                if (artist?.id) {
                    artistGenreMap.set(artist.id, artist.genres ?? []);
                }
            });
        }
        catch (error) {
            log(`Error fetching artist genres for batch: ${formatSpotifyError(error)}`);
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
    const groups = new Map();
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
        const group = groups.get(key);
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
    const playlists = Array.from(groups.entries())
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
            .flatMap((playlist) => playlist.songs
            .slice(0, 3)
            .map((song) => `${song.title} — ${song.artist}`))
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
    const response = await axios.get("https://generativelanguage.googleapis.com/v1beta/models", {
        params: {
            key: geminiConfig.apiKey,
            pageSize: 50,
        },
    });
    const models = (response.data.models ?? [])
        .filter((model) => (model?.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((model) => ({
        name: model.name,
        displayName: model.displayName ?? model.name,
        description: model.description ?? "",
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
    }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { models, defaultModel: geminiConfig.defaultModel };
}
export function sanitizeChatPayload(body) {
    const source = body;
    const messages = normalizeChatMessages(source?.messages);
    const modelName = typeof source?.model === "string" ? source.model.trim() || undefined : undefined;
    const playlistContext = sanitizeChatPlaylistContext(source?.playlist);
    return {
        messages,
        modelName,
        playlistContext: playlistContext ?? undefined,
    };
}
export function validateLatestMessage(messages) {
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== "user") {
        throw new Error("Last message must come from the user.");
    }
}
export async function createCustomPlaylist(userPrompt, modelName) {
    const trimmedPrompt = userPrompt?.trim();
    if (!trimmedPrompt) {
        throw new Error("Prompt must not be empty.");
    }
    return generateCustomPlaylistWithGemini(trimmedPrompt, modelName);
}
export async function resolveUnresolvedTracks(playlist, unresolved, modelName) {
    if (!unresolved.length) {
        return { uris: [], resolvedCount: 0 };
    }
    const resolutionMap = await resolveMissingTracksWithGemini({
        name: playlist.name,
        description: playlist.description,
    }, unresolved, modelName);
    const uris = [];
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
export function sanitizePlaylist(playlist) {
    return sanitizePlaylistData(playlist);
}
export { extractSpotifyPlaylistId };
