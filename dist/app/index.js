import express from "express";
import path from "path";
import statusController from "../controllers/statusController.js";
import authController from "../controllers/authController.js";
import geminiController from "../controllers/geminiController.js";
import chatController from "../controllers/chatController.js";
import playlistController from "../controllers/playlistController.js";
import { ensureSpotifyAuth } from "../middlewares/spotifyAuthMiddleware.js";
import { errorHandler } from "../middlewares/errorHandler.js";
import { publicDir } from "../config/paths.js";
import { helmetMiddleware, sessionMiddleware, rateLimiter, authRateLimiter } from "../middlewares/securityMiddleware.js";
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
