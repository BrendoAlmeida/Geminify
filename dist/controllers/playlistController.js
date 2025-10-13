import { Router } from "express";
import { promises as fs } from "fs";
import statusBroadcaster from "../services/statusBroadcaster";
import { getAllLikedSongs, generateOrLoadPlaylists, generateGenrePlaylists, loadOrGeneratePlaylistsForPreview, findTrackUris, resolveUnresolvedTracks, sanitizePlaylist, broadcastPlaylistSongs, createCustomPlaylist, extractSpotifyPlaylistId, requestQueue, } from "../services/playlistService";
import { savedPlaylistsPath } from "../config/paths";
import { formatSpotifyError } from "../utils/errors";
import { log } from "../utils/logger";
import { spotifyApi } from "../services/spotifyClient";
import { sleep } from "../utils/sleep";
import { clearTokenFile, createUserSpotifyApi } from "../services/spotifyAuthService";
const playlistController = Router();
function createStatusContext(operation) {
    return statusBroadcaster.hasSubscribers()
        ? statusBroadcaster.createContext(operation)
        : undefined;
}
// Helper para obter a API do Spotify do usuário da sessão
function getUserSpotifyApi(req) {
    if (req.session?.user?.access_token) {
        return createUserSpotifyApi(req.session.user.access_token, req.session.user.refresh_token);
    }
    // Fallback para compatibilidade (caso ainda existam tokens no arquivo)
    return spotifyApi;
}
function extractTrackId(reference) {
    if (!reference) {
        return undefined;
    }
    const normalized = normalizeTrackReference(reference);
    if (normalized) {
        return normalized.split(":").pop();
    }
    const trimmed = reference.trim();
    if (!trimmed) {
        return undefined;
    }
    if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) {
        return trimmed;
    }
    return undefined;
}
function normalizeTrackReference(reference) {
    if (!reference) {
        return undefined;
    }
    const trimmed = reference.trim();
    if (!trimmed) {
        return undefined;
    }
    const uriMatch = trimmed.match(/spotify:track:([A-Za-z0-9]{16,})/i);
    if (uriMatch?.[1]) {
        return `spotify:track:${uriMatch[1]}`;
    }
    const urlMatch = trimmed.match(/track\/([A-Za-z0-9]{16,})/i);
    if (urlMatch?.[1]) {
        return `spotify:track:${urlMatch[1]}`;
    }
    return undefined;
}
function sanitizeSelectedSongs(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const selections = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const titleRaw = entry.title ?? entry.name;
        const artistRaw = entry.artist ?? entry.artistName;
        const uriRaw = entry.uri;
        const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
        const artist = typeof artistRaw === "string" ? artistRaw.trim() : "";
        const normalizedUri = normalizeTrackReference(typeof uriRaw === "string" ? uriRaw : undefined);
        if (!title) {
            continue;
        }
        selections.push({
            title,
            artist,
            uri: normalizedUri,
        });
        if (selections.length >= 120) {
            break;
        }
    }
    return selections;
}
async function collectPlaylistTrackUris(userSpotifyApi, playlistId, initialPlaylist) {
    const uris = new Set();
    const addItems = (items) => {
        items?.forEach((item) => {
            const track = item.track;
            const uri = track?.uri;
            if (uri) {
                uris.add(uri);
            }
        });
    };
    let offset = 0;
    let total = 0;
    const limit = 100;
    if (initialPlaylist) {
        const initialItems = initialPlaylist.tracks?.items ?? [];
        addItems(initialItems);
        offset = initialItems.length;
        total = initialPlaylist.tracks?.total ?? initialItems.length;
        if (total && offset >= total) {
            return uris;
        }
    }
    while (true) {
        const response = await requestQueue.add(() => userSpotifyApi.getPlaylistTracks(playlistId, {
            offset,
            limit,
        }));
        const items = response.body?.items ?? [];
        addItems(items);
        offset += items.length;
        total =
            typeof response.body?.total === "number"
                ? response.body.total
                : total;
        const reachedEnd = !items.length || (typeof total === "number" && offset >= total);
        if (reachedEnd) {
            break;
        }
        await sleep(120);
    }
    return uris;
}
playlistController.get("/liked-songs", async (req, res) => {
    const statusContext = createStatusContext("liked-songs");
    try {
        log("Fetching liked songs");
        const userSpotifyApi = getUserSpotifyApi(req);
        const songs = await getAllLikedSongs(userSpotifyApi, statusContext);
        log(`Fetched ${songs.length} liked songs`);
        res.json(songs);
    }
    catch (error) {
        const message = formatSpotifyError(error);
        log(`Error fetching liked songs: ${message}`);
        if (statusContext) {
            statusBroadcaster.statusError(statusContext, { message });
        }
        res.status(500).json({ error: message });
    }
});
playlistController.get("/generate-playlists", async (req, res) => {
    const statusContext = createStatusContext("generate-playlists");
    const modelParam = Array.isArray(req.query.model)
        ? req.query.model[0]
        : req.query.model;
    const modelName = typeof modelParam === "string" ? modelParam.trim() || undefined : undefined;
    try {
        log("Generating playlists");
        const userSpotifyApi = getUserSpotifyApi(req);
        const likedSongs = await getAllLikedSongs(userSpotifyApi, statusContext);
        if (statusContext) {
            statusBroadcaster.geminiStart(statusContext, {
                model: modelName,
                label: "Generating playlists with Gemini…",
            });
        }
        const playlists = await generateOrLoadPlaylists(likedSongs, modelName);
        broadcastPlaylistSongs(playlists, statusContext);
        if (statusContext) {
            statusBroadcaster.geminiComplete(statusContext, {
                totalPlaylists: playlists.length,
                label: "Playlists ready!",
            });
        }
        await fs.writeFile(savedPlaylistsPath, JSON.stringify(playlists, null, 2));
        log(`Generated ${playlists.length} playlists and saved to disk`);
        res.json(playlists);
    }
    catch (error) {
        const message = formatSpotifyError(error);
        log(`Error generating playlists: ${message}`);
        if (statusContext) {
            statusBroadcaster.statusError(statusContext, { message });
        }
        res.status(500).json({ error: message });
    }
});
playlistController.get("/genre-playlists", async (req, res) => {
    const statusContext = createStatusContext("genre-playlists");
    try {
        const userSpotifyApi = getUserSpotifyApi(req);
        const playlists = await generateGenrePlaylists(userSpotifyApi, statusContext);
        const totalSongs = playlists.reduce((total, playlist) => total + playlist.count, 0);
        res.json({
            playlists,
            summary: {
                totalPlaylists: playlists.length,
                totalSongs,
            },
        });
    }
    catch (error) {
        const message = formatSpotifyError(error);
        log(`Error generating genre playlists: ${message}`);
        if (statusContext) {
            statusBroadcaster.statusError(statusContext, { message });
        }
        res.status(500).json({ error: message });
    }
});
playlistController.get("/preview-playlists", async (req, res) => {
    const statusContext = createStatusContext("preview");
    const modelParam = Array.isArray(req.query.model)
        ? req.query.model[0]
        : req.query.model;
    const modelName = typeof modelParam === "string" ? modelParam.trim() || undefined : undefined;
    try {
        if (statusContext) {
            statusBroadcaster.geminiStart(statusContext, {
                model: modelName,
                label: "Generating surprise playlists…",
            });
        }
        const userSpotifyApi = getUserSpotifyApi(req);
        const playlists = await loadOrGeneratePlaylistsForPreview(userSpotifyApi, modelName, statusContext);
        broadcastPlaylistSongs(playlists, statusContext);
        if (statusContext) {
            statusBroadcaster.geminiComplete(statusContext, {
                totalPlaylists: playlists.length,
                label: "Surprise playlists ready!",
            });
        }
        const previewPayload = [];
        for (const playlist of playlists) {
            try {
                const sanitized = sanitizePlaylist(playlist);
                const { uris, unresolved } = await findTrackUris(userSpotifyApi, sanitized.songs, sanitized.name);
                let trackUris = [...uris];
                if (unresolved.length) {
                    if (statusContext) {
                        statusBroadcaster.statusMessage(statusContext, {
                            message: `Verifying ${unresolved.length} tracks with Gemini…`,
                        });
                    }
                    const { uris: resolvedUris, resolvedCount } = await resolveUnresolvedTracks(sanitized, unresolved, modelName);
                    resolvedUris.forEach((uri, index) => {
                        if (typeof uri === "string" && uri) {
                            trackUris[index] = uri;
                        }
                    });
                    if (statusContext) {
                        const remaining = unresolved.length - resolvedCount;
                        statusBroadcaster.statusMessage(statusContext, {
                            message: remaining > 0
                                ? `Matched ${resolvedCount} tracks after review. ${remaining} still need attention.`
                                : `Matched all ${resolvedCount} tracks after Gemini review!`,
                        });
                    }
                }
                const validTrackUris = trackUris.filter((uri) => typeof uri === "string" && Boolean(uri));
                if (!validTrackUris.length) {
                    log(`No valid tracks found for playlist: ${sanitized.name}`);
                    continue;
                }
                const newPlaylist = await requestQueue.add(() => spotifyApi.createPlaylist(sanitized.name, {
                    description: sanitized.description,
                    public: false,
                }));
                const batchSize = 100;
                for (let i = 0; i < validTrackUris.length; i += batchSize) {
                    const batch = validTrackUris.slice(i, i + batchSize);
                    await requestQueue.add(() => spotifyApi.addTracksToPlaylist(newPlaylist.body.id, batch));
                }
                previewPayload.push({
                    id: newPlaylist.body.id,
                    name: sanitized.name,
                    description: sanitized.description,
                    embedUrl: `https://open.spotify.com/embed/playlist/${newPlaylist.body.id}?utm_source=generator`,
                    spotifyUrl: `https://open.spotify.com/playlist/${newPlaylist.body.id}`,
                    songs: sanitized.songs,
                });
            }
            catch (error) {
                const message = formatSpotifyError(error);
                log(`Error processing playlist "${playlist.name}": ${message}`);
            }
        }
        if (!previewPayload.length) {
            throw new Error("No valid playlists could be created");
        }
        res.json({ playlists: previewPayload });
    }
    catch (error) {
        const message = formatSpotifyError(error);
        log(`Error creating preview playlists: ${message}`);
        if (statusContext) {
            statusBroadcaster.statusError(statusContext, { message });
        }
        res.status(500).json({ error: message });
    }
});
playlistController.get("/user-playlists", async (req, res) => {
    try {
        const limit = 50;
        let offset = 0;
        const maxPlaylists = 200;
        const userSpotifyApi = getUserSpotifyApi(req);
        const meResponse = await requestQueue.add(() => userSpotifyApi.getMe());
        const currentUserId = meResponse.body?.id ?? "";
        const currentUserDisplayName = meResponse.body?.display_name || currentUserId || undefined;
        const collected = [];
        while (collected.length < maxPlaylists) {
            const response = await requestQueue.add(() => userSpotifyApi.getUserPlaylists({ limit, offset }));
            const items = response.body?.items ?? [];
            const total = typeof response.body?.total === "number" ? response.body.total : undefined;
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
        const message = formatSpotifyError(error);
        log(`Error fetching user playlists: ${message}`);
        const statusCode = error?.statusCode ?? error?.body?.error?.status;
        if (statusCode === 401 || statusCode === 403) {
            await clearTokenFile();
            return res.status(statusCode).json({
                error: statusCode === 401
                    ? "We need you to sign in to Spotify again."
                    : "Spotify asked for new permissions to list your playlists. Please log in again to continue.",
            });
        }
        res.status(500).json({ error: "Failed to load playlists from Spotify." });
    }
});
playlistController.get("/playlist-details", async (req, res) => {
    const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const playlistId = extractSpotifyPlaylistId(typeof rawId === "string" ? rawId.trim() : undefined);
    if (!playlistId) {
        return res.status(400).json({ error: "Playlist ID is required." });
    }
    try {
        const userSpotifyApi = getUserSpotifyApi(req);
        const playlistResponse = await requestQueue.add(() => userSpotifyApi.getPlaylist(playlistId));
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
            const batch = await requestQueue.add(() => userSpotifyApi.getPlaylistTracks(playlistId, {
                offset,
                limit: batchLimit,
            }));
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
        log(`Playlist details error: ${message}`);
        if (statusCode === 401) {
            return res.status(401).json({ error: "Log in with Spotify to continue." });
        }
        if (statusCode === 403) {
            return res.status(403).json({ error: "We don't have permission to view that playlist." });
        }
        if (statusCode === 404) {
            return res.status(404).json({ error: "Playlist not found." });
        }
        res.status(500).json({ error: "Failed to load playlist details." });
    }
});
playlistController.get("/track-preview", async (req, res) => {
    const referenceParam = Array.isArray(req.query.reference)
        ? req.query.reference[0]
        : req.query.reference;
    const uriParam = Array.isArray(req.query.uri) ? req.query.uri[0] : req.query.uri;
    const idParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const marketParam = Array.isArray(req.query.market) ? req.query.market[0] : req.query.market;
    const reference = typeof referenceParam === "string" && referenceParam.trim()
        ? referenceParam.trim()
        : typeof uriParam === "string" && uriParam.trim()
            ? uriParam.trim()
            : typeof idParam === "string" && idParam.trim()
                ? idParam.trim()
                : undefined;
    const trackId = extractTrackId(reference);
    if (!trackId) {
        return res.status(400).json({ error: "Track reference is required." });
    }
    try {
        const userSpotifyApi = getUserSpotifyApi(req);
        const response = await requestQueue.add(() => userSpotifyApi.getTrack(trackId, {
            market: typeof marketParam === "string" && marketParam.trim() ? marketParam.trim() : undefined,
        }));
        const track = response.body;
        if (!track) {
            return res.status(404).json({ error: "Track not found." });
        }
        const previewUrl = track.preview_url ?? null;
        let reason = null;
        if (!previewUrl) {
            const restrictionReason = track.restrictions?.reason;
            if (restrictionReason === "market") {
                reason = "market_restriction";
            }
            else if (restrictionReason === "product") {
                reason = "subscription_required";
            }
            else if (restrictionReason === "explicit") {
                reason = "explicit";
            }
            else if (track.is_playable === false) {
                reason = "not_playable";
            }
            else {
                reason = "no_preview";
            }
        }
        const artists = Array.isArray(track.artists)
            ? track.artists.map((artist) => artist.name).filter(Boolean)
            : [];
        res.json({
            id: track.id,
            name: track.name,
            artists,
            album: track.album?.name ?? null,
            previewUrl,
            reason,
            isPlayable: track.is_playable ?? true,
            availableMarkets: Array.isArray(track.available_markets) ? track.available_markets : undefined,
            popularity: track.popularity,
            durationMs: track.duration_ms,
            link: track.external_urls?.spotify ?? null,
        });
    }
    catch (error) {
        const statusCode = error?.statusCode ?? error?.body?.error?.status;
        const message = formatSpotifyError(error);
        log(`Track preview error for ${trackId}: ${message}`);
        if (statusCode === 404) {
            return res.status(404).json({ error: "Track not found." });
        }
        if (statusCode === 401 || statusCode === 403) {
            await clearTokenFile();
            return res.status(statusCode).json({ error: message });
        }
        res.status(500).json({ error: message || "Failed to look up track preview." });
    }
});
playlistController.post("/create-custom-playlist", async (req, res) => {
    const statusContext = createStatusContext("custom");
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }
    const selectedSongsInput = sanitizeSelectedSongs(req.body?.songs);
    const hasSelectedSongs = selectedSongsInput.length > 0;
    const playlistReference = typeof req.body?.playlistId === "string" ? req.body.playlistId.trim() : "";
    const targetPlaylistId = extractSpotifyPlaylistId(playlistReference);
    if (playlistReference && !targetPlaylistId) {
        return res.status(400).json({
            error: "Could not understand that playlist link. Paste a Spotify playlist URL or ID.",
        });
    }
    const modelParam = typeof req.body?.model === "string" ? req.body.model.trim() : undefined;
    const modelName = modelParam || undefined;
    try {
        const userSpotifyApi = getUserSpotifyApi(req);
        let existingPlaylist = null;
        if (targetPlaylistId) {
            try {
                const playlistResponse = await requestQueue.add(() => userSpotifyApi.getPlaylist(targetPlaylistId));
                existingPlaylist = playlistResponse.body;
            }
            catch (error) {
                const statusCode = error?.statusCode;
                const formatted = formatSpotifyError(error);
                log(`Failed to load target playlist ${targetPlaylistId}: ${formatted}`);
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
        if (statusContext) {
            statusBroadcaster.geminiStart(statusContext, {
                model: modelName,
                label: targetPlaylistId
                    ? "Refreshing your playlist with new ideas…"
                    : "Creating your custom playlist…",
                promptPreview: prompt.slice(0, 160),
            });
        }
        const customPlaylist = await createCustomPlaylist(prompt, modelName);
        const sanitized = sanitizePlaylist(customPlaylist);
        if (hasSelectedSongs) {
            const sanitizedSelections = selectedSongsInput.map((song) => ({
                title: song.title,
                artist: song.artist || "",
            }));
            if (!sanitizedSelections.length) {
                return res.status(400).json({ error: "No valid songs were provided." });
            }
            sanitized.songs = sanitizedSelections;
        }
        broadcastPlaylistSongs(sanitized, statusContext);
        let trackUris = [];
        let unresolved = [];
        if (hasSelectedSongs && selectedSongsInput.every((song) => Boolean(song.uri))) {
            trackUris = selectedSongsInput.map((song) => song.uri);
        }
        else {
            const lookup = await findTrackUris(userSpotifyApi, sanitized.songs, sanitized.name);
            trackUris = [...lookup.uris];
            unresolved = lookup.unresolved;
            if (hasSelectedSongs) {
                trackUris = trackUris.map((uri, index) => {
                    const provided = selectedSongsInput[index]?.uri;
                    return provided ?? uri;
                });
            }
        }
        if (unresolved.length) {
            if (statusContext) {
                statusBroadcaster.statusMessage(statusContext, {
                    message: `Verifying ${unresolved.length} tracks with Gemini…`,
                });
            }
            const { uris: resolvedUris, resolvedCount } = await resolveUnresolvedTracks(sanitized, unresolved, modelName);
            resolvedUris.forEach((uri, index) => {
                if (typeof uri === "string" && uri) {
                    trackUris[index] = uri;
                }
            });
            if (statusContext) {
                const remaining = unresolved.length - resolvedCount;
                statusBroadcaster.statusMessage(statusContext, {
                    message: remaining > 0
                        ? `Matched ${resolvedCount} tracks after review. ${remaining} still need attention.`
                        : `Matched all ${resolvedCount} tracks after Gemini review!`,
                });
            }
        }
        const validTrackUris = trackUris.filter((uri) => typeof uri === "string" && Boolean(uri));
        if (!validTrackUris.length) {
            return res
                .status(404)
                .json({ error: "No valid tracks found for the custom playlist" });
        }
        const uniqueTrackUris = Array.from(new Set(validTrackUris));
        let responsePayload;
        if (targetPlaylistId && existingPlaylist) {
            const existingTrackUris = await collectPlaylistTrackUris(userSpotifyApi, targetPlaylistId, existingPlaylist);
            const tracksToAdd = uniqueTrackUris.filter((uri) => !existingTrackUris.has(uri));
            if (tracksToAdd.length) {
                await requestQueue.add(() => userSpotifyApi.addTracksToPlaylist(targetPlaylistId, tracksToAdd));
            }
            const description = sanitized.description
                ? sanitized.description
                : existingPlaylist?.description || sanitized.name;
            if (description) {
                try {
                    await requestQueue.add(() => userSpotifyApi.changePlaylistDetails(targetPlaylistId, {
                        description,
                    }));
                }
                catch (error) {
                    log(`Failed to update playlist description for ${targetPlaylistId}: ${formatSpotifyError(error)}`);
                }
            }
            responsePayload = {
                id: targetPlaylistId,
                name: existingPlaylist?.name || sanitized.name,
                description,
                embedUrl: `https://open.spotify.com/embed/playlist/${targetPlaylistId}?utm_source=generator`,
                spotifyUrl: `https://open.spotify.com/playlist/${targetPlaylistId}`,
                songs: sanitized.songs,
                upgraded: true,
            };
        }
        else {
            const newPlaylist = await requestQueue.add(() => userSpotifyApi.createPlaylist(sanitized.name, {
                description: sanitized.description,
                public: false,
            }));
            await requestQueue.add(() => userSpotifyApi.addTracksToPlaylist(newPlaylist.body.id, uniqueTrackUris));
            responsePayload = {
                id: newPlaylist.body.id,
                name: sanitized.name,
                description: sanitized.description,
                embedUrl: `https://open.spotify.com/embed/playlist/${newPlaylist.body.id}?utm_source=generator`,
                spotifyUrl: `https://open.spotify.com/playlist/${newPlaylist.body.id}`,
                songs: sanitized.songs,
            };
        }
        if (statusContext) {
            statusBroadcaster.geminiComplete(statusContext, {
                totalPlaylists: 1,
                label: targetPlaylistId
                    ? "Suggestions ready to refresh your playlist!"
                    : "Custom playlist ready!",
                songs: sanitized.songs.slice(0, 80),
            });
        }
        res.json({ playlist: responsePayload });
    }
    catch (error) {
        const message = formatSpotifyError(error);
        log(`Error creating custom playlist: ${message}`);
        if (statusContext) {
            statusBroadcaster.statusError(statusContext, { message });
        }
        res.status(500).json({ error: message });
    }
});
export default playlistController;
