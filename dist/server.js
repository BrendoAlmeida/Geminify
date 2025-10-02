import express from "express";
import SpotifyWebApi from "spotify-web-api-node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RequestQueue } from "./requestQueue";
import { exponentialBackoff, formatSpotifyError } from "./utils";
import statusBroadcaster from "./statusBroadcaster";
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
function getGeminiModel(modelName) {
    return geminiClient.getGenerativeModel({
        model: modelName ?? geminiDefaultModelName,
        generationConfig: {
            responseMimeType: "application/json",
        },
    });
}
const tokenPath = path.join(__dirname, "..", "token.json");
const requestQueue = new RequestQueue();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_CHAT_MESSAGES = 12;
const MAX_CHAT_MESSAGE_LENGTH = 1200;
const MAX_MIX_TRACKS = 350;
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
class MissingTokenError extends Error {
    constructor(message = "Spotify authentication required.") {
        super(message);
        this.name = "MissingTokenError";
    }
}
// Logging function
const log = (message) => {
    if (isDevelopment) {
        console.log(`[${new Date().toISOString()}] ${message}`);
    }
};
const playlistPatterns = [
    /playlist\/([A-Za-z0-9]{16,})/i,
    /spotify:playlist:([A-Za-z0-9]{16,})/i,
];
function extractSpotifyPlaylistId(reference) {
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
function parseGeminiJson(rawText) {
    let text = rawText.trim();
    if (text.startsWith("```")) {
        text = text
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```$/i, "")
            .trim();
    }
    try {
        return JSON.parse(text);
    }
    catch (error) {
        const snippet = text.slice(0, 500);
        log(`Failed to parse Gemini response: ${snippet}${text.length > 500 ? "..." : ""}`);
        throw new Error("Gemini response was not valid JSON");
    }
}
async function generateGeminiJson(prompt, modelName) {
    log("Sending request to Gemini API");
    const model = getGeminiModel(modelName);
    const result = await model.generateContent(prompt);
    log("Received response from Gemini API");
    const text = result.response.text();
    return parseGeminiJson(text);
}
function sanitizeStringArray(value, limit = 8) {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set();
    const result = [];
    for (const entry of value) {
        if (typeof entry !== "string") {
            continue;
        }
        const trimmed = entry.trim();
        if (!trimmed) {
            continue;
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(trimmed);
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}
function sanitizeChatPlaylistContext(raw) {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const description = typeof raw.description === "string"
        ? raw.description.trim()
        : undefined;
    if (!id || !name) {
        return undefined;
    }
    const songsInput = Array.isArray(raw.songs) ? raw.songs : [];
    const songs = [];
    for (const entry of songsInput) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const titleRaw = typeof entry.title === "string"
            ? entry.title
            : typeof entry.name === "string"
                ? entry.name
                : "";
        const artistRaw = typeof entry.artist === "string"
            ? entry.artist
            : typeof entry.artistName === "string"
                ? entry.artistName
                : "";
        const title = titleRaw.trim();
        const artist = artistRaw.trim();
        if (!title || !artist) {
            continue;
        }
        songs.push({ title, artist });
        if (songs.length >= 120) {
            break;
        }
    }
    return {
        id,
        name,
        description,
        songs,
    };
}
function normalizeChatMessages(rawMessages) {
    if (!Array.isArray(rawMessages)) {
        return [];
    }
    const normalized = [];
    for (const entry of rawMessages) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const role = entry.role;
        const content = entry.content;
        if (role !== "user" && role !== "assistant") {
            continue;
        }
        if (typeof content !== "string") {
            continue;
        }
        const trimmed = content.trim();
        if (!trimmed) {
            continue;
        }
        normalized.push({
            role,
            content: trimmed.slice(0, MAX_CHAT_MESSAGE_LENGTH),
        });
    }
    if (!normalized.length) {
        return [];
    }
    return normalized.slice(-MAX_CHAT_MESSAGES);
}
function buildChatPrompt(messages, playlistContext) {
    const transcript = messages
        .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
        .join("\n");
    let playlistSection = "";
    if (playlistContext) {
        const songList = (playlistContext.songs || [])
            .slice(0, 40)
            .map((song) => `- ${song.title} — ${song.artist}`)
            .join("\n");
        const details = [
            "",
            "Existing playlist to enhance:",
            `Name: ${playlistContext.name}`,
        ];
        if (playlistContext.description) {
            details.push(`Description: ${playlistContext.description}`);
        }
        details.push(`Song count: ${playlistContext.songs.length}`);
        if (songList) {
            details.push("Current tracklist highlights:");
            details.push(songList);
        }
        playlistSection = `${details.join("\n")}\n`;
    }
    return `You are Geminify's playlist ideation assistant. Your task is to help users shape playlist ideas, moods, storylines, and track inspirations.

${playlistContext ? `The user wants to enhance the Spotify playlist described below. Respect what already works and suggest thoughtful evolutions.${playlistSection}\n` : ""}

Conversation so far:
${transcript}

Reply to the most recent user message. Respond in the same language the user used.

Return ONLY a JSON object with the following shape:
{
  "reply": "Your conversational reply to the user (1-3 sentences)",
  "themeTags": ["Short mood or context tags"],
  "songExamples": ["Song Title — Artist"]
}

Rules:
- Always include the "reply" field with friendly, practical guidance.
- Provide up to 6 concise theme tags capturing moods, genres, settings, or references. Use [] if no tags are appropriate.
- Provide up to 6 song examples as strings with track names (optionally artists). Use [] if you cannot suggest songs confidently.
- Avoid duplicate tags or songs. Return valid JSON without markdown fences or commentary.
- When a playlist is supplied, reference it in your reply, highlight complementary additions, and only suggest replacing existing songs if it improves flow significantly.`;
}
async function generateChatSuggestion(messages, modelName, playlistContext) {
    if (!messages.length) {
        throw new Error("Chat messages are required");
    }
    const prompt = buildChatPrompt(messages, playlistContext);
    const response = await generateGeminiJson(prompt, modelName);
    const reply = typeof response.reply === "string" ? response.reply.trim() : "";
    if (!reply) {
        throw new Error("Gemini response did not contain a reply");
    }
    const themeTags = sanitizeStringArray(response.themeTags ?? response.tags);
    const songExamples = sanitizeStringArray(response.songExamples ?? response.songTags);
    return { reply, themeTags, songExamples };
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
    "/chat-ideas",
]);
app.get("/status-stream", (req, res) => {
    statusBroadcaster.handleConnection(req, res);
});
// Middleware to refresh token before each request
app.use(async (req, res, next) => {
    if (publicPaths.has(req.path)) {
        return next();
    }
    try {
        log(`Refreshing token for path: ${req.path}`);
        await refreshTokenIfNeeded();
        next();
    }
    catch (error) {
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
app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});
app.get("/gemini-models", async (_req, res) => {
    try {
        log("Fetching Gemini model catalog");
        const response = await axios.get("https://generativelanguage.googleapis.com/v1beta/models", {
            params: {
                key: geminiApiKey,
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
        res.json({ models, defaultModel: geminiDefaultModelName });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch Gemini models";
        log(`Gemini model fetch failed: ${message}`);
        res.status(500).json({ error: message });
    }
});
app.post("/chat-ideas", async (req, res) => {
    try {
        const normalizedMessages = normalizeChatMessages(req.body?.messages);
        if (!normalizedMessages.length) {
            return res.status(400).json({ error: "Messages are required." });
        }
        const latest = normalizedMessages[normalizedMessages.length - 1];
        if (!latest || latest.role !== "user") {
            return res.status(400).json({ error: "Last message must come from the user." });
        }
        const modelName = typeof req.body?.model === "string" ? req.body.model.trim() : undefined;
        const playlistContext = sanitizeChatPlaylistContext(req.body?.playlist);
        const suggestion = await generateChatSuggestion(normalizedMessages, modelName, playlistContext);
        res.json(suggestion);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to chat with Gemini";
        log(`Chat ideas error: ${message}`);
        if (error instanceof Error && /required/i.test(message)) {
            return res.status(400).json({ error: message });
        }
        res.status(500).json({ error: "We couldn't get suggestions from the model right now." });
    }
});
// Routes
app.get("/login", (_req, res) => {
    log("Initiating Spotify login");
    const scopes = [
        "user-library-read",
        "playlist-modify-private",
        "playlist-modify-public",
        "playlist-read-private",
        "playlist-read-collaborative",
    ];
    res.redirect(spotifyApi.createAuthorizeURL(scopes, "asd"));
});
app.get("/callback", async (req, res) => {
    const { code } = req.query;
    try {
        log("Received callback from Spotify");
        const data = await spotifyApi.authorizationCodeGrant(code);
        const { access_token, refresh_token, expires_in } = data.body;
        await fs.writeFile(tokenPath, JSON.stringify({
            access_token,
            refresh_token,
            expires_at: Date.now() + expires_in * 1000,
        }));
        log("Login successful, tokens saved");
        res.send("Login successful! You can now use the other endpoints.");
    }
    catch (error) {
        log(`Login error: ${error}`);
        res.status(400).send(`Error: ${error.message}`);
    }
});
app.get("/liked-songs", async (_req, res) => {
    const statusContext = statusBroadcaster.hasSubscribers()
        ? statusBroadcaster.createContext("liked-songs")
        : undefined;
    try {
        log("Fetching liked songs");
        const allLikedSongs = await getAllLikedSongs(statusContext);
        log(`Fetched ${allLikedSongs.length} liked songs`);
        res.json(allLikedSongs);
    }
    catch (error) {
        log(`Error fetching liked songs: ${error}`);
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.statusError(statusContext, {
                message: formatSpotifyError(error),
            });
        }
        res.status(500).send(`Error: ${error.message}`);
    }
});
app.get("/generate-playlists", async (req, res) => {
    const statusContext = statusBroadcaster.hasSubscribers()
        ? statusBroadcaster.createContext("generate-playlists")
        : undefined;
    try {
        log("Generating playlists");
        const likedSongs = await getAllLikedSongs(statusContext);
        const selectedModel = typeof req.query.model === "string" ? req.query.model : undefined;
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.geminiStart(statusContext, {
                model: selectedModel ?? geminiDefaultModelName,
                label: "Generating playlists with Gemini…",
            });
        }
        const playlists = await generateOrLoadPlaylists(likedSongs, selectedModel);
        broadcastPlaylistSongs(playlists, statusContext);
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.geminiComplete(statusContext, {
                totalPlaylists: playlists.length,
                label: "Playlists ready!",
            });
        }
        await fs.writeFile(savedPlaylistsPath, JSON.stringify(playlists, null, 2));
        log(`Generated ${playlists.length} playlists and saved to file`);
        res.json(playlists);
    }
    catch (error) {
        log(`Error generating playlists: ${error}`);
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.statusError(statusContext, {
                message: formatSpotifyError(error),
            });
        }
        res.status(500).send(`Error: ${error.message}`);
    }
});
app.get("/genre-playlists", async (_req, res) => {
    const statusContext = statusBroadcaster.hasSubscribers()
        ? statusBroadcaster.createContext("genre-playlists")
        : undefined;
    try {
        await refreshTokenIfNeeded();
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.statusMessage(statusContext, {
                message: "Organizing liked songs by genre…",
            });
        }
        const playlists = await generateGenrePlaylists(statusContext);
        const totalSongs = playlists.reduce((sum, playlist) => sum + playlist.count, 0);
        res.json({
            playlists,
            summary: {
                totalPlaylists: playlists.length,
                totalSongs,
            },
        });
    }
    catch (error) {
        log(`Error generating genre playlists: ${error}`);
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.statusError(statusContext, {
                message: formatSpotifyError(error),
            });
        }
        res.status(500).json({ error: error.message });
    }
});
function normalizeForMatch(value) {
    if (!value) {
        return "";
    }
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function extractArtistTokens(artist) {
    if (!artist) {
        return [];
    }
    const cleaned = artist
        .replace(/\(.*?\)/g, " ")
        .replace(/feat\.?|ft\.?|featuring|with|and|&|×|\//gi, ",")
        .replace(/\s+x\s+/gi, ",")
        .replace(/\s+e\s+/gi, ",");
    return cleaned
        .split(/[,;]+/)
        .map((part) => normalizeForMatch(part))
        .filter(Boolean);
}
function trackMatchesRequested(track, song) {
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
function buildCandidateFromTrack(track) {
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
async function findTrackUris(songs, playlistName) {
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
                    const searchResponse = await exponentialBackoff(() => spotifyApi.searchTracks(query, { limit: 20 }));
                    const items = searchResponse.body.tracks?.items ?? [];
                    if (!items.length) {
                        continue;
                    }
                    const matched = items.find((item) => trackMatchesRequested(item, song));
                    if (matched?.uri) {
                        log(`Matched track for "${song.title}" by ${song.artist} from search (${query})${playlistName ? ` in playlist "${playlistName}"` : ""}`);
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
async function resolveMissingTracksWithGemini(context, unresolved, modelName) {
    if (!unresolved.length) {
        return new Map();
    }
    const payload = {
        playlist: {
            name: context.name,
            description: context.description ?? "",
        },
        unresolved: unresolved.map((item) => ({
            index: item.index,
            requested: item.requested,
            searchQuery: item.searchQuery,
            candidates: item.candidates.map((candidate) => ({
                uri: candidate.uri,
                title: candidate.title,
                artist: candidate.artist,
                album: candidate.album,
                popularity: candidate.popularity,
                explicit: candidate.explicit,
                durationMs: candidate.durationMs,
                releaseYear: candidate.releaseYear,
            })),
        })),
    };
    const prompt = `You are a meticulous music curator helping Geminify finalize Spotify playlists.

We attempted to match several requested songs to Spotify tracks but couldn't confirm the correct version automatically.
Review the unresolved entries and choose the best candidate URI for each song when a confident match exists. If none of the candidates match, return null for that song.

Always prefer candidates where both title and artist align with the requested song. If multiple candidates could work, pick the one with the closest title and primary artist match.

Return ONLY valid JSON matching this schema:
{
  "choices": [
    { "index": number, "selectedUri": "spotify:track:..." | null }
  ]
}

Do not invent URIs that are not listed in the candidates. If unsure, use null.

Here is the data you must consider:
${JSON.stringify(payload)}
`;
    const response = await generateGeminiJson(prompt, modelName);
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const resolution = new Map();
    for (const choice of choices) {
        if (!choice || typeof choice.index !== "number") {
            continue;
        }
        const target = unresolved.find((item) => item.index === choice.index);
        if (!target) {
            continue;
        }
        const selectedUri = typeof choice.selectedUri === "string" && choice.selectedUri.trim()
            ? choice.selectedUri.trim()
            : undefined;
        if (!selectedUri) {
            continue;
        }
        const candidate = target.candidates.find((entry) => entry.uri === selectedUri);
        if (candidate) {
            resolution.set(choice.index, candidate);
        }
    }
    return resolution;
}
function sanitizePlaylistData(playlist) {
    return {
        name: playlist.name.trim().slice(0, 100), // Spotify has a 100 character limit for playlist names
        description: playlist.description.trim().slice(0, 300), // 300 character limit for descriptions
        songs: playlist.songs,
    };
}
function broadcastPlaylistSongs(playlists, statusContext) {
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
app.get("/preview-playlists", async (_req, res) => {
    const statusContext = statusBroadcaster.hasSubscribers()
        ? statusBroadcaster.createContext("preview")
        : undefined;
    try {
        await refreshTokenIfNeeded();
        log("Fetching all playlists for preview");
        const modelName = typeof _req.query.model === "string" ? _req.query.model : undefined;
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.geminiStart(statusContext, {
                model: modelName ?? geminiDefaultModelName,
                label: "Generating surprise playlists…",
            });
        }
        const playlists = await loadOrGeneratePlaylistsForPreview(modelName, statusContext);
        broadcastPlaylistSongs(playlists, statusContext);
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.geminiComplete(statusContext, {
                totalPlaylists: playlists.length,
                label: "Surprise playlists ready!",
            });
        }
        const createdPlaylistIds = [];
        const previewPayload = [];
        for (const playlist of playlists) {
            try {
                log(`Processing playlist: ${playlist.name}`);
                const sanitizedPlaylist = sanitizePlaylistData(playlist);
                const { uris, unresolved } = await findTrackUris(sanitizedPlaylist.songs, sanitizedPlaylist.name);
                if (unresolved.length) {
                    log(`Requesting Gemini assistance for ${unresolved.length} unresolved tracks in "${sanitizedPlaylist.name}".`);
                    const resolutionMap = await resolveMissingTracksWithGemini({
                        name: sanitizedPlaylist.name,
                        description: sanitizedPlaylist.description,
                    }, unresolved, modelName);
                    unresolved.forEach((item) => {
                        const candidate = resolutionMap.get(item.index);
                        if (candidate) {
                            uris[item.index] = candidate.uri;
                            const currentSong = sanitizedPlaylist.songs[item.index];
                            sanitizedPlaylist.songs[item.index] = {
                                ...currentSong,
                                title: candidate.title,
                                artist: candidate.artist,
                            };
                        }
                    });
                    const resolvedCount = resolutionMap.size;
                    if (resolvedCount > 0) {
                        log(`Gemini resolved ${resolvedCount} tracks for "${sanitizedPlaylist.name}".`);
                    }
                    const remaining = unresolved.length - resolvedCount;
                    if (remaining > 0) {
                        log(`${remaining} tracks remain unresolved for "${sanitizedPlaylist.name}".`);
                    }
                }
                const validTrackUris = uris.filter((uri) => typeof uri === "string" && Boolean(uri));
                log(`Found ${validTrackUris.length} valid track URIs for ${playlist.name}`);
                if (validTrackUris.length === 0) {
                    log(`No valid tracks found for playlist: ${playlist.name}`);
                    continue;
                }
                log(`Attempting to create playlist: ${sanitizedPlaylist.name}`);
                log(`Playlist description: ${sanitizedPlaylist.description}`);
                log(`Number of valid tracks: ${validTrackUris.length}`);
                const newPlaylist = await requestQueue.add(() => spotifyApi.createPlaylist(sanitizedPlaylist.name, {
                    description: sanitizedPlaylist.description,
                    public: false,
                }));
                log(`Successfully created playlist: ${newPlaylist.body.id}`);
                const batchSize = 100; // Spotify allows up to 100 tracks per request
                for (let i = 0; i < validTrackUris.length; i += batchSize) {
                    const batch = validTrackUris.slice(i, i + batchSize);
                    await requestQueue.add(() => spotifyApi.addTracksToPlaylist(newPlaylist.body.id, batch));
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
            }
            catch (error) {
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
    }
    catch (error) {
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
app.get("/user-playlists", async (_req, res) => {
    try {
        await refreshTokenIfNeeded();
    }
    catch (error) {
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
        const currentUserDisplayName = meResponse.body?.display_name || currentUserId || undefined;
        const collected = [];
        while (collected.length < maxPlaylists) {
            const response = await requestQueue.add(() => spotifyApi.getUserPlaylists({ limit, offset }));
            const body = response.body;
            const items = body?.items ?? [];
            const total = typeof body?.total === "number" ? body.total : undefined;
            for (const playlist of items) {
                if (!playlist?.id || !playlist?.name)
                    continue;
                const ownerId = playlist.owner?.id ?? "";
                const isOwnedByUser = Boolean(currentUserId && ownerId === currentUserId);
                const isCollaborative = Boolean(playlist.collaborative);
                const canEdit = isOwnedByUser || isCollaborative;
                if (!canEdit) {
                    continue;
                }
                const ownerLabel = isOwnedByUser && currentUserDisplayName
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
            const reachedEnd = !items.length ||
                (typeof total === "number" ? offset >= total : items.length < limit);
            if (reachedEnd) {
                break;
            }
        }
        res.json({ playlists: collected });
    }
    catch (error) {
        const errorMessage = formatSpotifyError(error);
        log(`Error fetching user playlists:\n${errorMessage}`);
        const statusCode = error?.statusCode;
        if (statusCode === 401) {
            await fs.unlink(tokenPath).catch(() => undefined);
            return res.status(401).json({
                error: "We need you to sign in to Spotify again.",
            });
        }
        if (statusCode === 403) {
            await fs.unlink(tokenPath).catch(() => undefined);
            return res.status(403).json({
                error: "Spotify asked for new permissions to list your playlists. Please log in again to continue.",
            });
        }
        res
            .status(500)
            .json({ error: "Failed to load playlists from Spotify." });
    }
});
app.get("/playlist-details", async (req, res) => {
    const rawId = typeof req.query.id === "string" ? req.query.id.trim() : "";
    const playlistId = extractSpotifyPlaylistId(rawId);
    if (!playlistId) {
        return res.status(400).json({ error: "Playlist ID is required." });
    }
    try {
        await refreshTokenIfNeeded();
    }
    catch (error) {
        if (error instanceof MissingTokenError) {
            return res.status(401).json({ error: error.message });
        }
        log(`Failed to refresh token before fetching playlist details: ${error}`);
        return res.status(500).json({ error: "Failed to refresh Spotify token." });
    }
    try {
        const playlistResponse = await requestQueue.add(() => spotifyApi.getPlaylist(playlistId));
        const playlist = playlistResponse.body;
        if (!playlist) {
            throw new Error("Playlist not found.");
        }
        const songs = [];
        const totalTracks = playlist.tracks?.total ?? 0;
        const initialItems = playlist.tracks?.items ?? [];
        initialItems.forEach((item) => {
            const track = item.track;
            if (!track?.name)
                return;
            const artistName = track.artists?.[0]?.name;
            if (!artistName)
                return;
            songs.push({ title: track.name, artist: artistName });
        });
        let offset = initialItems.length;
        const limit = 100;
        while (offset < totalTracks && songs.length < 400) {
            const remaining = totalTracks - offset;
            const batchLimit = Math.min(limit, remaining);
            const batch = await requestQueue.add(() => spotifyApi.getPlaylistTracks(playlistId, { offset, limit: batchLimit }));
            (batch.body.items || []).forEach((item) => {
                const track = item.track;
                if (!track?.name)
                    return;
                const artistName = track.artists?.[0]?.name;
                if (!artistName)
                    return;
                songs.push({ title: track.name, artist: artistName });
            });
            offset += batchLimit;
            if (offset < totalTracks) {
                await sleep(120);
            }
        }
        res.json({
            playlist: {
                id: playlist.id,
                name: playlist.name,
                description: playlist.description ?? "",
                songs,
            },
        });
    }
    catch (error) {
        const statusCode = error?.statusCode ?? error?.body?.error?.status;
        const message = formatSpotifyError(error);
        log(`Playlist details error:
${message}`);
        if (statusCode === 401) {
            return res.status(401).json({ error: "Log in with Spotify to continue." });
        }
        if (statusCode === 403) {
            return res
                .status(403)
                .json({ error: "We don't have permission to view that playlist." });
        }
        if (statusCode === 404) {
            return res.status(404).json({ error: "Playlist not found." });
        }
        res.status(500).json({ error: "Failed to load playlist details." });
    }
});
app.post("/mix-playlist", async (req, res) => {
    const rawInput = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : "";
    const playlistId = extractSpotifyPlaylistId(rawInput) ?? rawInput;
    if (!playlistId) {
        return res.status(400).json({ error: "Playlist ID is required." });
    }
    try {
        await refreshTokenIfNeeded();
    }
    catch (error) {
        if (error instanceof MissingTokenError) {
            return res.status(401).json({ error: error.message });
        }
        log(`Failed to refresh token before mixing playlist: ${error}`);
        return res.status(500).json({ error: "Failed to refresh Spotify token." });
    }
    try {
        const playlistResponse = await requestQueue.add(() => spotifyApi.getPlaylist(playlistId));
        const playlist = playlistResponse.body;
        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found." });
        }
        const profileResponse = await requestQueue.add(() => spotifyApi.getMe());
        const currentUserId = profileResponse.body?.id ?? "";
        const isOwnedByUser = Boolean(currentUserId && playlist.owner?.id === currentUserId);
        if (!isOwnedByUser) {
            return res.status(403).json({
                error: "We can only mix playlists that you created. Pick one you own or copy it to your profile first.",
            });
        }
        const allTracks = await collectPlaylistTracks(playlistId, playlist);
        if (!allTracks.length) {
            return res
                .status(400)
                .json({ error: "Playlist did not contain mixable tracks." });
        }
        const missingUris = allTracks.filter((track) => !track.uri);
        if (missingUris.length) {
            return res.status(400).json({
                error: "Some tracks could not be mixed because they lack Spotify URIs.",
            });
        }
        const mixableTracks = allTracks.slice(0, MAX_MIX_TRACKS);
        const trailingTracks = allTracks.slice(MAX_MIX_TRACKS);
        if (mixableTracks.length) {
            await hydrateAudioFeatures(mixableTracks);
        }
        const orderedSection = mixableTracks.length > 1
            ? buildMixedOrder(mixableTracks.slice())
            : mixableTracks.slice();
        const finalOrder = orderedSection.concat(trailingTracks);
        const changed = finalOrder.some((track, index) => track.originalIndex !== allTracks[index].originalIndex);
        if (changed) {
            await applyPlaylistOrder(playlistId, allTracks, finalOrder);
        }
        const summary = orderedSection.length
            ? buildMixSummary(orderedSection)
            : null;
        const transitions = orderedSection.length
            ? buildTransitionInsights(orderedSection)
            : [];
        res.json({
            playlist: {
                id: playlist.id,
                name: playlist.name,
                embedUrl: `https://open.spotify.com/embed/playlist/${playlist.id}?utm_source=geminify`,
                spotifyUrl: playlist.external_urls?.spotify ??
                    `https://open.spotify.com/playlist/${playlist.id}`,
            },
            changed,
            summary,
            transitions,
            limited: allTracks.length > mixableTracks.length,
            mixedCount: orderedSection.length,
        });
    }
    catch (error) {
        const errorMessage = formatSpotifyError(error);
        log(`Error mixing playlist:\n${errorMessage}`);
        const statusCode = error?.statusCode;
        if (statusCode === 401) {
            await fs.unlink(tokenPath).catch(() => undefined);
            return res.status(401).json({
                error: "Please log in with Spotify to continue.",
            });
        }
        if (statusCode === 403) {
            return res.status(403).json({
                error: "Spotify wouldn't let us reorder that playlist. Make sure you own it and granted the latest permissions, then try again.",
            });
        }
        res.status(500).json({ error: errorMessage });
    }
});
app.post("/create-custom-playlist", async (req, res) => {
    const statusContext = statusBroadcaster.hasSubscribers()
        ? statusBroadcaster.createContext("custom")
        : undefined;
    try {
        await refreshTokenIfNeeded();
        const userPrompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
        if (!userPrompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }
        const playlistReference = typeof req.body.playlistId === "string" ? req.body.playlistId.trim() : "";
        const targetPlaylistId = extractSpotifyPlaylistId(playlistReference);
        if (playlistReference && !targetPlaylistId) {
            return res.status(400).json({
                error: "Could not understand that playlist link. Paste a Spotify playlist URL or ID.",
            });
        }
        log(`Received custom playlist prompt: ${userPrompt}`);
        let existingPlaylist = null;
        if (targetPlaylistId) {
            try {
                const playlistResponse = await requestQueue.add(() => spotifyApi.getPlaylist(targetPlaylistId));
                existingPlaylist = playlistResponse.body;
            }
            catch (error) {
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
        const modelName = typeof req.body.model === "string" ? req.body.model.trim() : undefined;
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.geminiStart(statusContext, {
                model: modelName ?? geminiDefaultModelName,
                label: "Creating your custom playlist…",
                promptPreview: userPrompt.slice(0, 160),
            });
        }
        const customPlaylist = await generateCustomPlaylistWithGemini(userPrompt, modelName);
        const sanitizedPlaylist = sanitizePlaylistData(customPlaylist);
        broadcastPlaylistSongs(sanitizedPlaylist, statusContext);
        if (statusContext && statusBroadcaster.hasSubscribers()) {
            statusBroadcaster.geminiComplete(statusContext, {
                totalPlaylists: 1,
                label: targetPlaylistId
                    ? "Suggestions ready to refresh your playlist!"
                    : "Custom playlist ready!",
                songs: sanitizedPlaylist.songs?.slice(0, 80),
            });
        }
        const { uris, unresolved } = await findTrackUris(sanitizedPlaylist.songs, sanitizedPlaylist.name);
        if (unresolved.length) {
            if (statusContext && statusBroadcaster.hasSubscribers()) {
                statusBroadcaster.statusMessage(statusContext, {
                    message: `Verifying ${unresolved.length} tracks with Gemini…`,
                });
            }
            const resolutionMap = await resolveMissingTracksWithGemini({
                name: sanitizedPlaylist.name,
                description: sanitizedPlaylist.description,
            }, unresolved, modelName);
            unresolved.forEach((item) => {
                const candidate = resolutionMap.get(item.index);
                if (candidate) {
                    uris[item.index] = candidate.uri;
                    const currentSong = sanitizedPlaylist.songs[item.index];
                    sanitizedPlaylist.songs[item.index] = {
                        ...currentSong,
                        title: candidate.title,
                        artist: candidate.artist,
                    };
                }
            });
            const resolvedCount = resolutionMap.size;
            if (resolvedCount > 0) {
                log(`Gemini resolved ${resolvedCount} tracks for "${sanitizedPlaylist.name}".`);
            }
            const remaining = unresolved.length - resolvedCount;
            if (remaining > 0) {
                log(`${remaining} tracks remain unresolved after Gemini review for "${sanitizedPlaylist.name}".`);
            }
            if (statusContext && statusBroadcaster.hasSubscribers()) {
                statusBroadcaster.statusMessage(statusContext, {
                    message: remaining > 0
                        ? `Matched ${resolvedCount} tracks after review. ${remaining} still need attention.`
                        : `Matched all ${resolvedCount} tracks after Gemini review!`,
                });
            }
        }
        const validTrackUris = uris.filter((uri) => typeof uri === "string" && Boolean(uri));
        if (validTrackUris.length === 0) {
            return res
                .status(404)
                .json({ error: "No valid tracks found for the custom playlist" });
        }
        const uniqueTrackUris = Array.from(new Set(validTrackUris));
        if (statusContext && statusBroadcaster.hasSubscribers() && targetPlaylistId) {
            statusBroadcaster.statusMessage(statusContext, {
                message: existingPlaylist?.name
                    ? `Updating “${existingPlaylist.name}”…`
                    : "Updating your playlist…",
            });
        }
        let responsePayload;
        if (targetPlaylistId && existingPlaylist) {
            await requestQueue.add(() => spotifyApi.addTracksToPlaylist(targetPlaylistId, uniqueTrackUris));
            const description = sanitizedPlaylist.description
                ? sanitizedPlaylist.description
                : existingPlaylist.description || sanitizedPlaylist.name;
            if (description) {
                try {
                    await requestQueue.add(() => spotifyApi.changePlaylistDetails(targetPlaylistId, {
                        description,
                    }));
                }
                catch (error) {
                    log(`Failed to update playlist description for ${targetPlaylistId}:
${formatSpotifyError(error)}`);
                }
            }
            if (statusContext && statusBroadcaster.hasSubscribers()) {
                statusBroadcaster.statusMessage(statusContext, {
                    message: "New tracks added to your playlist!",
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
        }
        else {
            const newPlaylist = await requestQueue.add(() => spotifyApi.createPlaylist(sanitizedPlaylist.name, {
                description: sanitizedPlaylist.description,
                public: false,
            }));
            await requestQueue.add(() => spotifyApi.addTracksToPlaylist(newPlaylist.body.id, uniqueTrackUris));
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
    }
    catch (error) {
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
const CAMELOT_KEY_MAP = [
    { major: "8B", minor: "5A" },
    { major: "3B", minor: "12A" },
    { major: "10B", minor: "7A" },
    { major: "5B", minor: "2A" },
    { major: "12B", minor: "9A" },
    { major: "7B", minor: "4A" },
    { major: "2B", minor: "11A" },
    { major: "9B", minor: "6A" },
    { major: "4B", minor: "1A" },
    { major: "11B", minor: "8A" },
    { major: "6B", minor: "3A" },
    { major: "1B", minor: "10A" },
];
async function collectPlaylistTracks(playlistId, playlist) {
    const collected = [];
    const totalTracks = playlist.tracks?.total ?? 0;
    const initialItems = playlist.tracks?.items ?? [];
    const limit = 100;
    const pushItem = (item, absoluteIndex) => {
        if (!item)
            return;
        const track = item.track;
        if (!track || track.type !== "track")
            return;
        if (!track.name || !track.artists?.length)
            return;
        const artistName = track.artists[0]?.name;
        if (!artistName)
            return;
        const trackAny = track;
        const isLocal = Boolean(item?.is_local ||
            (typeof trackAny?.is_local === "boolean" ? trackAny.is_local : false) ||
            (typeof trackAny?.uri === "string" && trackAny.uri.startsWith("spotify:local:")));
        const feature = {
            id: track.id ?? null,
            uri: track.uri ?? null,
            name: track.name,
            artist: artistName,
            isLocal,
            tempo: Number.NaN,
            energy: Number.NaN,
            danceability: Number.NaN,
            valence: Number.NaN,
            loudness: Number.NaN,
            timeSignature: Number.NaN,
            durationMs: track.duration_ms ?? undefined,
            camelot: null,
            originalIndex: absoluteIndex,
            featuresAvailable: false,
        };
        collected.push(feature);
    };
    initialItems.forEach((item, index) => pushItem(item, index));
    let offset = initialItems.length;
    while (offset < totalTracks) {
        const remaining = totalTracks - offset;
        const batchLimit = Math.min(limit, remaining);
        if (batchLimit <= 0) {
            break;
        }
        const batch = await requestQueue.add(() => spotifyApi.getPlaylistTracks(playlistId, { offset, limit: batchLimit }));
        const batchItems = batch.body.items ?? [];
        batchItems.forEach((item, index) => pushItem(item, offset + index));
        offset += batchItems.length;
        if (offset < totalTracks) {
            await sleep(120);
        }
    }
    return collected;
}
async function hydrateAudioFeatures(tracks) {
    if (!tracks.length) {
        return;
    }
    const uniqueIds = Array.from(new Set(tracks
        .map((track) => track.id)
        .filter((id) => Boolean(id))));
    const featureMap = uniqueIds.length
        ? await fetchAudioFeatures(uniqueIds)
        : new Map();
    const tempoValues = [];
    const energyValues = [];
    const danceValues = [];
    const valenceValues = [];
    const loudnessValues = [];
    for (const track of tracks) {
        const features = track.id ? featureMap.get(track.id) : undefined;
        if (features) {
            track.featuresAvailable = true;
            if (typeof features.tempo === "number") {
                track.tempo = features.tempo;
            }
            if (typeof features.energy === "number") {
                track.energy = features.energy;
            }
            if (typeof features.danceability === "number") {
                track.danceability = features.danceability;
            }
            if (typeof features.valence === "number") {
                track.valence = features.valence;
            }
            if (typeof features.loudness === "number") {
                track.loudness = features.loudness;
            }
            if (typeof features.time_signature === "number") {
                track.timeSignature = features.time_signature;
            }
            track.camelot = toCamelotInfo(features.key, features.mode);
        }
        else {
            track.featuresAvailable = false;
            track.camelot = toCamelotInfo(null, null);
        }
        if (Number.isFinite(track.tempo))
            tempoValues.push(track.tempo);
        if (Number.isFinite(track.energy))
            energyValues.push(track.energy);
        if (Number.isFinite(track.danceability))
            danceValues.push(track.danceability);
        if (Number.isFinite(track.valence))
            valenceValues.push(track.valence);
        if (Number.isFinite(track.loudness))
            loudnessValues.push(track.loudness);
    }
    const avgTempo = tempoValues.length ? computeAverage(tempoValues) : 122;
    const avgEnergy = energyValues.length ? computeAverage(energyValues) : 0.58;
    const avgDance = danceValues.length ? computeAverage(danceValues) : 0.6;
    const avgValence = valenceValues.length ? computeAverage(valenceValues) : 0.5;
    const avgLoudness = loudnessValues.length ? computeAverage(loudnessValues) : -8;
    for (const track of tracks) {
        if (!Number.isFinite(track.tempo))
            track.tempo = avgTempo;
        if (!Number.isFinite(track.energy))
            track.energy = avgEnergy;
        if (!Number.isFinite(track.danceability))
            track.danceability = avgDance;
        if (!Number.isFinite(track.valence))
            track.valence = avgValence;
        if (!Number.isFinite(track.loudness))
            track.loudness = avgLoudness;
        if (!Number.isFinite(track.timeSignature))
            track.timeSignature = 4;
        if (!track.camelot)
            track.camelot = toCamelotInfo(null, null);
    }
}
async function fetchAudioFeatures(trackIds) {
    const result = new Map();
    const chunkSize = 100;
    for (let start = 0; start < trackIds.length; start += chunkSize) {
        const chunk = trackIds.slice(start, start + chunkSize);
        const response = await requestQueue.add(() => spotifyApi.getAudioFeaturesForTracks(chunk));
        const features = response.body?.audio_features ?? [];
        features.forEach((feature) => {
            if (feature?.id) {
                result.set(feature.id, feature);
            }
        });
        if (start + chunkSize < trackIds.length) {
            await sleep(120);
        }
    }
    return result;
}
function toCamelotInfo(key, mode) {
    if (typeof key !== "number" || key < 0 || key > 11) {
        return null;
    }
    const mapping = CAMELOT_KEY_MAP[key];
    if (!mapping) {
        return null;
    }
    const useMajor = mode === 1;
    const label = useMajor ? mapping.major : mapping.minor;
    const number = parseInt(label, 10);
    const letter = (label.endsWith("B") ? "B" : "A");
    return { label, number, letter };
}
function camelotDistance(a, b) {
    if (!a || !b) {
        return 2;
    }
    if (a.number === b.number && a.letter === b.letter) {
        return 0;
    }
    if (a.number === b.number) {
        return 0.4;
    }
    const diff = Math.min(Math.abs(a.number - b.number), 12 - Math.abs(a.number - b.number));
    if (diff === 1) {
        return a.letter === b.letter ? 0.6 : 0.8;
    }
    if (diff === 2) {
        return a.letter === b.letter ? 1.1 : 1.3;
    }
    return 1.6 + diff * 0.2;
}
function computeAverage(values) {
    if (!values.length) {
        return 0;
    }
    const sum = values.reduce((total, value) => total + value, 0);
    return sum / values.length;
}
function computeMedian(values) {
    if (!values.length) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
}
function targetEnergyForPosition(position, total) {
    if (total <= 1) {
        return 0.55;
    }
    const ratio = position / Math.max(total - 1, 1);
    const wave = Math.sin(Math.PI * ratio);
    return 0.45 + wave * 0.3;
}
function computeTransitionPenalty(current, next, targetEnergy, position, total) {
    const tempoScore = Math.abs(next.tempo - current.tempo) / 4.5;
    const camelotScore = camelotDistance(current.camelot, next.camelot) * 1.1;
    const energyTargetScore = Math.abs(next.energy - targetEnergy) * 2;
    const energyDeltaScore = Math.abs(next.energy - current.energy) * 0.9;
    const danceScore = Math.abs(next.danceability - current.danceability) * 0.6;
    const valenceScore = Math.abs(next.valence - current.valence) * 0.35;
    const loudnessScore = Math.abs(next.loudness - current.loudness) * 0.04;
    const timeSignatureScore = current.timeSignature === next.timeSignature ? 0 : 0.6;
    const durationScore = next.durationMs && current.durationMs
        ? Math.max(0, Math.abs(next.durationMs - current.durationMs) - 30000) / 300000
        : 0;
    const midpointBias = position < total / 2
        ? Math.max(0, targetEnergy - next.energy) * 0.5
        : Math.max(0, next.energy - targetEnergy) * 0.5;
    return (tempoScore +
        camelotScore +
        energyTargetScore +
        energyDeltaScore +
        danceScore +
        valenceScore +
        loudnessScore +
        timeSignatureScore +
        durationScore +
        midpointBias);
}
function buildMixedOrder(tracks) {
    if (tracks.length <= 1) {
        return tracks.slice();
    }
    const pool = tracks.slice();
    const total = pool.length;
    const tempoValues = pool
        .map((track) => track.tempo)
        .filter((value) => Number.isFinite(value));
    const medianTempo = tempoValues.length
        ? computeMedian(tempoValues)
        : computeAverage(tempoValues) || 120;
    const startTargetEnergy = targetEnergyForPosition(0, total);
    let startTrack = pool[0];
    let startScore = Number.POSITIVE_INFINITY;
    for (const track of pool) {
        const tempoScore = Math.abs(track.tempo - medianTempo) / 5;
        const energyScore = Math.abs(track.energy - startTargetEnergy) * 2.1;
        const danceScore = Math.abs(track.danceability - 0.6) * 0.8;
        const valenceScore = Math.abs(track.valence - 0.5) * 0.6;
        const score = tempoScore + energyScore + danceScore + valenceScore;
        if (score < startScore) {
            startScore = score;
            startTrack = track;
        }
    }
    const ordered = [startTrack];
    const remaining = new Set(pool.filter((track) => track !== startTrack));
    for (let position = 1; position < total; position += 1) {
        const current = ordered[ordered.length - 1];
        const targetEnergy = targetEnergyForPosition(position, total);
        let bestCandidate = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const candidate of remaining) {
            const score = computeTransitionPenalty(current, candidate, targetEnergy, position, total);
            if (score < bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }
        if (!bestCandidate) {
            break;
        }
        ordered.push(bestCandidate);
        remaining.delete(bestCandidate);
    }
    if (remaining.size) {
        ordered.push(...remaining);
    }
    return ordered;
}
function buildMixSummary(tracks) {
    const tempoValues = tracks
        .map((track) => track.tempo)
        .filter((value) => Number.isFinite(value));
    const energyValues = tracks
        .map((track) => track.energy)
        .filter((value) => Number.isFinite(value));
    const tempoMin = tempoValues.length ? Math.min(...tempoValues) : 0;
    const tempoMax = tempoValues.length ? Math.max(...tempoValues) : tempoMin;
    const tempoAvg = tempoValues.length ? computeAverage(tempoValues) : tempoMin;
    const energyStart = tracks[0]?.energy ?? 0.55;
    const energyPeak = energyValues.length ? Math.max(...energyValues) : energyStart;
    const energyEnd = tracks[tracks.length - 1]?.energy ?? energyPeak;
    const families = new Set();
    tracks.forEach((track) => {
        if (track.camelot?.label) {
            families.add(track.camelot.label);
        }
    });
    return {
        tempo: { min: tempoMin, max: tempoMax, average: tempoAvg },
        energy: { start: energyStart, peak: energyPeak, end: energyEnd },
        key: { families: Array.from(families).slice(0, 12) },
        updatedAt: new Date().toISOString(),
    };
}
function buildTransitionInsights(tracks) {
    const transitions = [];
    for (let index = 0; index < tracks.length - 1; index += 1) {
        const current = tracks[index];
        const next = tracks[index + 1];
        transitions.push({
            from: {
                title: current.name,
                artist: current.artist,
                tempo: current.tempo,
                camelot: current.camelot?.label ?? null,
                energy: current.energy,
            },
            to: {
                title: next.name,
                artist: next.artist,
                tempo: next.tempo,
                camelot: next.camelot?.label ?? null,
                energy: next.energy,
            },
            tempoDelta: Number(next.tempo - current.tempo),
            energyDelta: Number(next.energy - current.energy),
            camelotDistance: camelotDistance(current.camelot, next.camelot),
            timeSignatureMatch: current.timeSignature === next.timeSignature,
        });
    }
    return transitions;
}
async function applyPlaylistOrder(playlistId, originalOrder, desiredOrder) {
    if (!originalOrder.length || originalOrder.length !== desiredOrder.length) {
        throw new Error("Invalid playlist order data.");
    }
    const working = originalOrder.slice();
    for (let targetIndex = 0; targetIndex < desiredOrder.length; targetIndex += 1) {
        const targetTrack = desiredOrder[targetIndex];
        const currentIndex = working.findIndex((track) => track.originalIndex === targetTrack.originalIndex);
        if (currentIndex === -1) {
            continue;
        }
        if (currentIndex === targetIndex) {
            continue;
        }
        await requestQueue.add(() => spotifyApi.reorderTracksInPlaylist(playlistId, currentIndex, targetIndex, {
            range_length: 1,
        }));
        const [moved] = working.splice(currentIndex, 1);
        working.splice(targetIndex, 0, moved);
        log(`Moved track "${targetTrack.name}" from position ${currentIndex + 1} to ${targetIndex + 1}`);
        await sleep(120);
    }
}
async function refreshTokenIfNeeded() {
    let tokenData;
    try {
        tokenData = JSON.parse(await fs.readFile(tokenPath, "utf8"));
    }
    catch (error) {
        const nodeError = error;
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
            await fs.writeFile(tokenPath, JSON.stringify({
                access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: Date.now() + expires_in * 1000,
            }));
            spotifyApi.setAccessToken(access_token);
            log("Access token refreshed and saved");
        }
        else {
            log("Access token still valid");
            spotifyApi.setAccessToken(tokenData.access_token);
        }
    }
    catch (error) {
        log(`Failed to refresh token: ${error}`);
        throw new Error("Failed to refresh token. Please log in again.");
    }
}
async function getAllLikedSongs(statusContext) {
    let allTracks = [];
    let offset = 0;
    const limit = 50; // Spotify API allows a maximum of 50 tracks per request
    let total;
    const shouldBroadcast = Boolean(statusContext && statusBroadcaster.hasSubscribers());
    const maxBroadcast = 120;
    let broadcastCount = 0;
    let hasAnnounced = false;
    do {
        log(`Fetching liked songs: offset ${offset}`);
        const data = await spotifyApi.getMySavedTracks({ limit, offset });
        total = data.body.total;
        if (shouldBroadcast && !hasAnnounced) {
            statusBroadcaster.likedStart(statusContext, { total });
            hasAnnounced = true;
        }
        const tracks = data.body.items.map((item) => ({
            name: item.track.name,
            artist: item.track.artists[0]?.name ?? "",
            id: item.track.id,
            artistId: item.track.artists[0]?.id,
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
async function generateOrLoadPlaylists(likedSongs, modelName) {
    if (isDevelopment && !modelName) {
        try {
            log("Attempting to load saved playlists");
            const savedPlaylists = await fs.readFile(savedPlaylistsPath, "utf8");
            log("Using saved playlists");
            return JSON.parse(savedPlaylists);
        }
        catch (error) {
            log("No saved playlists found, generating new ones");
            return generatePlaylistsWithGemini(likedSongs);
        }
    }
    log(`Generating new playlists${modelName ? ` with Gemini model ${modelName}` : ""}`);
    return generatePlaylistsWithGemini(likedSongs, modelName);
}
async function generateCustomPlaylistWithGemini(userPrompt, modelName) {
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
    return generateGeminiJson(prompt, modelName);
}
async function generatePlaylistsWithGemini(likedSongs, modelName) {
    log(`Generating playlists with Gemini${modelName ? ` model ${modelName}` : ""}`);
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
    return generateGeminiJson(prompt, modelName);
}
async function generateGenrePlaylists(statusContext) {
    const likedSongs = await getAllLikedSongs(statusContext);
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
            const response = await requestQueue.add(() => exponentialBackoff(() => spotifyApi.getArtists(batch)));
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
async function loadOrGeneratePlaylistsForPreview(modelName, statusContext) {
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
