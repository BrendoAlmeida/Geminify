import { Router } from "express";
import { exchangeCodeForTokens, getAuthorizeUrl, } from "../services/spotifyAuthService.js";
import { log } from "../utils/logger.js";
const authController = Router();
const SPOTIFY_SCOPES = [
    "user-library-read",
    "playlist-modify-private",
    "playlist-modify-public",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-private",
    "user-read-email",
];
const OAUTH_STATE = "geminify-auth";
authController.get("/login", (req, res) => {
    // Se já estiver logado, redirecionar para home
    if (req.session.user) {
        return res.redirect("/");
    }
    log("Initiating Spotify login");
    const authorizeUrl = getAuthorizeUrl(SPOTIFY_SCOPES, OAUTH_STATE);
    res.redirect(authorizeUrl);
});
authController.get("/callback", async (req, res) => {
    const error = typeof req.query.error === "string" ? req.query.error : undefined;
    if (error) {
        log(`Spotify login denied: ${error}`);
        return res.redirect("/?error=access_denied");
    }
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code) {
        return res.redirect("/?error=missing_code");
    }
    if (state !== OAUTH_STATE) {
        return res.redirect("/?error=invalid_state");
    }
    try {
        log("Received callback from Spotify");
        const tokenData = await exchangeCodeForTokens(code);
        // Salvar dados do usuário na sessão
        req.session.user = {
            id: tokenData.user_data.id,
            email: tokenData.user_data.email,
            display_name: tokenData.user_data.display_name,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: tokenData.expires_at,
        };
        log(`Login successful for user ${tokenData.user_data.display_name} (${tokenData.user_data.id})`);
        res.redirect("/?login=success");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log(`Login error: ${message}`);
        res.redirect("/?error=login_failed");
    }
});
authController.get("/logout", (req, res) => {
    const userName = req.session.user?.display_name || "unknown";
    req.session.destroy((err) => {
        if (err) {
            log(`Error destroying session: ${err}`);
            return res.status(500).json({ error: "Failed to logout" });
        }
        log(`User ${userName} logged out`);
        res.redirect("/?logout=success");
    });
});
authController.get("/status", (req, res) => {
    if (req.session.user) {
        res.json({
            logged_in: true,
            user: {
                id: req.session.user.id,
                display_name: req.session.user.display_name,
                email: req.session.user.email,
            },
        });
    }
    else {
        res.json({ logged_in: false });
    }
});
export default authController;
