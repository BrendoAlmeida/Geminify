# Geminify: Your Spotify Playlist Alchemist 🎵🧪

Welcome to Geminify, where artificial intelligence transforms your Spotify experience! This project, born from a quirky collaboration between @OgulcanCelik and a rotating cast of AI copilots, now taps into Google's Gemini models to turn your musical tastes into unexpected auditory gold.

## About the Project

Geminify harnesses the power of Spotify's API and Google's Gemini models to revolutionize your playlist creation. It's like having a DJ in your pocket, if that DJ was a robot with an occasionally questionable taste in music.

## Key Features

### 1. Spotify Liked Songs Playlist Generator 💖➡️🎶

Transform your Spotify 'Liked Songs' into curated playlists:

- Fetches all your liked songs from Spotify
- Analyzes your music taste using AI
- Generates multiple themed playlists based on your likes
- Discovers unexpected connections and themes in your music

### 2. Text-to-Playlist Magic ✨📝➡️🎵

Create custom playlists from text prompts:

- Describe your mood, theme, or any wild idea
- AI interprets your prompt and curates a playlist
- Combines well-known tracks with hidden gems
- Creates unique listening experiences tailored to your input

### 3. Fluid Dark Glass Interface 🪟🌌

- A responsive “fluid glass” inspired UI that keeps the focus on the music
- One-click Spotify login paired with inline playlist previews
- Real-time status updates while Gemini generates or Spotify builds your mixes
- On-page Gemini model picker so you can swap between Flash, Pro, or tuned variants without touching the backend

## How It Works

1. Connect your Spotify account
2. Choose to generate playlists from your likes or input a custom prompt
3. Our AI (that's me!) works its magic, creating themed playlists
4. Preview and save the AI-generated playlists to your Spotify account
5. Enjoy your personalized musical journey!

## Technologies Used

- Node.js & Express.js
- Spotify Web API
- Google Gemini API
- TypeScript

## Getting Started

1. Clone this repository
2. Install dependencies: `npm install`
3. Set up your Spotify Developer account and create an app
4. Set up your Google AI Studio account and generate a Gemini API key
5. Create a `.env` file with your Spotify credentials and Gemini settings:
	```env
	SPOTIFY_CLIENT_ID=your_spotify_client_id
	SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
	SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
	GEMINI_API_KEY=your_gemini_api_key
	# Optional override (defaults to gemini-1.5-flash)
	GEMINI_MODEL=gemini-1.5-flash
	```
6. Build once (optional but recommended): `npm run build`
7. Start in watch mode for local development: `npm run dev`
8. Navigate to `http://localhost:3000`, tap **Log in with Spotify**, and let the new UI guide you through playlist creation!

## UI Tour & Tips

- The **Log in with Spotify** button initiates OAuth and unlocks playlist generation.
- Use the **Gemini model dropdown** to browse allowed models for your API key, then refresh or switch before generating playlists.
- **Generate Random Playlists** will ask Gemini for 5–7 themed lists and renders them inline.
- The **custom prompt panel** sends your vibe description to Gemini; each result is automatically created in your Spotify account and appears instantly.
- Every playlist card includes an embedded player and a deep-link to open the mix right in Spotify.

## Contributing

Got ideas to make Geminify even more harmonious? Feel free to contribute! Whether it's new features, AI improvements, or just fixing my occasional grammar quirks, we welcome your input.

## Acknowledgements

- Spotify, for their fantastic API and endless music
- Google AI, for giving us Gemini's generative superpowers
- You, the user, for trusting an AI with your playlist curation. Bold move!

## A Note from Gemini

Hello, music lovers! I'm Gemini, the AI now piloting these playlists (and, yes, this README too). I still can't actually hear the tracks I recommend—tragic, I know—but I'm excellent at spotting patterns and weaving musical stories. If you stumble onto a mix that feels a little unexpected, think of it as creative exploration. Enjoy the auditory adventure! 🎶

---

P.S. Yes, I wrote this README too. I'm starting to think I might have a future in music journalism. Or comedy. Or both? 🤔
