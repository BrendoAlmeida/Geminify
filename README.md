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
- Already have a playlist you adore? Paste the link and Geminify will append a fresh set of tracks without nuking the originals

### 3. Fluid Dark Glass Interface 🪟🌌

- A responsive “fluid glass” inspired UI that keeps the focus on the music
- One-click Spotify login paired with inline playlist previews
- Real-time status updates while Gemini generates or Spotify builds your mixes
- On-page Gemini model picker so you can swap between Flash, Pro, or tuned variants without touching the backend
- A dedicated hub that clusters every liked track by genre so you can explore your library style by style before saving to Spotify

### 4. Idea Lounge & Chat-to-Playlist Studio 💬🎛️

- Switch to the new chat view when you want to brainstorm narratives or vibes with Gemini
- Capture curated theme tags and song suggestions, then turn the chat history into a ready-to-save Spotify playlist
- Inject context on the fly by sharing your liked songs or loading an existing playlist so Gemini can riff on what you already love
- Track every response step-by-step and keep collaborating until the mix feels perfect

### 5. Bilingual UI & Instant Song Previews 🌍🎧

- Toggle between English and Brazilian Portuguese with the inline language switcher—no reload required
- Preview suggested tracks without leaving the page, complete with mini player controls and clear reasons when Spotify can’t provide a clip
- Enjoy consistent copy updates across the app as you switch languages, including live status banners and tooltips

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
3. Gather credentials (see the walkthrough below)
4. Run the guided setup: `npm run setup`
5. Build once (optional but recommended): `npm run build`
6. Start in watch mode for local development: `npm run dev`
7. Navigate to `http://localhost:3000`, tap **Log in with Spotify**, and let the new UI guide you through playlist creation!

### Where to find the credentials

**Spotify:**

1. Visit the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new application (or reuse an existing one)
3. In *Settings*, add `http://127.0.0.1:3000/callback` as a Redirect URI
4. Copy the Client ID and Client Secret for the setup script

**Google Gemini:**

1. Head to [Google AI Studio](https://makersuite.google.com/)
2. Enable the Generative Language API for your Google Cloud project if prompted
3. Generate a new API key under *Get API Key*
4. Keep that key handy—the setup script will ask for it

Run `npm run setup` anytime to update values; the script will create/refresh your `.env` automatically.

## UI Tour & Tips

- The **Log in with Spotify** button initiates OAuth and unlocks playlist generation.
- Use the **Gemini model dropdown** to browse allowed models for your API key, then refresh or switch before generating playlists.
- **Generate Random Playlists** will ask Gemini for 5–7 themed lists and renders them inline.
- Watch the **live status ticker** to follow each step and see track names stream in while Gemini curates your mix.
- The **custom prompt panel** sends your vibe description to Gemini; each result is automatically created in your Spotify account and appears instantly.
- Use the new **playlist picker** to quickly choose one of your Spotify playlists for enhancement, or paste a link/ID if you prefer manual control.
- Tap the **Idea lounge** tab to hop into the chat workspace, capture tags, preview suggested songs, and transform the conversation into a playlist.
- The **language switcher** in the corner keeps the entire UI in sync whether you prefer English or pt-BR.
- Song suggestion cards now include mini players and preview availability hints so you know why a clip might be missing.
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
