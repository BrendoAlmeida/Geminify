import { createHash } from "crypto";
import { geminiConfig } from "../config/env";
import { geminiClient } from "./geminiClient";
import spotifyPreviewFinder from "spotify-preview-finder";
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
const previewFinderCache = new Map();
async function findPreviewUrl(title, artist) {
    const normalizedTitle = title.trim();
    const normalizedArtist = artist?.trim() ?? "";
    if (!normalizedTitle) {
        return null;
    }
    const cacheKey = `${normalizedTitle.toLowerCase()}|${normalizedArtist.toLowerCase()}`;
    if (previewFinderCache.has(cacheKey)) {
        return previewFinderCache.get(cacheKey) ?? null;
    }
    try {
        const lookupLimit = normalizedArtist ? 3 : 5;
        const response = normalizedArtist
            ? await spotifyPreviewFinder(normalizedTitle, normalizedArtist, lookupLimit)
            : await spotifyPreviewFinder(normalizedTitle, lookupLimit);
        if (response?.success && Array.isArray(response.results)) {
            for (const item of response.results) {
                const url = item?.previewUrls?.find((candidate) => typeof candidate === "string" && candidate.trim());
                if (url) {
                    previewFinderCache.set(cacheKey, url);
                    return url;
                }
            }
        }
        previewFinderCache.set(cacheKey, null);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Preview finder failed for "${normalizedTitle}"${normalizedArtist ? ` by ${normalizedArtist}` : ""}: ${message}`);
        previewFinderCache.set(cacheKey, null);
    }
    return null;
}
async function ensureSuggestionPreview(suggestion, parsed) {
    if (suggestion.previewUrl) {
        suggestion.previewUnavailableReason = null;
        return;
    }
    const title = suggestion.title || parsed.title;
    const artist = suggestion.artist || parsed.artist;
    const previewUrl = await findPreviewUrl(title || "", artist);
    if (previewUrl) {
        suggestion.previewUrl = previewUrl;
        suggestion.previewUnavailableReason = null;
    }
    else if (!suggestion.previewUnavailableReason) {
        suggestion.previewUnavailableReason = "no_preview";
    }
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
function buildFallbackSuggestion(parsed, example, index, options = {}) {
    const baseTitle = parsed.title || example.trim();
    const baseArtist = parsed.artist ?? "";
    const id = createSuggestionId(`${baseTitle}:${baseArtist}:${index}`);
    const { reason } = options;
    return {
        id,
        title: baseTitle,
        artist: baseArtist,
        album: undefined,
        previewUrl: null,
        uri: null,
        spotifyUrl: undefined,
        imageUrl: undefined,
        previewUnavailableReason: reason ?? null,
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
        const reason = error instanceof MissingTokenError ? "auth_required" : "no_preview";
        if (error instanceof MissingTokenError) {
            log("Spotify authentication missing for chat suggestions; returning basic entries.");
        }
        else {
            log(`Failed to refresh Spotify token for chat suggestions: ${formatSpotifyError(error)}`);
        }
        return songExamples.map((example, index) => buildFallbackSuggestion(parseSongExample(example), example, index, { reason }));
    }
    const suggestions = [];
    for (let index = 0; index < songExamples.length; index += 1) {
        const example = songExamples[index];
        const parsed = parseSongExample(example);
        if (!parsed.title) {
            suggestions.push(buildFallbackSuggestion(parsed, example, index, { reason: "no_preview" }));
            continue;
        }
        try {
            const track = await findBestTrackForSuggestion(parsed, example);
            if (track) {
                const suggestion = mapTrackToSuggestion(track, parsed, index);
                await ensureSuggestionPreview(suggestion, parsed);
                suggestions.push(suggestion);
            }
            else {
                const suggestion = buildFallbackSuggestion(parsed, example, index, { reason: "no_preview" });
                await ensureSuggestionPreview(suggestion, parsed);
                suggestions.push(suggestion);
            }
        }
        catch (error) {
            log(`Failed to resolve chat song suggestion "${example}": ${formatSpotifyError(error)}`);
            const fallback = buildFallbackSuggestion(parsed, example, index, { reason: "error" });
            await ensureSuggestionPreview(fallback, parsed);
            suggestions.push(fallback);
        }
        if (index < songExamples.length - 1) {
            await sleep(140);
        }
    }
    return suggestions;
}
function asStringArray(source, limit = 12) {
    if (!Array.isArray(source)) {
        return [];
    }
    const values = [];
    const seen = new Set();
    for (const entry of source) {
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
        values.push(trimmed);
        if (values.length >= limit) {
            break;
        }
    }
    return values;
}
function normalizeQueryType(value) {
    const normalized = value?.trim().toLowerCase();
    switch (normalized) {
        case "artist":
        case "artists":
            return "artist";
        case "keyword":
        case "theme":
        case "topic":
            return "keyword";
        case "track":
        case "song":
        default:
            return "track";
    }
}
function normalizeAnalysisQueries(value) {
    if (!value) {
        return [];
    }
    const entries = [];
    if (Array.isArray(value)) {
        for (const item of value) {
            if (!item || typeof item !== "object") {
                continue;
            }
            const queryEntry = item;
            const query = typeof queryEntry?.query === "string"
                ? queryEntry.query.trim()
                : "";
            if (!query) {
                continue;
            }
            const type = normalizeQueryType(queryEntry?.type);
            const reason = typeof queryEntry?.reason === "string"
                ? queryEntry.reason.trim()
                : undefined;
            entries.push({ type, query, reason });
            if (entries.length >= 18) {
                break;
            }
        }
    }
    return entries;
}
function normalizeAnalysisSongs(value) {
    if (!value) {
        return [];
    }
    const songs = [];
    const pushSong = (title, artist) => {
        if (!title.trim()) {
            return;
        }
        songs.push({ title: title.trim(), artist: artist?.trim() || undefined });
    };
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (!entry) {
                continue;
            }
            if (typeof entry === "string") {
                const parsed = parseSongExample(entry);
                pushSong(parsed.title, parsed.artist);
                if (songs.length >= 18) {
                    break;
                }
                continue;
            }
            if (typeof entry === "object") {
                const title = typeof entry.title === "string"
                    ? entry.title
                    : typeof entry.name === "string"
                        ? entry.name
                        : "";
                const artist = typeof entry.artist === "string"
                    ? entry.artist
                    : typeof entry.artistName === "string"
                        ? entry.artistName
                        : typeof entry.artists === "string"
                            ? entry.artists
                            : Array.isArray(entry.artists)
                                ? entry.artists[0]
                                : undefined;
                if (title) {
                    pushSong(title, artist);
                }
                if (songs.length >= 18) {
                    break;
                }
            }
        }
    }
    return songs;
}
function normalizeAnalysisResponse(payload) {
    const summary = typeof payload.summary === "string"
        ? payload.summary.trim()
        : "";
    const themes = asStringArray(payload.themes ?? payload.keywords ?? payload.moods ?? payload.genres, 12);
    const artistMentions = asStringArray(payload.artistMentions ?? payload.artists, 18);
    const songMentions = normalizeAnalysisSongs(payload.songMentions ?? payload.songs);
    const queries = normalizeAnalysisQueries(payload.spotifyQueries ?? payload.queries ?? payload.search);
    const needsSpotifySearch = (() => {
        const rawValue = payload.needsSpotifySearch ?? payload.shouldSearch;
        if (typeof rawValue === "boolean") {
            return rawValue;
        }
        if (typeof rawValue === "string") {
            const normalized = rawValue.trim().toLowerCase();
            return ["true", "yes", "y", "1", "search", "required"].includes(normalized);
        }
        return queries.length > 0 || songMentions.length > 0 || artistMentions.length > 0;
    })();
    return {
        summary,
        themes,
        artistMentions,
        songMentions,
        queries,
        needsSpotifySearch,
    };
}
function buildChatAnalysisPrompt(messages, playlistContext) {
    const latest = messages[messages.length - 1];
    const conversation = messages
        .slice(-MAX_CHAT_MESSAGES)
        .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
        .join("\n");
    let playlistSection = "";
    if (playlistContext) {
        const { name, description, songs } = playlistContext;
        const lines = [
            `Playlist alvo: ${name}`,
        ];
        if (description) {
            lines.push(`Descrição: ${description}`);
        }
        if (Array.isArray(songs) && songs.length) {
            const highlights = songs
                .slice(0, 20)
                .map((song) => `- ${song.title} — ${song.artist}`)
                .join("\n");
            if (highlights) {
                lines.push("Faixas destacadas:");
                lines.push(highlights);
            }
        }
        playlistSection = `${lines.join("\n")}\n\n`;
    }
    const latestContent = latest?.content ?? "";
    return `Você é um analista musical que prepara uma pesquisa antes do chatbot responder ao usuário.

${playlistSection}Conversa recente:
${conversation}

Sua tarefa é analisar a mensagem mais recente do usuário e planejar uma pesquisa no Spotify.
Responda somente com um JSON contendo estes campos:
{
  "summary": "Resumo em uma ou duas frases do que o usuário deseja",
  "themes": ["lista de temas/moods"],
  "artistMentions": ["nomes de artistas citados ou implícitos"],
  "songMentions": [
    { "title": "Título da faixa", "artist": "Artista se conhecido" }
  ],
  "spotifyQueries": [
    { "type": "track|artist|keyword", "query": "texto da busca", "reason": "por que pesquisar" }
  ],
  "needsSpotifySearch": true ou false
}

Regras:
- Reflita apenas sobre a mensagem do usuário e o contexto fornecido.
- Converta qualquer referência a música em um objeto com título e artista quando possível.
- Sugira buscas adicionais com base em temas se elas ajudarem a responder melhor.
- Prefira português para campos de texto.
- Use arrays vazios [] quando não houver dados.

Mensagem mais recente do usuário:
"""${latestContent}"""`;
}
async function analyzeChatIntent(messages, modelName, playlistContext) {
    if (!messages.length) {
        return undefined;
    }
    const prompt = buildChatAnalysisPrompt(messages, playlistContext);
    try {
        const analysisPayload = await generateGeminiJson(prompt, modelName);
        return normalizeAnalysisResponse(analysisPayload ?? {});
    }
    catch (error) {
        log(`Failed to analyze chat intent: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
function buildSongExampleFromAnalysis(song) {
    if (!song.title.trim()) {
        return "";
    }
    return song.artist ? `${song.title} — ${song.artist}` : song.title;
}
async function searchSpotifyForArtist(artist, options = {}) {
    const limit = options.limit ?? 20;
    const retries = options.retries ?? 2;
    let attempt = 0;
    while (attempt <= retries) {
        try {
            const response = await spotifyApi.searchTracks(`artist:${artist}`, { limit });
            const items = response.body.tracks?.items ?? [];
            if (!items.length) {
                return null;
            }
            return items.find((track) => track?.preview_url) ?? items[0];
        }
        catch (error) {
            if (error?.statusCode === 429 && attempt < retries) {
                await sleep(320 * (attempt + 1));
                attempt += 1;
                continue;
            }
            log(`Spotify artist search error for "${artist}": ${formatSpotifyError(error)}`);
            return null;
        }
    }
    return null;
}
async function searchSpotifyForKeyword(keyword, options = {}) {
    const limit = options.limit ?? 20;
    const retries = options.retries ?? 2;
    let attempt = 0;
    while (attempt <= retries) {
        try {
            const response = await spotifyApi.searchTracks(keyword, { limit });
            const items = response.body.tracks?.items ?? [];
            if (!items.length) {
                return null;
            }
            return items.find((track) => track?.preview_url) ?? items[0];
        }
        catch (error) {
            if (error?.statusCode === 429 && attempt < retries) {
                await sleep(320 * (attempt + 1));
                attempt += 1;
                continue;
            }
            log(`Spotify keyword search error for "${keyword}": ${formatSpotifyError(error)}`);
            return null;
        }
    }
    return null;
}
async function performSpotifyResearch(analysis) {
    const items = [];
    const aggregated = [];
    const seen = new Set();
    const appendSuggestion = async (suggestion) => {
        if (!suggestion) {
            return;
        }
        await ensureSuggestionPreview(suggestion, {
            title: suggestion.title,
            artist: suggestion.artist,
        });
        const key = suggestion.id || `${suggestion.title}:${suggestion.artist}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        aggregated.push(suggestion);
    };
    const collectFromTrack = async (parsed, sourceLabel) => {
        const example = parsed.artist ? `${parsed.title} — ${parsed.artist}` : parsed.title;
        try {
            const track = await findBestTrackForSuggestion(parsed, example);
            if (track) {
                const suggestion = mapTrackToSuggestion(track, parsed, aggregated.length);
                await appendSuggestion(suggestion);
                items.push({
                    type: "track",
                    query: example,
                    reason: sourceLabel,
                    suggestions: suggestion ? [suggestion] : [],
                });
                return;
            }
        }
        catch (error) {
            log(`Spotify track search failed for analysis song "${example}": ${formatSpotifyError(error)}`);
        }
        const fallback = buildFallbackSuggestion(parsed, example, aggregated.length, { reason: "no_preview" });
        await appendSuggestion(fallback);
        items.push({
            type: "track",
            query: example,
            reason: sourceLabel,
            suggestions: fallback ? [fallback] : [],
        });
    };
    try {
        await refreshTokenIfNeeded();
    }
    catch (error) {
        const reason = error instanceof MissingTokenError ? "auth_required" : "no_preview";
        log(`Spotify auth not available for research: ${formatSpotifyError(error)}`);
        const fallbacks = analysis.songMentions.map((song, index) => buildFallbackSuggestion(parseSongExample(buildSongExampleFromAnalysis(song)), buildSongExampleFromAnalysis(song), index, { reason }));
        fallbacks.forEach((suggestion) => {
            if (suggestion) {
                aggregated.push(suggestion);
            }
        });
        return {
            performed: false,
            items: analysis.songMentions.length
                ? analysis.songMentions.map((song) => ({
                    type: "track",
                    query: buildSongExampleFromAnalysis(song),
                    reason: "Sem token do Spotify, usando fallback",
                    suggestions: [],
                }))
                : [],
            suggestions: aggregated,
        };
    }
    for (const song of analysis.songMentions) {
        if (!song?.title) {
            continue;
        }
        const parsed = parseSongExample(buildSongExampleFromAnalysis(song));
        await collectFromTrack(parsed, "Música mencionada pelo usuário");
        if (aggregated.length >= 18) {
            break;
        }
        await sleep(110);
    }
    for (const query of analysis.queries) {
        const reason = query.reason?.trim() || undefined;
        try {
            let suggestion = null;
            if (query.type === "artist") {
                const track = await searchSpotifyForArtist(query.query);
                if (track) {
                    suggestion = mapTrackToSuggestion(track, {
                        title: track.name ?? query.query,
                        artist: track.artists?.[0]?.name ?? query.query,
                    }, aggregated.length);
                }
            }
            else if (query.type === "keyword") {
                const track = await searchSpotifyForKeyword(query.query);
                if (track) {
                    suggestion = mapTrackToSuggestion(track, {
                        title: track.name ?? query.query,
                        artist: track.artists?.[0]?.name ?? "",
                    }, aggregated.length);
                }
            }
            else {
                const parsed = parseSongExample(query.query);
                const track = await findBestTrackForSuggestion(parsed, query.query);
                if (track) {
                    suggestion = mapTrackToSuggestion(track, parsed, aggregated.length);
                }
            }
            if (suggestion) {
                await appendSuggestion(suggestion);
                items.push({
                    type: query.type,
                    query: query.query,
                    reason,
                    suggestions: [suggestion],
                });
            }
            else {
                items.push({
                    type: query.type,
                    query: query.query,
                    reason,
                    suggestions: [],
                });
            }
        }
        catch (error) {
            log(`Spotify research error for "${query.query}": ${formatSpotifyError(error)}`);
            items.push({
                type: query.type,
                query: query.query,
                reason,
                suggestions: [],
            });
        }
        if (aggregated.length >= 18) {
            break;
        }
        await sleep(110);
    }
    return {
        performed: analysis.needsSpotifySearch && aggregated.length > 0,
        items,
        suggestions: aggregated.slice(0, 18),
    };
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
export function buildChatPrompt(messages, playlistContext, analysis, research) {
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
    let analysisSection = "";
    if (analysis) {
        const lines = [];
        if (analysis.summary) {
            lines.push(`Resumo: ${analysis.summary}`);
        }
        if (analysis.themes.length) {
            lines.push(`Temas detectados: ${analysis.themes.slice(0, 8).join(", ")}`);
        }
        if (analysis.artistMentions.length) {
            lines.push(`Artistas mencionados: ${analysis.artistMentions.slice(0, 10).join(", ")}`);
        }
        if (analysis.songMentions.length) {
            const songs = analysis.songMentions
                .slice(0, 10)
                .map((song) => (song.artist ? `${song.title} — ${song.artist}` : song.title))
                .join(", ");
            lines.push(`Faixas citadas: ${songs}`);
        }
        if (analysis.queries.length) {
            const queryLines = analysis.queries
                .slice(0, 8)
                .map((entry) => `• ${entry.type}: ${entry.query}${entry.reason ? ` (${entry.reason})` : ""}`)
                .join("\n");
            if (queryLines) {
                lines.push("Sugestões de busca:");
                lines.push(queryLines);
            }
        }
        if (lines.length) {
            analysisSection = `\nInsights da análise:\n${lines.join("\n")}\n`;
        }
    }
    let researchSection = "";
    if (research && research.suggestions.length) {
        const songLines = research.suggestions
            .slice(0, 12)
            .map((song) => `- ${song.title}${song.artist ? ` — ${song.artist}` : ""}`)
            .join("\n");
        const querySummary = research.items
            .filter((item) => item.suggestions.length)
            .slice(0, 6)
            .map((item) => `• ${item.type}: ${item.query}`)
            .join("\n");
        const sections = [];
        if (songLines) {
            sections.push("Resultados do Spotify (priorize estas faixas):");
            sections.push(songLines);
        }
        if (querySummary) {
            sections.push("Consultas executadas:");
            sections.push(querySummary);
        }
        if (sections.length) {
            researchSection = `\nPesquisa no Spotify já realizada:\n${sections.join("\n")}\n`;
        }
    }
    return `You are Geminify's playlist ideation assistant. Your task is to help users shape playlist ideas, moods, storylines, and track inspirations.

Prioritize inspiring the user with concrete artist and track ideas whenever it adds value. Spotlight a mix of familiar and fresh names that fit the user's vibe.

${playlistContext
        ? `The user wants to enhance the Spotify playlist described below. Respect what already works and suggest thoughtful evolutions.${playlistSection}\n`
        : ""}

${analysisSection}${researchSection}

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
- In the reply, naturally reference 1-2 specific artists or songs when they help the user move forward. Prefer concrete names over generic statements.
- Provide up to 6 concise theme tags capturing moods, genres, settings, or references. Use [] if no tags are appropriate.
- Provide up to 12 song examples as strings with track names (optionally artists). Populate this list whenever you can suggest relevant music; use [] only when no confident suggestions exist.
- Avoid duplicate tags or songs. Return valid JSON without markdown fences or commentary.
- When a playlist is supplied, reference it in your reply, highlight complementary additions, and only suggest replacing existing songs if it improves flow significantly.`;
}
export async function generateChatSuggestion(messages, modelName, playlistContext) {
    if (!messages.length) {
        throw new Error("Chat messages are required");
    }
    const latestUserMessage = messages[messages.length - 1]?.content ?? "";
    const analysis = await analyzeChatIntent(messages, modelName, playlistContext);
    const researchResult = analysis ? await performSpotifyResearch(analysis) : undefined;
    const prompt = buildChatPrompt(messages, playlistContext, analysis, researchResult);
    const response = await generateGeminiJson(prompt, modelName);
    const reply = typeof response.reply === "string" ? response.reply.trim() : "";
    if (!reply) {
        throw new Error("Gemini response did not contain a reply");
    }
    const responseThemeTags = sanitizeStringArray(response.themeTags ?? response.tags);
    const analysisThemes = analysis?.themes ?? [];
    const mergedThemes = sanitizeStringArray([...analysisThemes, ...responseThemeTags]);
    const modelSongExamples = sanitizeStringArray(response.songExamples ?? response.songTags, 12);
    let songSuggestions = researchResult?.suggestions
        ? researchResult.suggestions.slice(0, 12)
        : [];
    let songExamples = songSuggestions.length
        ? songSuggestions.map((suggestion) => suggestion.artist ? `${suggestion.title} — ${suggestion.artist}` : suggestion.title)
        : modelSongExamples;
    if (!songSuggestions.length && songExamples.length) {
        try {
            songSuggestions = await resolveChatSongSuggestions(songExamples);
        }
        catch (error) {
            log(`Failed to enrich chat song suggestions: ${formatSpotifyError(error)}`);
            songSuggestions = songExamples.map((example, index) => buildFallbackSuggestion(parseSongExample(example), example, index, { reason: "error" }));
        }
    }
    if (!songExamples.length && songSuggestions.length) {
        songExamples = songSuggestions.map((suggestion) => suggestion.artist ? `${suggestion.title} — ${suggestion.artist}` : suggestion.title);
    }
    const steps = [];
    if (latestUserMessage) {
        steps.push({
            key: "user_input",
            title: "1. Texto do usuário",
            detail: latestUserMessage.slice(0, 600),
        });
    }
    if (analysis) {
        const analysisDetails = [];
        if (analysis.summary) {
            analysisDetails.push(`Resumo: ${analysis.summary}`);
        }
        if (analysis.themes.length) {
            analysisDetails.push(`Temas: ${analysis.themes.slice(0, 6).join(", ")}`);
        }
        if (analysis.artistMentions.length) {
            analysisDetails.push(`Artistas: ${analysis.artistMentions.slice(0, 6).join(", ")}`);
        }
        if (analysis.songMentions.length) {
            const songs = analysis.songMentions
                .slice(0, 4)
                .map((song) => (song.artist ? `${song.title} — ${song.artist}` : song.title));
            analysisDetails.push(`Faixas citadas: ${songs.join(", ")}`);
        }
        if (analysis.queries.length) {
            analysisDetails.push(`Buscas sugeridas: ${analysis.queries
                .slice(0, 4)
                .map((item) => item.query)
                .join(", ")}`);
        }
        steps.push({
            key: "analysis",
            title: "2. Análise do pedido",
            detail: analysisDetails.join("\n"),
        });
    }
    else {
        steps.push({
            key: "analysis",
            title: "2. Análise do pedido",
            detail: "Não foi possível gerar a análise automática desta vez.",
        });
    }
    const researchForSteps = researchResult ?? {
        performed: false,
        items: [],
        suggestions: [],
    };
    const detailParts = [];
    if (researchForSteps.items.length) {
        const executed = researchForSteps.items
            .filter((item) => item.suggestions.length)
            .map((item) => `${item.type}: ${item.query}`)
            .slice(0, 5);
        if (executed.length) {
            detailParts.push(`Consultas executadas: ${executed.join(", ")}`);
        }
    }
    if (songSuggestions.length) {
        detailParts.push(`Músicas encontradas: ${songSuggestions
            .slice(0, 5)
            .map((song) => (song.artist ? `${song.title} — ${song.artist}` : song.title))
            .join(", ")}`);
    }
    if (!detailParts.length) {
        detailParts.push(analysis
            ? "Pesquisa no Spotify ainda não trouxe resultados úteis."
            : "Pesquisa não executada porque a análise falhou.");
    }
    steps.push({
        key: "spotify_search",
        title: "3. Pesquisa no Spotify",
        detail: detailParts.join("\n"),
    });
    const finalizeDetails = [];
    if (mergedThemes.length) {
        finalizeDetails.push(`Tags adicionadas: ${mergedThemes.slice(0, 6).join(", ")}`);
    }
    if (songSuggestions.length) {
        finalizeDetails.push(`Sugestões de música: ${songSuggestions
            .slice(0, 5)
            .map((song) => (song.artist ? `${song.title} — ${song.artist}` : song.title))
            .join(", ")}`);
    }
    finalizeDetails.push("Resposta pronta para continuar a conversa.");
    steps.push({
        key: "finalize",
        title: "4. Concluido",
        detail: finalizeDetails.join("\n"),
    });
    return {
        reply,
        themeTags: mergedThemes,
        songExamples,
        songSuggestions,
        analysis,
        spotifyResearch: researchResult,
        steps,
    };
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
