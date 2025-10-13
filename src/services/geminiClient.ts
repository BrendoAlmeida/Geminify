import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiConfig, assertEnv } from "../config/env.js";

const apiKey = assertEnv(geminiConfig.apiKey, "GEMINI_API_KEY");

export const geminiClient = new GoogleGenerativeAI(apiKey);
