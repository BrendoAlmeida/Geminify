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
import { 
  helmetMiddleware, 
  sessionMiddleware, 
  rateLimiter, 
  authRateLimiter 
} from "../middlewares/securityMiddleware.js";

export function createApp() {
	const app = express();

	// Confiar em proxies (necessário para rate limiting funcionar corretamente)
	app.set('trust proxy', 1);

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

	// Rotas públicas (não precisam de autenticação)
	app.use(statusController); // /status-stream
	app.use(authController); // /login, /callback, /logout, /status
	app.use(geminiController); // /gemini-models (público)

	// Aplicar rate limiting específico APENAS para login e callback
	// (movido para depois de registrar as rotas para não afetar /auth/status e /auth/logout)
	
	// Rotas que precisam de autenticação
	app.use(ensureSpotifyAuth);
	app.use(chatController); // /chat-ideas
	app.use(playlistController); // todas as rotas de playlist

	app.use(errorHandler);

	return app;
}