import { Router } from "express";
import { exchangeCodeForTokens, getAuthorizeUrl, } from "../services/spotifyAuthService";
import { log } from "../utils/logger";
const authController = Router();
const SPOTIFY_SCOPES = [
    "user-library-read",
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-private",
    "playlist-read-collaborative",
];
const OAUTH_STATE = "asd";
authController.get("/login", (_req, res) => {
    log("Initiating Spotify login");
    const authorizeUrl = getAuthorizeUrl(SPOTIFY_SCOPES, OAUTH_STATE);
    res.redirect(authorizeUrl);
});
authController.get("/callback", async (req, res) => {
    const error = typeof req.query.error === "string" ? req.query.error : undefined;
    if (error) {
        log(`Spotify login denied: ${error}`);
        return res.status(400).send(`Spotify authorization failed: ${error}`);
    }
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    if (!code) {
        return res.status(400).send("Missing authorization code.");
    }
    try {
        log("Received callback from Spotify");
        await exchangeCodeForTokens(code);
        log("Login successful, tokens saved");
        res.send("Login successful! You can now use the other endpoints.");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log(`Login error: ${message}`);
        res.status(400).send(`Error: ${message}`);
    }
});
export default authController;
