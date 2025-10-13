import { Router } from "express";
import { fetchGeminiModels } from "../services/playlistService.js";
import { log } from "../utils/logger.js";
const geminiController = Router();
geminiController.get("/gemini-models", async (_req, res) => {
    try {
        const catalog = await fetchGeminiModels();
        res.json(catalog);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch Gemini models";
        log(`Gemini model fetch failed: ${message}`);
        res.status(500).json({ error: message });
    }
});
export default geminiController;
