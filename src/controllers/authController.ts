import { Router } from "express";
import {
	exchangeCodeForTokens,
	getAuthorizeUrl,
} from "../services/spotifyAuthService.js";
import { log } from "../utils/logger.js";
import { authRateLimiter } from "../middlewares/securityMiddleware.js";

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

authController.get("/login", authRateLimiter, (req, res) => {
	// Sempre destruir a sessão anterior para forçar novo login
	req.session.destroy((err) => {
		if (err) {
			log(`Error destroying session on login: ${err}`);
		}
		
		log("Initiating Spotify login");
		const authorizeUrl = getAuthorizeUrl(SPOTIFY_SCOPES, OAUTH_STATE);
		// Forçar Spotify a mostrar tela de seleção de conta
		const urlWithPrompt = `${authorizeUrl}&show_dialog=true`;
		res.redirect(urlWithPrompt);
	});
});

authController.get("/callback", async (req, res) => {
	const error = typeof req.query.error === "string" ? req.query.error : undefined;
	if (error) {
		log(`Spotify login denied: ${error}`);
		return res.redirect("/?error=access_denied");
	}

	const code = typeof req.query.code === "string" ? req.query.code : undefined;
	const state = typeof req.query.state === "string" ? req.query.state : undefined;

	log(`Callback received - Code exists: ${!!code}, State: ${state}, Expected state: ${OAUTH_STATE}`);

	if (!code) {
		log("Callback: missing authorization code");
		return res.redirect("/?error=missing_code");
	}

	if (state !== OAUTH_STATE) {
		log(`Callback: invalid state. Expected: ${OAUTH_STATE}, Got: ${state}`);
		return res.redirect("/?error=invalid_state");
	}

	try {
		log(`Received callback from Spotify, exchanging code for tokens. Code length: ${code.length}`);
		const tokenData = await exchangeCodeForTokens(code);
		
		// Log detalhado do token recebido (sem expor tokens sensíveis)
		log(`Token exchange successful. User: ${tokenData.user_data?.display_name || 'unknown'}`);
		
		// Regenerar sessão para garantir que está limpa e funcional
		req.session.regenerate((err) => {
			if (err) {
				log(`Error regenerating session: ${JSON.stringify(err)}`);
				return res.redirect("/?error=session_error");
			}
			
			// Salvar dados do usuário na nova sessão
			req.session.user = {
				id: tokenData.user_data.id,
				email: tokenData.user_data.email,
				display_name: tokenData.user_data.display_name,
				access_token: tokenData.access_token,
				refresh_token: tokenData.refresh_token,
				expires_at: tokenData.expires_at,
			};
			
			// Salvar sessão explicitamente antes de redirecionar
			req.session.save((saveErr) => {
				if (saveErr) {
					log(`Error saving session: ${JSON.stringify(saveErr)}, Stack: ${saveErr.stack || 'no stack'}`);
					return res.redirect("/?error=session_error");
				}
				
				log(`✅ Login successful for user ${tokenData.user_data.display_name} (${tokenData.user_data.id})`);
				res.redirect("/?login=success");
			});
		});
	} catch (err) {
		// Log detalhado do erro do Spotify
		let errorDetails = 'Unknown error';
		
		if (err instanceof Error) {
			errorDetails = `${err.name}: ${err.message}`;
			
			// Extrair detalhes específicos do WebapiError
			const webApiError = err as any;
			if (webApiError.body) {
				errorDetails += ` | Body: ${JSON.stringify(webApiError.body)}`;
			}
			if (webApiError.statusCode) {
				errorDetails += ` | Status: ${webApiError.statusCode}`;
			}
			if (webApiError.headers) {
				errorDetails += ` | Headers: ${JSON.stringify(webApiError.headers)}`;
			}
			if (err.stack) {
				errorDetails += ` | Stack: ${err.stack}`;
			}
		} else {
			errorDetails = JSON.stringify(err);
		}
		
		log(`Login error: ${errorDetails}`);
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
		
		// Limpar cookie de sessão explicitamente (nome correto: geminify-session)
		res.clearCookie("geminify-session");
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
	} else {
		res.json({ logged_in: false });
	}
});

export default authController;
