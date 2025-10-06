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

export function createApp() {
	const app = express();

	app.use(express.json());
	app.use(express.static(publicDir));

	app.get("/", (_req, res) => {
		res.sendFile(path.join(publicDir, "index.html"));
	});

	app.use(statusController);
	app.use(authController);
	app.use(geminiController);
	app.use(chatController);

	app.use(ensureSpotifyAuth);
	app.use(playlistController);

	app.use(errorHandler);

	return app;
}