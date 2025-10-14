import { Router } from "express";
import { log } from "../utils/logger.js";
import {
	sanitizeChatPayload,
	validateLatestMessage,
} from "../services/playlistService.js";
import { generateChatSuggestion } from "../services/geminiService.js";
import { createUserSpotifyApi } from "../services/spotifyAuthService.js";

const chatController = Router();

chatController.post("/chat-ideas", async (req, res) => {
	try {
		const { messages, modelName, playlistContext } = sanitizeChatPayload(req.body);

		if (!messages.length) {
			return res.status(400).json({ error: "Messages are required." });
		}

		try {
			validateLatestMessage(messages);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Invalid chat payload.";
			return res.status(400).json({ error: message });
		}

		// Criar API do Spotify do usuário da sessão
		const userApi = req.session.user
			? createUserSpotifyApi(
					req.session.user.access_token,
					req.session.user.refresh_token
			  )
			: undefined;

		const suggestion = await generateChatSuggestion(
			messages,
			modelName,
			playlistContext,
			userApi
		);

		res.json(suggestion);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "We couldn't get suggestions from the model right now.";
		log(`Chat ideas error: ${message}`);

		if (error instanceof Error && /required/i.test(message)) {
			return res.status(400).json({ error: message });
		}

		res.status(500).json({ error: "We couldn't get suggestions from the model right now." });
	}
});

export default chatController;
