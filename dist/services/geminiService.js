import { createHash } from "crypto";
import { geminiConfig } from "../config/env";
import { geminiClient } from "./geminiClient";
import { log } from "../utils/logger";
import { spotifyApi } from "./spotifyClient";
import { MissingTokenError, refreshTokenIfNeeded } from "./spotifyAuthService";
import { normalizeForMatch, extractArtistTokens } from "../utils/spotify";
import { formatSpotifyError } from "../utils/errors";
import { sleep } from "../utils/sleep";
const MAX_CHAT_MESSAGES = 12;
const MAX_CHAT_MESSAGE_LENGTH = 1200;
export function getGeminiModel(modelName) {
    return geminiClient.getGenerativeModel({
        model: modelName ?? geminiConfig.defaultModel,
        generationConfig: {
            responseMimeType: "application/json",
        },
    });
}
export function parseGeminiJson(rawText) {
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
export async function generateGeminiJson(prompt, modelName) {
    log("Sending request to Gemini API");
    const model = getGeminiModel(modelName);
    const result = await model.generateContent(prompt);
    log("Received response from Gemini API");
    const text = result.response.text();
    return parseGeminiJson(text);
}
export function sanitizeStringArray(value, limit = 8) {
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
function createSuggestionId(seed) {
    return createHash("sha1").update(seed).digest("hex");
}
function parseSongExample(example) {
    const raw = example.trim();
    if (!raw) {
        return { title: "" };
    }
    const separatorMatch = raw.match(/\s[–—-]\s/);
    if (!separatorMatch) {
        return { title: raw };
    }
    const separator = separatorMatch[0];
    const index = raw.indexOf(separator);
    const title = raw.slice(0, index).trim();
    const artist = raw.slice(index + separator.length).trim();
    return {
        title: title || raw,
        artist: artist || undefined,
    };
}
function buildFallbackSuggestion(parsed, example, index) {
    const baseTitle = parsed.title || example.trim();
    const baseArtist = parsed.artist ?? "";
    const id = createSuggestionId(`${baseTitle}:${baseArtist}:${index}`);
    return {
        id,
        title: baseTitle,
        artist: baseArtist,
        album: undefined,
        previewUrl: null,
        uri: null,
        spotifyUrl: undefined,
        imageUrl: undefined,
    };
}
function scoreTrackMatch(track, parsed) {
    if (!track?.name) {
        return -Infinity;
    }
    const requestedTitle = normalizeForMatch(parsed.title);
    const trackTitle = normalizeForMatch(track.name);
    if (!requestedTitle || !trackTitle) {
        return -Infinity;
    }
    let score = 0;
    if (trackTitle === requestedTitle) {
        score += 6;
    }
    else if (trackTitle.includes(requestedTitle) || requestedTitle.includes(trackTitle)) {
        score += 4;
    }
    if (parsed.artist) {
        const requestedTokens = extractArtistTokens(parsed.artist);
        if (requestedTokens.length) {
            const candidateArtists = (track.artists ?? [])
                .map((artist) => normalizeForMatch(artist?.name))
                .filter(Boolean);
            if (candidateArtists.length) {
                const hasMatch = requestedTokens.some((token) => candidateArtists.some((candidate) => candidate === token ||
                    candidate.includes(token) ||
                    token.includes(candidate)));
                score += hasMatch ? 5 : -2;
            }
        }
    }
    if (track.preview_url) {
        score += 0.75;
    }
    score += track.popularity / 120;
    return score;
}
function mapTrackToSuggestion(track, parsed, index) {
    const artists = (track.artists ?? []).map((artist) => artist?.name).filter(Boolean);
    const albumImages = track.album?.images ?? [];
    const id = track.id ? track.id : createSuggestionId(`${track.uri ?? track.name}:${index}`);
    return {
        id,
        title: track.name ?? parsed.title,
        artist: artists.length ? artists.join(", ") : parsed.artist ?? "",
        album: track.album?.name ?? undefined,
        previewUrl: typeof track.preview_url === "string" ? track.preview_url : null,
        uri: track.uri ?? null,
        spotifyUrl: track.external_urls?.spotify ?? undefined,
        imageUrl: albumImages[1]?.url ?? albumImages[0]?.url ?? undefined,
    };
}
async function findBestTrackForSuggestion(parsed, example) {
    if (!parsed.title) {
        return null;
    }
    const title = parsed.title;
    const queries = parsed.artist
        ? [
            `track:${title} artist:${parsed.artist}`,
            `${title} ${parsed.artist}`,
            title,
        ]
        : [
            `track:${title}`,
            title,
        ];
    for (const query of queries) {
        try {
            const searchResponse = await spotifyApi.searchTracks(query, { limit: 20 });
            const items = searchResponse.body.tracks?.items ?? [];
            if (!items.length) {
                continue;
            }
            let best = null;
            let bestScore = -Infinity;
            for (const track of items) {
                const score = scoreTrackMatch(track, parsed);
                if (score > bestScore) {
                    best = track;
                    bestScore = score;
                }
            }
            if (best) {
                return best;
            }
        }
        catch (error) {
            const statusCode = error?.statusCode;
            if (statusCode === 429) {
                await sleep(320);
                continue;
            }
            log(`Spotify search error for chat suggestion "${example}": ${formatSpotifyError(error)}`);
        }
    }
    return null;
}
async function resolveChatSongSuggestions(songExamples) {
    if (!songExamples.length) {
        return [];
    }
    try {
        await refreshTokenIfNeeded();
    }
    catch (error) {
        if (error instanceof MissingTokenError) {
            log("Spotify authentication missing for chat suggestions; returning basic entries.");
        }
        else {
            log(`Failed to refresh Spotify token for chat suggestions: ${formatSpotifyError(error)}`);
        }
        return songExamples.map((example, index) => buildFallbackSuggestion(parseSongExample(example), example, index));
    }
    const suggestions = [];
    for (let index = 0; index < songExamples.length; index += 1) {
        const example = songExamples[index];
        const parsed = parseSongExample(example);
        if (!parsed.title) {
            suggestions.push(buildFallbackSuggestion(parsed, example, index));
            continue;
        }
        try {
            const track = await findBestTrackForSuggestion(parsed, example);
            if (track) {
                suggestions.push(mapTrackToSuggestion(track, parsed, index));
            }
            else {
                suggestions.push(buildFallbackSuggestion(parsed, example, index));
            }
        }
        catch (error) {
            log(`Failed to resolve chat song suggestion "${example}": ${formatSpotifyError(error)}`);
            suggestions.push(buildFallbackSuggestion(parsed, example, index));
        }
        if (index < songExamples.length - 1) {
            await sleep(140);
        }
    }
    return suggestions;
}
export function sanitizeChatPlaylistContext(raw) {
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
export function normalizeChatMessages(rawMessages) {
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
export function buildChatPrompt(messages, playlistContext) {
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

${playlistContext
        ? `The user wants to enhance the Spotify playlist described below. Respect what already works and suggest thoughtful evolutions.${playlistSection}\n`
        : ""}

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
- Provide up to 12 song examples as strings with track names (optionally artists). Use [] if you cannot suggest songs confidently.
- Avoid duplicate tags or songs. Return valid JSON without markdown fences or commentary.
- When a playlist is supplied, reference it in your reply, highlight complementary additions, and only suggest replacing existing songs if it improves flow significantly.`;
}
export async function generateChatSuggestion(messages, modelName, playlistContext) {
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
    const songExamples = sanitizeStringArray(response.songExamples ?? response.songTags, 12);
    let songSuggestions = [];
    if (songExamples.length) {
        try {
            songSuggestions = await resolveChatSongSuggestions(songExamples);
        }
        catch (error) {
            log(`Failed to enrich chat song suggestions: ${formatSpotifyError(error)}`);
            songSuggestions = songExamples.map((example, index) => buildFallbackSuggestion(parseSongExample(example), example, index));
        }
    }
    return { reply, themeTags, songExamples, songSuggestions };
}
export async function generateCustomPlaylistWithGemini(userPrompt, modelName) {
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
export async function generatePlaylistsWithGemini(likedSongs, modelName) {
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
export async function resolveMissingTracksWithGemini(context, unresolved, modelName) {
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
        const selectedUri = typeof choice.selectedUri === "string" && choice.selectedUri.trim()
            ? choice.selectedUri.trim()
            : undefined;
        if (!selectedUri) {
            continue;
        }
        const target = unresolved.find((item) => item.index === choice.index);
        const candidate = target?.candidates.find((entry) => entry.uri === selectedUri);
        if (candidate) {
            resolution.set(choice.index, candidate);
        }
    }
    return resolution;
}
