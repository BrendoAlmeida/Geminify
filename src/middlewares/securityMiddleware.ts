import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import { appConfig } from "../config/env";

// Rate limiting - 100 requests por 15 minutos por IP
export const rateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 100, // máximo 100 requests por IP
	message: {
		error: "Too many requests from this IP, please try again later."
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// Rate limiting mais restritivo para auth endpoints
export const authRateLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 10, // máximo 10 tentativas de auth por IP
	message: {
		error: "Too many authentication attempts, please try again later."
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// Configuração do Helmet para segurança
export const helmetMiddleware = helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
			fontSrc: ["'self'", "https://fonts.gstatic.com"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", "data:", "https:"],
			connectSrc: ["'self'", "https://api.spotify.com", "https://accounts.spotify.com"],
		},
	},
	crossOriginEmbedderPolicy: false,
});

// Configuração de sessões
export const sessionMiddleware = session({
	secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: !appConfig.isDevelopment, // HTTPS apenas em produção
		httpOnly: true,
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
		sameSite: 'lax'
	},
	name: 'geminify.session'
});