import express from "express";
import path from "path";
import statusController from "../controllers/statusController";
import authController from "../controllers/authController";
import geminiController from "../controllers/geminiController";
import chatController from "../controllers/chatController";
import playlistController from "../controllers/playlistController";
import { ensureSpotifyAuth } from "../middlewares/spotifyAuthMiddleware";
import { errorHandler } from "../middlewares/errorHandler";
import { publicDir } from "../config/paths";
import { helmetMiddleware, sessionMiddleware, rateLimiter, authRateLimiter } from "../middlewares/securityMiddleware";
export function createApp() {
    const app = express();
    // Middlewares de segurança
    app.use(helmetMiddleware);
    app.use(sessionMiddleware);
    app.use(rateLimiter);
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(express.static(publicDir));
    app.get("/", (_req, res) => {
        res.sendFile(path.join(publicDir, "index.html"));
    });
    // Aplicar rate limiting específico para rotas de auth
    app.use("/login", authRateLimiter);
    app.use("/callback", authRateLimiter);
    app.use(statusController);
    app.use(authController);
    app.use(geminiController);
    app.use(chatController);
    // Rotas que precisam de autenticação
    app.use(ensureSpotifyAuth);
    app.use(playlistController);
    app.use(errorHandler);
    return app;
}
