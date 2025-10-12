const canvas = document.getElementById("background");
const ctx = canvas?.getContext("2d");
const dpr = window.devicePixelRatio || 1;
const blobs = Array.from({ length: 5 }, (_, index) => ({
  radius: 280 + Math.random() * 120,
  hue: 175 + Math.random() * 70,
  alpha: 0.18 + Math.random() * 0.12,
  speed: 0.0006 + Math.random() * 0.0008,
  offset: Math.random() * Math.PI * 2,
  xFactor: 0.3 + Math.random() * 0.7,
  yFactor: 0.3 + Math.random() * 0.7,
  direction: index % 2 === 0 ? 1 : -1,
}));

function resizeCanvas() {
  if (!canvas || !ctx) return;
  const { innerWidth, innerHeight } = window;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function drawBackground(timestamp = 0) {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "lighter";

  blobs.forEach((blob) => {
    const pulse = Math.sin(timestamp * blob.speed + blob.offset) * 0.5 + 0.5;
    const x = canvas.width / dpr * (blob.xFactor + 0.2 * Math.sin(timestamp * blob.speed * 0.6));
    const y = canvas.height / dpr * (blob.yFactor + 0.25 * Math.cos(timestamp * blob.speed * blob.direction));
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, blob.radius * (0.7 + pulse * 0.4));
    gradient.addColorStop(0, `hsla(${blob.hue}, 85%, ${60 + pulse * 20}%, ${blob.alpha})`);
    gradient.addColorStop(1, "rgba(5, 5, 16, 0)");

    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.arc(x, y, blob.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalCompositeOperation = "source-over";
  requestAnimationFrame(drawBackground);
}

resizeCanvas();
requestAnimationFrame(drawBackground);
window.addEventListener("resize", resizeCanvas);

const previewButton = document.getElementById("previewButton");
const loginButton = document.getElementById("loginButton");
const resultsContainer = document.getElementById("results");
const customForm = document.getElementById("customForm");
const customPrompt = document.getElementById("customPrompt");
const targetPlaylistInput = document.getElementById("targetPlaylist");
const playlistSelect = document.getElementById("playlistSelect");
const playlistSelectStatus = document.getElementById("playlistSelectStatus");
const refreshPlaylistsButton = document.getElementById("refreshPlaylists");
const formStatus = document.getElementById("formStatus");
const modelSelect = document.getElementById("modelSelect");
const modelStatus = document.getElementById("modelStatus");
const refreshModelsButton = document.getElementById("refreshModels");
const liveStatus = document.getElementById("liveStatus");
const liveStatusLabel = document.querySelector(".live-status__label");
const statusSteps = document.getElementById("statusSteps");
const tickerInner = document.getElementById("tickerInner");
const groupGenresButton = document.getElementById("groupGenresButton");
const genreStatus = document.getElementById("genreStatus");
const genreResults = document.getElementById("genreResults");
const viewButtons = Array.from(document.querySelectorAll("[data-view-target]"));
const playlistView = document.getElementById("playlistsView");
const chatView = document.getElementById("chatView");
const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatStatus = document.getElementById("chatStatus");
const chatSendButton = document.getElementById("chatSendButton");
const chatResetButton = document.getElementById("chatResetButton");
const chatPlaylistSelect = document.getElementById("chatPlaylistSelect");
const chatRefreshPlaylistsButton = document.getElementById("chatRefreshPlaylists");
const chatPlaylistHint = document.getElementById("chatPlaylistHint");
const chatCreationStatus = document.getElementById("chatCreationStatus");
const themeTagList = document.getElementById("themeTagList");
const songSuggestionList = document.getElementById("songTagList");
const chatCreatePlaylistButton = document.getElementById("chatCreatePlaylistButton");
const chatUploadToggle = document.getElementById("chatUploadToggle");
const chatUploadDropdown = document.getElementById("chatUploadDropdown");
const sendLikedSongsButton = document.getElementById("sendLikedSongs");
const chatOpenPlaylistModalButton = document.getElementById("chatOpenPlaylistModal");
const chatPlaylistModal = document.getElementById("chatPlaylistModal");
const chatPlaylistModalCloseButton = document.getElementById("chatPlaylistModalClose");
const chatPlaylistModalCancelButton = document.getElementById("chatPlaylistModalCancel");
const chatSendPlaylistContextButton = document.getElementById("chatSendPlaylistContext");
const chatPlaylistModalBackdrop = chatPlaylistModal?.querySelector("[data-modal-close]");
const languageSwitcher = document.querySelector(".language-switcher");
const languageButtons = Array.from(document.querySelectorAll(".language-switcher__option"));
const htmlElement = document.documentElement;
const mixPlaylistSelect = document.getElementById("mixPlaylistSelect");
const mixPlaylistButton = document.getElementById("mixPlaylistButton");
const mixStatus = document.getElementById("mixStatus");
const mixResults = document.getElementById("mixResults");

let mixProcessing = false;
const mixState = {
  lastPayload: null,
  statusKey: null,
  statusReplacements: {},
  statusFallback: "",
  statusType: "",
  pending: false,
};

const songSuggestionPreviewState = {
  activeId: null,
  audio: null,
  button: null,
  card: null,
  item: null,
  isPlaying: false,
  suggestion: null,
  miniPlayer: null,
  volume: 1,
};

const songPreviewLookupState = {
  inFlight: new Map(),
  completed: new Set(),
};

function registerSongSuggestionDebugTools() {
  if (typeof window === "undefined") {
    return;
  }

  const listSongSuggestions = () =>
    chatState.songSuggestions.map((song, index) => ({
      index,
      id: song.id,
      title: song.title,
      artist: song.artist,
      previewUrl: song.previewUrl ?? null,
      uri: song.uri ?? null,
      spotifyUrl: song.spotifyUrl ?? null,
      reason: song.previewUnavailableReason ?? null,
    }));

  const checkSongPreview = async (identifier) => {
    const suggestion =
      typeof identifier === "number"
        ? chatState.songSuggestions[identifier]
        : chatState.songSuggestions.find(
            (song) =>
              song?.id === identifier ||
              song?.uri === identifier ||
              song?.spotifyUrl === identifier ||
              song?.title === identifier
          );

    if (!suggestion) {
      throw new Error("Song suggestion not found. Pass an index, id, uri, or title.");
    }

    const reference = getSongPreviewReference(suggestion);
    if (!reference) {
      throw new Error("Suggestion does not contain a Spotify reference to inspect.");
    }

    const response = await fetch(`/track-preview?reference=${encodeURIComponent(reference)}`);
    if (!response.ok) {
      throw new Error(`Preview lookup failed with status ${response.status}`);
    }
    return response.json();
  };

  const debugInterface = Object.freeze({
    listSongSuggestions,
    checkSongPreview,
    songPreviewLookupState,
  });

    window.geminifyDebug = Object.assign({}, window.geminifyDebug || {}, {
    songs: debugInterface,
  });
}

const LOCALE_STORAGE_KEY = "claudify:locale";
const DEFAULT_LOCALE = "en";
const SUPPORTED_LOCALES = ["en", "pt-BR"];

const TRANSLATIONS = {
  en: {
    meta: {
      title: "Claudify · AI Playlist Curator",
    },
    lang: {
      selector: "Language selector",
      option: {
        enFull: "English",
        ptFull: "Português (Brasil)",
      },
    },
    nav: {
      aria: "Toggle creation mode",
      playlists: {
        title: "Playlist generator",
        hint: "Create or enhance playlists with Gemini + Spotify",
      },
      chat: {
        title: "Idea lounge",
        hint: "Chat with the Geminify and capture tags",
      },
    },
    hero: {
      playlists: {
        title: "Craft soundscapes with AI + Spotify",
        subtitle:
          "Spin up immersive playlists with a tap or describe the vibe and let Gemini curate a bespoke playlist in seconds.",
        login: "Log in with Spotify",
        preview: "Generate Random Playlists",
      },
    },
    custom: {
      title: "Dream up a custom playlist",
      description:
        "Describe a mood, scene, story, or genre-bending idea. Gemini will weave 20+ tracks into a cohesive playlist, then we push it straight to your Spotify.",
    },
    models: {
      label: "Gemini model",
      refresh: "Refresh",
      loading: "Loading models…",
      status: {
        connecting: "Connecting to Gemini…",
      },
    },
    forms: {
      custom: {
        placeholder:
          "e.g. A neon-lit midnight drive through Tokyo blending synthwave, future funk, and vapor soul",
        submit: "Create Custom Playlist",
      },
      upgrade: {
        title: "Improve an existing playlist (optional)",
        selectLabel: "Choose from your playlists",
        loading: "Loading playlists…",
        refresh: "Refresh",
        placeholder: "Paste a Spotify playlist link or ID",
        help:
          "We’ll keep the playlist and add fresh tracks from your prompt. Leave blank to create a brand-new playlist.",
      },
    },
    genre: {
      title: "Organize liked songs by genre",
      description:
        "Build smart collections from every track you've liked. We'll gather your saved songs, detect dominant styles, and shape ready-to-save playlists per genre.",
      cta: "Group liked songs by genre",
    },
    results: {
      title: "Your generated playlists",
      description:
        "Newly created Spotify playlists appear below. Press play inline or open them directly in Spotify to keep the vibe going.",
    },
    live: {
      tuning: "Tuning Gemini's frequency…",
      waiting: "Waiting for tracks…",
      creating: "Creating playlists…",
      ready: "Playlists ready!",
      error: "Something went wrong",
      liked: {
        loading: "Loading liked songs…",
        loaded: "Liked songs loaded",
      },
      genre: {
        organizing: "Organizing by genre…",
        ready: "Genre playlists ready!",
      },
      gemini: {
        suggesting: "Gemini is suggesting tracks…",
        curating: "Gemini is curating “{name}”",
      },
    },
    chat: {
      hero: {
        title: "Brainstorm playlists in chat",
        subtitle:
          "Trade ideas with Gemini in a chat-style flow and capture ready-to-use tags and song snippets for your next mix.",
      },
      sender: {
        assistant: "Geminify",
        user: "You",
      },
      playlistContext: {
        title: "Playlist context",
        description:
          "Pick an existing Spotify playlist to guide Gemini's suggestions. Leave empty to brainstorm from scratch.",
        label: "Enhance an existing playlist (optional)",
        loading: "Loading playlists…",
        refresh: "Refresh",
      },
      panel: {
        title: "Chat with the model",
        description:
          "Share the mood, references, or stories you want to translate into music. Gemini replies with insights and optional tags to power up your playlist.",
      },
      steps: {
        toggle: "View response steps",
        item: "Step",
        status: {
          analysis: "Analyzing the request…",
          spotify_search: "Searching Spotify…",
          finalize: "Finalizing response…",
        },
      },
      initialMessage:
        "Hey! Tell me the vibe, context, or inspiration you're exploring and I'll bring ideas, potential tags, and song examples.",
      form: {
        label: "Message for the model",
        placeholder: "e.g. I want a cozy playlist with indie game lo-fi",
        send: "Send",
        create: "Create playlist from chat",
        reset: "Reset chat & tags",
      },
      tags: {
        themeTitle: "Vibes & narratives",
        themeDescription: "Collect quick keywords for vibe, genre, or references.",
        emptyTheme: "No tags yet. Start chatting with the model!",
        songTitle: "Suggested songs",
  songDescription: "Preview songs and remove the ones you don't want to keep.",
        emptySong: "When suggestions arrive, they’ll show up here.",
      },
      actions: {
        toggleUploads: "Send context options",
        sendLikedSongs: "Send liked songs",
        updatePlaylist: "Update playlist",
      },
      liked: {
        sending: "Sending to Geminify…",
        sentSummary: "Sent {total} liked songs. Here are a few highlights:",
        sentSummaryNoHighlights: "Sent {total} liked songs.",
        more: "… +{count} more",
        already: "Liked songs already uploaded.",
      },
      playlistModal: {
        title: "Update playlist with context",
        description: "Select an existing playlist to share its songs before chatting or creating updates.",
        send: "Send playlist",
        cancel: "Cancel",
        close: "Close",
        missingSelection: "Select a playlist before sending.",
        sending: "Sending playlist context…",
        ready: "Playlist context activated! Ask for updates or new angles.",
        sentSummary: "Loaded playlist “{name}” with {total} tracks. Here are a few highlights:",
        sentSummaryNoHighlights: "Loaded playlist “{name}” with {total} tracks.",
        more: "… +{count} more",
        already: "That playlist is already active in this chat.",
      },
      songs: {
        preview: "Preview",
        stopPreview: "Stop",
        remove: "Remove",
        removeAria: "Remove {title}",
        select: "Select song",
        selectBeforeCreate: "Keep at least one suggested song before creating a playlist.",
  unknownSong: "Unknown song",
        playPreview: "Play preview",
        pausePreview: "Pause preview",
        closePlayer: "Close mini player",
        playerNowPlaying: "Now playing",
  volume: "Volume",
        noPreview: "No preview available for this song.",
        previewUnavailableReason: {
          no_preview: "Spotify didn't provide a preview for this song.",
          market_restriction: "Preview restricted in your region.",
          subscription_required: "Preview requires Spotify Premium or a supported device.",
          explicit: "Preview blocked because the track is marked explicit.",
          not_playable: "Spotify reports this track isn't currently playable.",
          auth_required: "Connect your Spotify account to enable previews.",
          error: "We couldn't check the preview right now.",
          unknown: "Preview unavailable for an unknown reason.",
        },
        prompt: {
          baseSelected:
            "Create a cohesive Spotify playlist using only the songs the user kept from the suggestions. Provide a captivating name and a short description that reflects the chat context and these tracks.",
          keepSelection: "Do not add or remove songs. Feel free to suggest an order that enhances flow.",
        },
      },
    },
    footer: {
      note: "Built with ❤️ using Spotify Web API and Google Gemini",
    },
    loading: {
      preview: [
        "Calling Gemini",
        "Curating themed playlists",
        "Finding matching Spotify tracks",
        "Building playlist embeds",
      ],
      custom: [
        "Reading your prompt",
        "Curating the perfect sequence",
        "Matching tracks on Spotify",
        "Publishing your playlist",
      ],
      customUpgrade: [
        "Reading your prompt",
        "Curating the perfect sequence",
        "Matching tracks on Spotify",
        "Refreshing your playlist",
      ],
      genre: [
        "Loading liked songs",
        "Collecting artist genres",
        "Building playlists by style",
        "Ready to listen",
      ],
    },
    copy: {
      song: {
        one: "song",
        other: "songs",
      },
      playlist: {
        one: "playlist",
        other: "playlists",
      },
    },
    strings: {
      "Liked songs loaded ({total})": "Liked songs loaded ({total})",
      "Grouping your liked songs…": "Grouping your liked songs…",
      "Collecting genres ({processed}/{total} artists)": "Collecting genres ({processed}/{total} artists)",
      "Building playlists ({processed}/{total} songs)": "Building playlists ({processed}/{total} songs)",
      "Done! {playlists} genre playlists with {songs} songs.": "Done! {playlists} genre playlists with {songs} songs.",
      "Done! {playlists} genre playlists.": "Done! {playlists} genre playlists.",
      "Select a Gemini model to start generating.": "Select a Gemini model to start generating.",
      "Tokens in/out: {input} / {output}": "Tokens in/out: {input} / {output}",
      "Input tokens: {value}": "Input tokens: {value}",
      "Output tokens: {value}": "Output tokens: {value}",
      "Loading available Gemini models…": "Loading available Gemini models…",
      "Failed to load Gemini models": "Failed to load Gemini models",
      "No Gemini models available for this API key": "No Gemini models available for this API key",
      "Could not load Gemini models": "Could not load Gemini models",
      "Loading…": "Loading…",
      "Unavailable": "Unavailable",
      "Loading playlists": "Loading playlists",
      "Paste a link or choose a playlist (optional)": "Paste a link or choose a playlist (optional)",
      "We’ll enhance “{label}”": "We’ll enhance “{label}”",
      "Using a custom link/ID. Make sure the playlist is yours or collaborative.": "Using a custom link/ID. Make sure the playlist is yours or collaborative.",
      "Remove tag {tag}": "Remove tag {tag}",
      "Select a playlist to enhance (optional)": "Select a playlist to enhance (optional)",
      "No playlists found": "No playlists found",
      "We couldn't find playlists in your account yet.": "We couldn't find playlists in your account yet.",
      "Enhancing “{name}” with {count} {songsLabel} loaded.": "Enhancing “{name}” with {count} {songsLabel} loaded.",
      "Select “{name}” to load songs for enhancement.": "Select “{name}” to load songs for enhancement.",
      "Loading songs from “{name}”…": "Loading songs from “{name}”…",
      "Log in with Spotify to load this playlist.": "Log in with Spotify to load this playlist.",
      "We need new Spotify permissions to view this playlist.": "We need new Spotify permissions to view this playlist.",
      "Couldn't load playlist songs.": "Couldn't load playlist songs.",
      "Playlist details were incomplete.": "Playlist details were incomplete.",
      "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.": "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.",
      "Focus tags: {tags}": "Focus tags: {tags}",
      "Song references to echo or build around: {tags}": "Song references to echo or build around: {tags}",
      " ({count} {songsLabel})": " ({count} {songsLabel})",
      "Existing playlist to enhance: “{name}”{countLabel}.": "Existing playlist to enhance: “{name}”{countLabel}.",
      "Description: {description}": "Description: {description}",
      "Current track highlights:\n{highlights}": "Current track highlights:\n{highlights}",
      "Conversation notes:\n{conversation}": "Conversation notes:\n{conversation}",
      "Write a message before sending.": "Write a message before sending.",
      "Hold on a moment—still loading playlist details.": "Hold on a moment—still loading playlist details.",
      "Checking with Gemini…": "Checking with Gemini…",
      "Sending…": "Sending…",
      "Reply received!": "Reply received!",
      "Conversation refreshed, no new tags this time.": "Conversation refreshed, no new tags this time.",
      "Tags updated!": "Tags updated!",
      "We couldn’t chat with the Geminify right now.": "We couldn’t chat with the Geminify right now.",
      "Chat with Gemini or capture some tags before creating a playlist.": "Chat with Gemini or capture some tags before creating a playlist.",
      "We need more chat context or tags to craft a playlist.": "We need more chat context or tags to craft a playlist.",
      "Creating…": "Creating…",
      "Creating a playlist from your chat…": "Creating a playlist from your chat…",
      "Playlist created from your chat! Opening the playlists view…": "Playlist created from your chat! Opening the playlists view…",
      "Playlist refreshed!": "Playlist refreshed!",
      "Custom playlist ready!": "Custom playlist ready!",
      "Log in with Spotify to create playlists.": "Log in with Spotify to create playlists.",
      "Couldn't create a playlist from chat.": "Couldn't create a playlist from chat.",
      "Loading your playlists…": "Loading your playlists…",
      "Sign in to load your playlists": "Sign in to load your playlists",
      "We need new permissions to list your playlists. Click ‘Log in with Spotify’.": "We need new permissions to list your playlists. Click ‘Log in with Spotify’.",
      "Sign in with Spotify to choose an existing playlist.": "Sign in with Spotify to choose an existing playlist.",
      "Sign in with Spotify to enhance an existing playlist.": "Sign in with Spotify to enhance an existing playlist.",
      "Select a playlist (optional)": "Select a playlist (optional)",
      "Playlists refreshed! Pick one to enhance.": "Playlists refreshed! Pick one to enhance.",
      "Pick a playlist to enhance or paste a link below.": "Pick a playlist to enhance or paste a link below.",
      "Load again": "Load again",
      "Playlist preview for {name}": "Playlist preview for {name}",
      "Open in Spotify": "Open in Spotify",
      "No liked songs to group just yet.": "No liked songs to group just yet.",
      "Genre playlist": "Genre playlist",
      "Collection built from your liked songs.": "Collection built from your liked songs.",
      "View songs ({count})": "View songs ({count})",
      "Track {index}": "Track {index}",
      "Unknown artist": "Unknown artist",
      "… and {count} more songs": "… and {count} more songs",
      "Generating…": "Generating…",
      "Spotify login required": "Spotify login required",
      "Failed to generate playlists": "Failed to generate playlists",
      "Generation failed": "Generation failed",
  "Please describe the playlist vibe first.": "Please describe the playlist vibe first.",
  "Spinning up your playlist…": "Spinning up your playlist…",
      "Playlist updated with fresh tracks on Spotify!": "Playlist updated with fresh tracks on Spotify!",
      "Custom playlist created and added to Spotify!": "Custom playlist created and added to Spotify!",
      "Please log in with Spotify to continue.": "Please log in with Spotify to continue.",
      "Organizing…": "Organizing…",
      "Grouping your liked songs…": "Grouping your liked songs…",
      "Couldn't group songs by genre.": "Couldn't group songs by genre.",
      "Sign in with Spotify to continue.": "Sign in with Spotify to continue.",
  "Failed to create playlist": "Failed to create playlist",
  "The server didn't return a playlist.": "The server didn't return a playlist.",
    },
  },
  "pt-BR": {
    meta: {
      title: "Claudify · Curador de playlists com IA",
    },
    lang: {
      selector: "Seletor de idioma",
      option: {
        enFull: "Inglês",
        ptFull: "Português (Brasil)",
      },
    },
    nav: {
      aria: "Alternar modo de criação",
      playlists: {
        title: "Gerador de playlists",
        hint: "Crie ou aprimore playlists com Gemini + Spotify",
      },
      chat: {
        title: "Sala de ideias",
        hint: "Converse com o Geminify e capture tags",
      },
    },
    hero: {
      playlists: {
        title: "Crie paisagens sonoras com IA + Spotify",
        subtitle:
          "Gere playlists imersivas com um toque ou descreva o clima e deixe o Gemini montar uma playlist sob medida em segundos.",
        login: "Entrar com Spotify",
        preview: "Gerar playlists aleatórias",
      },
    },
    custom: {
      title: "Imagine uma playlist personalizada",
      description:
        "Descreva um clima, cena, história ou ideia híbrida. O Gemini tece mais de 20 faixas em uma playlist coesa e enviamos direto para o seu Spotify.",
    },
    models: {
      label: "Modelo Gemini",
      refresh: "Atualizar",
      loading: "Carregando modelos…",
      status: {
        connecting: "Conectando ao Gemini…",
      },
    },
    forms: {
      custom: {
        placeholder:
          "ex.: Um rolê noturno em Tóquio com synthwave, future funk e vapor soul",
        submit: "Criar playlist personalizada",
      },
      upgrade: {
        title: "Melhore uma playlist existente (opcional)",
        selectLabel: "Escolha entre suas playlists",
        loading: "Carregando playlists…",
        refresh: "Atualizar",
        placeholder: "Cole um link ou ID de playlist do Spotify",
        help:
          "Mantemos a playlist e adicionamos faixas novas a partir do seu prompt. Deixe em branco para criar uma playlist inédita.",
      },
    },
    genre: {
      title: "Organize músicas curtidas por gênero",
      description:
        "Monte coleções inteligentes com todas as faixas que você curtiu. Buscamos suas músicas salvas, detectamos estilos dominantes e criamos playlists prontas por gênero.",
      cta: "Agrupar músicas curtidas por gênero",
    },
    results: {
      title: "Suas playlists geradas",
      description:
        "As playlists novas aparecem abaixo. Dê play aqui mesmo ou abra no Spotify para manter o clima.",
    },
    live: {
      tuning: "Ajustando a frequência do Gemini…",
      waiting: "Aguardando faixas…",
      creating: "Criando playlists…",
      ready: "Playlists prontas!",
      error: "Algo deu errado",
      liked: {
        loading: "Carregando músicas curtidas…",
        loaded: "Músicas curtidas carregadas",
      },
      genre: {
        organizing: "Organizando por gênero…",
        ready: "Playlists por gênero prontas!",
      },
      gemini: {
        suggesting: "Gemini está sugerindo faixas…",
        curating: "Gemini está curando “{name}”",
      },
    },
    chat: {
      hero: {
        title: "Crie playlists conversando",
        subtitle:
          "Troque ideias com o Gemini em formato de chat e capture tags e sugestões rápidas para a sua próxima playlist.",
      },
      sender: {
        assistant: "Geminify",
        user: "Você",
      },
      playlistContext: {
        title: "Contexto da playlist",
        description:
          "Escolha uma playlist do Spotify para guiar as sugestões do Gemini. Deixe vazio para começar do zero.",
        label: "Aprimorar uma playlist existente (opcional)",
        loading: "Carregando playlists…",
        refresh: "Atualizar",
      },
      panel: {
        title: "Converse com o Geminify",
        description:
          "Compartilhe o clima, referências ou histórias que quer transformar em música. O Gemini responde com ideias e tags opcionais para turbinar sua playlist.",
      },
      steps: {
        toggle: "Ver etapas da resposta",
        item: "Etapa",
        status: {
          analysis: "Analisando o pedido…",
          spotify_search: "Pesquisando no Spotify…",
          finalize: "Finalizando a resposta…",
        },
      },
      initialMessage:
        "Oi! Conte o clima, contexto ou inspiração que você quer explorar e eu trago ideias, tags e exemplos de músicas.",
      form: {
        label: "Mensagem para o Geminify",
        placeholder: "ex.: Quero uma playlist aconchegante com lo-fi de jogos indie",
        send: "Enviar",
        create: "Criar playlist a partir do chat",
        reset: "Limpar chat e tags",
      },
      tags: {
        themeTitle: "Climas e narrativas",
        themeDescription: "Colete palavras-chave rápidas de clima, gênero ou referências.",
        emptyTheme: "Ainda não há tags. Comece a conversar com o Geminify!",
        songTitle: "Músicas sugeridas",
        songDescription: "Ouça as prévias e remova as faixas que não quiser usar.",
        emptySong: "Quando houver sugestões, elas aparecem aqui.",
      },
      actions: {
        toggleUploads: "Enviar opções de contexto",
        sendLikedSongs: "Enviar músicas curtidas",
        updatePlaylist: "Atualizar playlist",
      },
      liked: {
        sending: "Enviando para a Geminify…",
        sentSummary: "Enviei {total} músicas curtidas. Aqui vão alguns destaques:",
        sentSummaryNoHighlights: "Enviei {total} músicas curtidas.",
        more: "… +{count} a mais",
        already: "As músicas curtidas já foram enviadas.",
      },
      playlistModal: {
        title: "Atualizar playlist com contexto",
        description: "Escolha uma playlist existente para enviar o contexto antes de conversar ou atualizar.",
        send: "Enviar playlist",
        cancel: "Cancelar",
        close: "Fechar",
        missingSelection: "Selecione uma playlist antes de enviar.",
        sending: "Enviando contexto da playlist…",
        ready: "Contexto da playlist ativado! Peça atualizações ou novos rumos.",
        sentSummary: "Carreguei a playlist “{name}” com {total} faixas. Aqui vão alguns destaques:",
        sentSummaryNoHighlights: "Carreguei a playlist “{name}” com {total} faixas.",
        more: "… +{count} a mais",
        already: "Essa playlist já está ativa neste chat.",
      },
      songs: {
        preview: "Ouvir prévia",
        stopPreview: "Parar",
        remove: "Remover",
        removeAria: "Remover {title}",
        select: "Selecionar música",
        selectBeforeCreate: "Mantenha ao menos uma música sugerida antes de criar a playlist.",
  unknownSong: "Música desconhecida",
        playPreview: "Tocar prévia",
        pausePreview: "Pausar prévia",
        closePlayer: "Fechar mini player",
        playerNowPlaying: "Tocando agora",
  volume: "Volume",
        noPreview: "Não há prévia disponível para esta música.",
        previewUnavailableReason: {
          no_preview: "O Spotify não forneceu uma prévia para esta faixa.",
          market_restriction: "A prévia está restringida na sua região.",
          subscription_required: "Essa prévia exige o Spotify Premium ou um dispositivo compatível.",
          explicit: "A prévia foi bloqueada porque a faixa é marcada como explícita.",
          not_playable: "O Spotify informou que esta faixa não está disponível no momento.",
          auth_required: "Entre com o Spotify para liberar as prévias.",
          error: "Não conseguimos verificar a prévia agora.",
          unknown: "A prévia está indisponível por um motivo desconhecido.",
        },
        prompt: {
          baseSelected:
            "Crie uma playlist coesa no Spotify usando apenas as músicas que o usuário manteve entre as sugestões. Traga um nome criativo e uma breve descrição que reflitam o chat e essas faixas.",
          keepSelection: "Não adicione nem remova músicas. Você pode sugerir uma ordem que melhore o fluxo.",
        },
      },
    },
    footer: {
      note: "Construído com ❤️ usando Spotify Web API e Google Gemini",
    },
    loading: {
      preview: [
        "Chamando o Gemini",
        "Curando playlists temáticas",
        "Encontrando faixas correspondentes no Spotify",
        "Montando embeds das playlists",
      ],
      custom: [
        "Lendo seu prompt",
        "Curando a sequência perfeita",
        "Buscando faixas no Spotify",
        "Publicando sua playlist",
      ],
      customUpgrade: [
        "Lendo seu prompt",
        "Curando a sequência perfeita",
        "Buscando faixas no Spotify",
        "Atualizando sua playlist",
      ],
      genre: [
        "Carregando músicas curtidas",
        "Coletando gêneros dos artistas",
        "Montando playlists por estilo",
        "Pronto para ouvir",
      ],
    },
    copy: {
      song: {
        one: "música",
        other: "músicas",
      },
      playlist: {
        one: "playlist",
        other: "playlists",
      },
    },
    strings: {
      "Liked songs loaded ({total})": "Músicas curtidas carregadas ({total})",
      "Grouping your liked songs…": "Agrupando suas músicas curtidas…",
      "Collecting genres ({processed}/{total} artists)": "Coletando gêneros ({processed}/{total} artistas)",
      "Building playlists ({processed}/{total} songs)": "Montando playlists ({processed}/{total} músicas)",
      "Done! {playlists} genre playlists with {songs} songs.": "Pronto! {playlists} playlists por gênero com {songs} músicas.",
      "Done! {playlists} genre playlists.": "Pronto! {playlists} playlists por gênero.",
      "Select a Gemini model to start generating.": "Selecione um modelo Gemini para começar a gerar.",
      "Tokens in/out: {input} / {output}": "Tokens entrada/saída: {input} / {output}",
      "Input tokens: {value}": "Tokens de entrada: {value}",
      "Output tokens: {value}": "Tokens de saída: {value}",
      "Loading available Gemini models…": "Carregando modelos Gemini disponíveis…",
      "Failed to load Gemini models": "Falha ao carregar modelos do Gemini",
      "No Gemini models available for this API key": "Nenhum modelo do Gemini disponível para esta chave de API",
      "Could not load Gemini models": "Não foi possível carregar os modelos do Gemini",
      "Loading…": "Carregando…",
      "Unavailable": "Indisponível",
      "Loading playlists": "Carregando playlists",
      "Paste a link or choose a playlist (optional)": "Cole um link ou escolha uma playlist (opcional)",
      "We’ll enhance “{label}”": "Vamos aprimorar “{label}”",
      "Using a custom link/ID. Make sure the playlist is yours or collaborative.": "Usando um link/ID personalizado. Garanta que a playlist seja sua ou colaborativa.",
      "Remove tag {tag}": "Remover tag {tag}",
      "Select a playlist to enhance (optional)": "Selecione uma playlist para aprimorar (opcional)",
      "No playlists found": "Nenhuma playlist encontrada",
      "We couldn't find playlists in your account yet.": "Ainda não encontramos playlists na sua conta.",
      "Enhancing “{name}” with {count} {songsLabel} loaded.": "Aprimorando “{name}” com {count} {songsLabel} já carregadas.",
      "Select “{name}” to load songs for enhancement.": "Selecione “{name}” para carregar músicas e aprimorar.",
      "Loading songs from “{name}”…": "Carregando músicas de “{name}”…",
      "Log in with Spotify to load this playlist.": "Entre com o Spotify para carregar esta playlist.",
      "We need new Spotify permissions to view this playlist.": "Precisamos de novas permissões do Spotify para ver esta playlist.",
      "Couldn't load playlist songs.": "Não foi possível carregar as músicas da playlist.",
      "Playlist details were incomplete.": "Os detalhes da playlist estavam incompletos.",
      "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.": "Crie uma playlist coesa no Spotify que reflita esta sessão de brainstorming. Capture clima, ritmo e narrativa em 20-25 faixas.",
      "Focus tags: {tags}": "Tags em foco: {tags}",
      "Song references to echo or build around: {tags}": "Referências de músicas para ecoar ou desenvolver: {tags}",
      " ({count} {songsLabel})": " ({count} {songsLabel})",
      "Existing playlist to enhance: “{name}”{countLabel}.": "Playlist existente para aprimorar: “{name}”{countLabel}.",
      "Description: {description}": "Descrição: {description}",
      "Current track highlights:\n{highlights}": "Destaques atuais da playlist:\n{highlights}",
      "Conversation notes:\n{conversation}": "Notas da conversa:\n{conversation}",
      "Write a message before sending.": "Escreva uma mensagem antes de enviar.",
      "Hold on a moment—still loading playlist details.": "Espere um instante — ainda carregando os detalhes da playlist.",
      "Checking with Geminify…": "Consultando o Geminify…",
      "Sending…": "Enviando…",
      "Reply received!": "Resposta recebida!",
      "Conversation refreshed, no new tags this time.": "Conversa atualizada, sem novas tags desta vez.",
      "Tags updated!": "Tags atualizadas!",
      "We couldn’t chat with the Geminify right now.": "Não foi possível conversar com o Geminify agora.",
      "Chat with Gemini or capture some tags before creating a playlist.": "Converse com o Gemini ou capture algumas tags antes de criar uma playlist.",
      "We need more chat context or tags to craft a playlist.": "Precisamos de mais contexto do chat ou tags para montar uma playlist.",
      "Creating…": "Criando…",
      "Creating a playlist from your chat…": "Criando uma playlist a partir do seu chat…",
      "Playlist created from your chat! Opening the playlists view…": "Playlist criada a partir do seu chat! Abrindo a visualização de playlists…",
      "Playlist refreshed!": "Playlist atualizada!",
      "Custom playlist ready!": "Playlist personalizada pronta!",
      "Log in with Spotify to create playlists.": "Entre com o Spotify para criar playlists.",
      "Couldn't create a playlist from chat.": "Não foi possível criar uma playlist a partir do chat.",
      "Loading your playlists…": "Carregando suas playlists…",
      "Sign in to load your playlists": "Entre para carregar suas playlists",
      "We need new permissions to list your playlists. Click ‘Log in with Spotify’.": "Precisamos de novas permissões para listar suas playlists. Clique em ‘Entrar com Spotify’.",
      "Sign in with Spotify to choose an existing playlist.": "Entre com o Spotify para escolher uma playlist existente.",
      "Sign in with Spotify to enhance an existing playlist.": "Entre com o Spotify para aprimorar uma playlist existente.",
      "Select a playlist (optional)": "Selecione uma playlist (opcional)",
      "Playlists refreshed! Pick one to enhance.": "Playlists atualizadas! Escolha uma para aprimorar.",
      "Pick a playlist to enhance or paste a link below.": "Escolha uma playlist para aprimorar ou cole um link abaixo.",
      "Load again": "Carregar novamente",
      "Playlist preview for {name}": "Prévia da playlist {name}",
      "Open in Spotify": "Abrir no Spotify",
      "No liked songs to group just yet.": "Ainda não há músicas curtidas para agrupar.",
      "Genre playlist": "Playlist por gênero",
      "Collection built from your liked songs.": "Coleção criada a partir das suas músicas curtidas.",
      "View songs ({count})": "Ver músicas ({count})",
      "Track {index}": "Faixa {index}",
      "Unknown artist": "Artista desconhecido",
      "… and {count} more songs": "… e mais {count} músicas",
      "Generating…": "Gerando…",
      "Spotify login required": "É necessário entrar com o Spotify",
      "Failed to generate playlists": "Falha ao gerar playlists",
      "Generation failed": "Geração falhou",
      "Please describe the playlist vibe first.": "Descreva primeiro o clima da playlist.",
      "Spinning up your mix…": "Preparando seu mix…",
      "Playlist updated with fresh tracks on Spotify!": "Playlist atualizada com faixas novas no Spotify!",
      "Custom playlist created and added to Spotify!": "Playlist personalizada criada e adicionada ao Spotify!",
      "Please log in with Spotify to continue.": "Entre com o Spotify para continuar.",
      "Organizing…": "Organizando…",
      "Grouping your liked songs…": "Agrupando suas músicas curtidas…",
      "Couldn't group songs by genre.": "Não foi possível agrupar as músicas por gênero.",
      "Sign in with Spotify to continue.": "Entre com o Spotify para continuar.",
  "Failed to create playlist": "Falha ao criar playlist",
  "The server didn't return a playlist.": "O servidor não retornou uma playlist.",
    },
  },
};

let currentLocale = DEFAULT_LOCALE;

const PATH_KEY_REGEX = /^[A-Za-z0-9_.-]+$/;

function isKeyPath(key) {
  return typeof key === "string" && PATH_KEY_REGEX.test(key) && !key.includes(" ");
}

function resolveTranslationPath(localeData, key) {
  if (!localeData) return undefined;
  return key.split(".").reduce((accumulator, segment) => {
    if (accumulator && Object.prototype.hasOwnProperty.call(accumulator, segment)) {
      return accumulator[segment];
    }
    return undefined;
  }, localeData);
}

function applyReplacements(value, replacements = {}) {
  if (!value || typeof value !== "string") {
    return value;
  }
  return value.replace(/\{(.*?)\}/g, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(replacements, token)) {
      const replacement = replacements[token];
      return replacement === undefined || replacement === null ? "" : String(replacement);
    }
    return match;
  });
}

function t(key, replacements = {}, { fallback } = {}) {
  const activeData = TRANSLATIONS[currentLocale] || TRANSLATIONS[DEFAULT_LOCALE];
  const defaultData = TRANSLATIONS[DEFAULT_LOCALE];

  let value;

  if (isKeyPath(key)) {
    value = resolveTranslationPath(activeData, key);
    if (value === undefined) {
      value = resolveTranslationPath(defaultData, key);
    }
  }

  if (value === undefined) {
    const activeStrings = activeData?.strings || {};
    const defaultStrings = defaultData?.strings || {};
    if (Object.prototype.hasOwnProperty.call(activeStrings, key)) {
      value = activeStrings[key];
    } else if (Object.prototype.hasOwnProperty.call(defaultStrings, key)) {
      value = defaultStrings[key];
    }
  }

  if (value === undefined) {
    value = fallback !== undefined ? fallback : key;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === "string" ? applyReplacements(entry, replacements) : entry
    );
  }

  if (typeof value === "string") {
    return applyReplacements(value, replacements);
  }

  return value;
}

function tList(key, replacements = {}, options = {}) {
  const value = t(key, replacements, options);
  return Array.isArray(value) ? value : [];
}

function getCopyLabel(noun, count) {
  const path = `copy.${noun}.${count === 1 ? "one" : "other"}`;
  const fallback = count === 1 ? noun : `${noun}s`;
  return t(path, {}, { fallback });
}

function applyStaticTranslations() {
  document.title = t("meta.title", {}, { fallback: document.title });

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    if (!key) return;
    const fallback = element.textContent?.trim() ?? "";
    const localized = t(key, {}, { fallback });
    if (typeof localized === "string") {
      element.textContent = localized;
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    if (!key) return;
    const fallback = element.getAttribute("placeholder") || "";
    const localized = t(key, {}, { fallback });
    if (typeof localized === "string") {
      element.setAttribute("placeholder", localized);
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    if (!key) return;
    const fallback = element.getAttribute("title") || "";
    const localized = t(key, {}, { fallback });
    if (typeof localized === "string") {
      element.setAttribute("title", localized);
    }
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.getAttribute("data-i18n-aria-label");
    if (!key) return;
    const fallback = element.getAttribute("aria-label") || "";
    const localized = t(key, {}, { fallback });
    if (typeof localized === "string") {
      element.setAttribute("aria-label", localized);
    }
  });
}

function updateLanguageButtons() {
  languageButtons.forEach((button) => {
    const buttonLocale = button.dataset.lang;
    const isActive = buttonLocale === currentLocale;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function refreshLocaleDependentCopy() {
  if (htmlElement) {
    htmlElement.setAttribute("lang", currentLocale);
  }
  updateLanguageButtons();
  if (mixState.pending) {
    renderMixPendingState();
  } else if (mixState.lastPayload) {
    renderMixHighlights(mixState.lastPayload);
  } else {
    resetMixResultsToEmpty();
  }
  refreshMixStatusLocale();

  if (songSuggestionPreviewState.miniPlayer) {
    const miniPlayer = songSuggestionPreviewState.miniPlayer;
    const nowPlayingLabel = t("chat.songs.playerNowPlaying", {}, { fallback: "Now playing" });
    miniPlayer.label.textContent = nowPlayingLabel;
    miniPlayer.closeButton.setAttribute(
      "aria-label",
      t("chat.songs.closePlayer", {}, { fallback: "Close mini player" })
    );
    const titleText = songSuggestionPreviewState.suggestion?.title;
    miniPlayer.container.setAttribute(
      "aria-label",
      titleText ? `${nowPlayingLabel}: ${titleText}` : nowPlayingLabel
    );
    updateMiniPlayerState();
  }
}

function setLocale(locale, { persist = true } = {}) {
  const normalized = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  currentLocale = normalized;

  if (persist) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale);
    } catch (error) {
      console.warn("Failed to persist locale", error);
    }
  }

  applyStaticTranslations();
  refreshLocaleDependentCopy();
}

function determineInitialLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("Failed to read stored locale", error);
  }

  const navigatorLocales = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language].filter(Boolean);

  const matched = navigatorLocales
    .map((value) => (value || "").toLowerCase())
    .find((value) => SUPPORTED_LOCALES.some((locale) => value.startsWith(locale.toLowerCase())));

  if (matched) {
    const exact = SUPPORTED_LOCALES.find((locale) => matched.startsWith(locale.toLowerCase()));
    if (exact) {
      return exact;
    }
  }

  return DEFAULT_LOCALE;
}

function initializeLocale() {
  const initialLocale = determineInitialLocale();
  setLocale(initialLocale, { persist: false });
}

function handleLocaleButtonClick(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  const locale = target.dataset.lang;
  if (!locale || locale === currentLocale) return;
  setLocale(locale);
}

function registerLocaleSwitcher() {
  languageButtons.forEach((button) => {
    button.addEventListener("click", handleLocaleButtonClick);
  });
}

registerLocaleSwitcher();
initializeLocale();
registerSongSuggestionDebugTools();

const MODEL_STORAGE_KEY = "claudify:selectedGeminiModel";
let availableModels = [];
let statusTimeouts = [];
let tickerRevealInterval = null;
let currentTickerSongs = [];
let statusSource = null;
let statusReconnectTimer = null;
let modelsLoaded = false;
let playlistsLoaded = false;
let modelsLoading = false;
let playlistsLoading = false;
let cachedUserPlaylists = [];
let chatPlaylistLoading = false;
let chatBlocked = false;
let chatPlaylistModalLastFocus = null;

function blockChat() {
  chatBlocked = true;
  if (chatInput) chatInput.disabled = true;
  if (chatSendButton) chatSendButton.disabled = true;
  if (chatCreatePlaylistButton) chatCreatePlaylistButton.disabled = true;
  if (chatRefreshPlaylistsButton) chatRefreshPlaylistsButton.disabled = true;
  chatUploadToggle?.setAttribute("disabled", "true");
}

function unblockChat() {
  chatBlocked = false;
  if (chatInput) chatInput.disabled = false;
  if (chatSendButton) chatSendButton.disabled = false;
  if (chatCreatePlaylistButton) chatCreatePlaylistButton.disabled = false;
  if (chatRefreshPlaylistsButton) chatRefreshPlaylistsButton.disabled = false;
  if (chatUploadToggle) chatUploadToggle.removeAttribute("disabled");
}

function getInitialAssistantMessage() {
  return t("chat.initialMessage");
}

const MAX_CHAT_HISTORY = 12;

let initialAssistantMessage = getInitialAssistantMessage();

const chatState = {
  messages: [{ role: "assistant", content: initialAssistantMessage }],
  themeTags: [],
  songSuggestions: [],
  chatSteps: [],
  playlistContext: null,
  didSendPlaylistContext: false,
  likedSongs: [],
  playlistSummaryPostedId: null,
  initialAssistantMessage,
};

function updateLikedSongsButtonState() {
  if (!sendLikedSongsButton) return;
  const hasLikedSongs = chatState.likedSongs.length > 0;
  sendLikedSongsButton.disabled = hasLikedSongs;
  sendLikedSongsButton.setAttribute("aria-disabled", String(hasLikedSongs));
}

function isChatPlaylistModalOpen() {
  return Boolean(chatPlaylistModal && chatPlaylistModal.hidden === false);
}

function openChatPlaylistModal() {
  if (!chatPlaylistModal) return;
  if (isChatPlaylistModalOpen()) return;

  chatUploadToggle?.setAttribute("aria-expanded", "false");
  if (chatUploadDropdown) {
    chatUploadDropdown.hidden = true;
  }

  chatPlaylistModalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  chatPlaylistModal.hidden = false;
  chatPlaylistModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  const dialog = chatPlaylistModal.querySelector(".modal__dialog");
  if (dialog instanceof HTMLElement) {
    if (!dialog.hasAttribute("tabindex")) {
      dialog.setAttribute("tabindex", "-1");
    }
    dialog.focus({ preventScroll: true });
  }

  if (!playlistsLoaded && !playlistsLoading) {
    loadUserPlaylists({ trigger: "modal", source: "chat" }).catch((error) => {
      console.error("Failed to load playlists for modal", error);
    });
  } else {
    updateChatPlaylistHint();
  }
}

function closeChatPlaylistModal(options = {}) {
  const { restoreFocus = true } = options;
  if (!chatPlaylistModal || chatPlaylistModal.hidden) return;

  chatPlaylistModal.hidden = true;
  chatPlaylistModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  if (restoreFocus && chatPlaylistModalLastFocus && typeof chatPlaylistModalLastFocus.focus === "function") {
    chatPlaylistModalLastFocus.focus();
  }

  chatPlaylistModalLastFocus = null;
}

const tickerState = {
  mode: "idle",
  requestId: null,
  operation: null,
  lastPlaylist: null,
};
const MAX_TICKER_SONGS = 60;
const placeholderSongs = [
  "Neon Skyline — Midnight Arcade",
  "Ocean Bloom — Luminous Drift",
  "Starlight Pulse — Aiko Wave",
  "Chromatic Echoes — Nova Bloom",
  "Infrared Motel — Soft Static",
  "Velvet Horizon — Nightline",
  "Synthetic Dreams — Prisma",
  "Electric Mirage — Lunar Tide",
  "Photon Avenue — Glasshouse",
  "Cascade Memoirs — Aurora City",
];

const CHAT_STEP_ICONS = {
  "user_input": "📝",
  "analysis": "🧠",
  "spotify_search": "🔎",
  "finalize": "✨",
};

const STEP_STATUS_FALLBACK = {
  analysis: "Analyzing the request…",
  spotify_search: "Searching Spotify…",
  finalize: "Finalizing the response…",
};

const CHAT_STEP_SEQUENCE = ["analysis", "spotify_search", "finalize"];
let chatStepStatusTimers = [];

function getLoadingSequence(type) {
  return tList(`loading.${type}`);
}

function clearStatusTimeouts() {
  statusTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  statusTimeouts = [];
}

function stopTickerReveal() {
  if (tickerRevealInterval) {
    clearInterval(tickerRevealInterval);
    tickerRevealInterval = null;
  }
}

function setLiveStatusLabel(text) {
  if (liveStatusLabel) {
    liveStatusLabel.textContent = text;
  }
}

function renderStatusSteps(sequence) {
  if (!statusSteps) return;
  statusSteps.innerHTML = "";
  sequence.forEach((label) => {
    const li = document.createElement("li");
    li.textContent = label;
    statusSteps.append(li);
  });
}

function updateStatusStep(index) {
  if (!statusSteps) return;
  const items = Array.from(statusSteps.querySelectorAll("li"));
  items.forEach((item, idx) => {
    item.classList.toggle("is-active", idx === index);
    item.classList.toggle("is-complete", idx < index);
  });
  const current = items[index];
  if (current) {
    setLiveStatusLabel(current.textContent ?? "");
  }
}

function setTickerSongs(
  songs,
  { animate = true, allowPlaceholder = true } = {}
) {
  if (!tickerInner) return;

  const wasAnimating = tickerInner.classList.contains("ticker__inner--animate");
  tickerInner.classList.remove("ticker__inner--animate");
  tickerInner.innerHTML = "";

  const source = songs && songs.length ? songs : allowPlaceholder ? placeholderSongs : [];
  if (!source.length) {
    const span = document.createElement("span");
    span.className = "ticker__item";
    span.textContent = t("live.waiting");
    tickerInner.append(span);
  } else {
    const display = [];
    const targetLength = Math.max(8, source.length * 2);
    let index = 0;
    while (display.length < targetLength) {
      display.push(source[index % source.length]);
      index += 1;
    }

    display.forEach((title) => {
      const span = document.createElement("span");
      span.className = "ticker__item";
      span.textContent = title;
      tickerInner.append(span);
    });
  }

  const shouldAnimate =
    tickerInner.childElementCount && (animate || (wasAnimating && !animate));

  if (shouldAnimate) {
    if (animate) {
      void tickerInner.offsetWidth; // restart animation intentionally
    }
    tickerInner.classList.add("ticker__inner--animate");
  }
}

function startPlaceholderTicker() {
  currentTickerSongs = [];
  setTickerSongs(placeholderSongs);
}

function clearTickerMode() {
  tickerState.mode = "idle";
  tickerState.requestId = null;
  tickerState.operation = null;
  tickerState.lastPlaylist = null;
}

function switchTickerMode(
  mode,
  { requestId = null, operation = null, label, allowPlaceholder = false } = {}
) {
  tickerState.mode = mode;
  tickerState.requestId = requestId;
  tickerState.operation = operation;
  tickerState.lastPlaylist = null;
  currentTickerSongs = [];
  setTickerSongs([], { animate: false, allowPlaceholder });
  if (label) {
    setLiveStatusLabel(label);
  }
}

function isCurrentRequest(expectedMode, requestId) {
  if (expectedMode && tickerState.mode !== expectedMode) {
    return false;
  }
  if (requestId && tickerState.requestId && tickerState.requestId !== requestId) {
    return false;
  }
  return true;
}

function parseEventData(event) {
  if (!event || typeof event.data !== "string" || !event.data.length) {
    return {};
  }
  try {
    return JSON.parse(event.data);
  } catch (error) {
    console.warn("Failed to parse status event", error);
    return {};
  }
}

function addTickerSong(line, { animate = false } = {}) {
  if (!line) return;
  if (currentTickerSongs.includes(line)) return;
  currentTickerSongs.push(line);
  if (currentTickerSongs.length > MAX_TICKER_SONGS) {
    currentTickerSongs = currentTickerSongs.slice(-MAX_TICKER_SONGS);
  }
  setTickerSongs(currentTickerSongs, { animate, allowPlaceholder: false });
}

function animateSongReveal(songs) {
  stopTickerReveal();
  currentTickerSongs = [];
  const queue = songs.filter(Boolean);
  if (!queue.length) {
    setTickerSongs(placeholderSongs);
    return;
  }

  let index = 0;
  tickerRevealInterval = setInterval(() => {
    currentTickerSongs.push(queue[index]);
    setTickerSongs(currentTickerSongs);
    index += 1;
    if (index >= queue.length) {
      stopTickerReveal();
      setTimeout(() => setTickerSongs(currentTickerSongs), 600);
    }
  }, 500);
}

function resetLiveStatus() {
  clearStatusTimeouts();
  stopTickerReveal();
  if (liveStatus) {
    liveStatus.hidden = true;
    liveStatus.classList.remove("is-error");
  }
  setLiveStatusLabel(t("live.tuning"));
  if (statusSteps) {
    statusSteps.innerHTML = "";
  }
  currentTickerSongs = [];
  clearTickerMode();
  if (tickerInner) {
    tickerInner.innerHTML = "";
    tickerInner.classList.remove("ticker__inner--animate");
  }
}

function startLiveStatus(type) {
  if (!liveStatus) return;
  liveStatus.hidden = false;
  liveStatus.classList.remove("is-error");
  tickerState.operation = type;
  const sequence = getLoadingSequence(type);
  renderStatusSteps(sequence);
  clearStatusTimeouts();
  stopTickerReveal();
  startPlaceholderTicker();
  if (!sequence.length) {
    setLiveStatusLabel(t("live.creating"));
    return;
  }

  updateStatusStep(0);
  statusTimeouts = sequence.slice(1).map((_, idx) =>
    setTimeout(() => {
      updateStatusStep(idx + 1);
    }, (idx + 1) * 2200)
  );
}

function completeLiveStatus(songTitles, options = {}) {
  if (!liveStatus) return;
  const { requestId, label } = options;
  if (requestId && tickerState.requestId && tickerState.requestId !== requestId) {
    return;
  }
  clearStatusTimeouts();
  const items = statusSteps
    ? Array.from(statusSteps.querySelectorAll("li"))
    : [];
  items.forEach((item) => {
    item.classList.remove("is-active");
    item.classList.add("is-complete");
  });
  const displayLabel = label
    ? t(label, {}, { fallback: label })
    : t("live.ready");
  setLiveStatusLabel(displayLabel);

  const incomingSongs = Array.isArray(songTitles)
    ? songTitles.filter(Boolean)
    : [];

  if (!incomingSongs.length && currentTickerSongs.length) {
    setTickerSongs(currentTickerSongs, { animate: true, allowPlaceholder: false });
  } else if (incomingSongs.length) {
    if (currentTickerSongs.length === 0) {
      animateSongReveal(incomingSongs);
    } else {
      incomingSongs.forEach((song) => addTickerSong(song, { animate: false }));
      setTickerSongs(currentTickerSongs, {
        animate: true,
        allowPlaceholder: false,
      });
    }
  } else {
    setTickerSongs([], { animate: false, allowPlaceholder: false });
  }

  setTimeout(() => {
    if (liveStatus) {
      liveStatus.hidden = true;
    }
    clearTickerMode();
  }, 4500);
}

function failLiveStatus(message, options = {}) {
  if (!liveStatus) return;
  const { requestId } = options;
  if (requestId && tickerState.requestId && tickerState.requestId !== requestId) {
    return;
  }
  clearStatusTimeouts();
  stopTickerReveal();
  liveStatus.classList.add("is-error");
  const displayMessage = message
    ? t(message, {}, { fallback: message })
    : t("live.error");
  setLiveStatusLabel(displayMessage);
  setTickerSongs([], { animate: false, allowPlaceholder: true });
  setTimeout(() => {
    if (liveStatus) {
      liveStatus.hidden = true;
      liveStatus.classList.remove("is-error");
    }
    clearTickerMode();
  }, 5000);
}

function handleLikedStart(event) {
  const data = parseEventData(event);
  const label = data.label
    ? t(data.label, {}, { fallback: data.label })
    : t("live.liked.loading");
  switchTickerMode("liked", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label,
  });
}

function handleLikedSong(event) {
  const data = parseEventData(event);
  const requestId = data.requestId || null;
  if (!isCurrentRequest("liked", requestId)) {
    if (!tickerState.requestId) {
      const label = data.label
        ? t(data.label, {}, { fallback: data.label })
        : t("live.liked.loading");
      switchTickerMode("liked", {
        requestId,
        operation: data.operation || tickerState.operation,
        label,
      });
    } else {
      return;
    }
  }

  const line =
    data.name && data.artist
      ? `${data.name} — ${data.artist}`
      : data.title && data.artist
      ? `${data.title} — ${data.artist}`
      : undefined;
  addTickerSong(line, { animate: false });
}

function handleLikedComplete(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("liked", data.requestId || null)) {
    return;
  }

  const total =
    typeof data.total === "number" && Number.isFinite(data.total)
      ? data.total
      : undefined;

  const message =
    typeof total === "number"
      ? t("Liked songs loaded ({total})", { total }, { fallback: `Liked songs loaded (${total})` })
      : t("live.liked.loaded");
  setLiveStatusLabel(message);

  if (currentTickerSongs.length) {
    setTickerSongs(currentTickerSongs, { animate: true, allowPlaceholder: false });
  } else {
    setTickerSongs([], { animate: false, allowPlaceholder: true });
  }
}

function onLikedCompleteClear(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("liked", data.requestId || null)) return;

  const pending = chatLog?.querySelector('.chat-message--user.chat-message--pending');
  if (pending) {
    pending.classList.remove('chat-message--pending');
    const body = pending.querySelector('.chat-message__body');
    if (body) {
      const note = document.createElement('div');
      note.style.marginTop = '8px';
      note.style.fontSize = '0.85rem';
      note.style.color = 'var(--text-muted)';
      const total = typeof data.total === 'number' ? data.total : '';
      note.textContent = t('Liked songs loaded ({total})', { total }, { fallback: 'Liked songs sent' });
      body.append(document.createElement('br'));
      body.append(note);
    }
  }
}

function handleGenreStart(event) {
  const data = parseEventData(event);
  const label = data.label
    ? t(data.label, {}, { fallback: data.label })
    : t("live.genre.organizing");
  switchTickerMode("genre", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label,
    allowPlaceholder: true,
  });

  if (genreStatus) {
    showStatus(genreStatus, t("Grouping your liked songs…"), "");
  }
}

function handleGenreProgress(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("genre", data.requestId || null)) {
    return;
  }

  const stage = data.stage;
  const processed = typeof data.processed === "number" ? data.processed : undefined;
  const total = typeof data.total === "number" ? data.total : undefined;

  if (stage === "artists" && processed !== undefined && total !== undefined) {
    setLiveStatusLabel(
      t("Collecting genres ({processed}/{total} artists)", {
        processed,
        total,
      })
    );
  } else if (stage === "grouping" && processed !== undefined && total !== undefined) {
    setLiveStatusLabel(
      t("Building playlists ({processed}/{total} songs)", {
        processed,
        total,
      })
    );
  }

  if (Array.isArray(data.songs)) {
    data.songs
      .filter(Boolean)
      .forEach((line) => addTickerSong(line, { animate: false }));
  } else if (data.sampleSong) {
    addTickerSong(data.sampleSong, { animate: false });
  }
}

function handleGenreComplete(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("genre", data.requestId || null)) {
    return;
  }

  const songs = Array.isArray(data.songs) ? data.songs : undefined;
  const label = data.label
    ? t(data.label, {}, { fallback: data.label })
    : t("live.genre.ready");
  completeLiveStatus(songs, {
    requestId: data.requestId || null,
    label,
  });

  if (genreStatus && typeof data.totalPlaylists === "number") {
    const totalSongs = typeof data.totalSongs === "number" ? data.totalSongs : undefined;
    const summaryText = totalSongs
      ? t("Done! {playlists} genre playlists with {songs} songs.", {
          playlists: data.totalPlaylists,
          songs: totalSongs,
        })
      : t("Done! {playlists} genre playlists.", {
          playlists: data.totalPlaylists,
        });
    showStatus(genreStatus, summaryText, "success");
  }
}

function handleGeminiStart(event) {
  const data = parseEventData(event);
  const label = data.label
    ? t(data.label, {}, { fallback: data.label })
    : t("live.gemini.suggesting");
  switchTickerMode("gemini", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label,
  });
}

function handleGeminiSong(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("gemini", data.requestId || null)) {
    return;
  }

  const line =
    data.title && data.artist
      ? `${data.title} — ${data.artist}`
      : data.name && data.artist
      ? `${data.name} — ${data.artist}`
      : undefined;
  addTickerSong(line, { animate: false });

  if (data.playlist && tickerState.lastPlaylist !== data.playlist) {
    tickerState.lastPlaylist = data.playlist;
    setLiveStatusLabel(t("live.gemini.curating", { name: data.playlist }));
  }
}

function handleGeminiComplete(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("gemini", data.requestId || null)) {
    return;
  }
  const songs = Array.isArray(data.songs) ? data.songs : undefined;
  const label = data.label
    ? t(data.label, {}, { fallback: data.label })
    : undefined;
  completeLiveStatus(songs, {
    requestId: data.requestId || null,
    label,
  });
}

function handleStatusMessage(event) {
  const data = parseEventData(event);
  if (
    data.requestId &&
    tickerState.requestId &&
    tickerState.requestId !== data.requestId
  ) {
    return;
  }
  if (typeof data.message === "string" && data.message.length) {
    setLiveStatusLabel(t(data.message, {}, { fallback: data.message }));
  }
}

function handleStatusError(event) {
  const data = parseEventData(event);
  if (!data || !data.message) {
    return;
  }
  failLiveStatus(data.message, { requestId: data.requestId || null });
}

function initStatusStream() {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return;
  }

  if (statusSource) {
    statusSource.close();
    statusSource = null;
  }

  statusSource = new EventSource("/status-stream");

  statusSource.addEventListener("open", () => {
    if (statusReconnectTimer) {
      clearTimeout(statusReconnectTimer);
      statusReconnectTimer = null;
    }
  });

  statusSource.addEventListener("error", () => {
    if (statusSource) {
      statusSource.close();
      statusSource = null;
    }
    if (!statusReconnectTimer) {
      statusReconnectTimer = setTimeout(() => {
        statusReconnectTimer = null;
        initStatusStream();
      }, 4000);
    }
  });

  statusSource.addEventListener("liked-start", handleLikedStart);
  statusSource.addEventListener("liked-song", handleLikedSong);
  statusSource.addEventListener("liked-complete", handleLikedComplete);
  statusSource.addEventListener("liked-complete", onLikedCompleteClear);
  statusSource.addEventListener("genre-start", handleGenreStart);
  statusSource.addEventListener("genre-progress", handleGenreProgress);
  statusSource.addEventListener("genre-complete", handleGenreComplete);
  statusSource.addEventListener("gemini-start", handleGeminiStart);
  statusSource.addEventListener("gemini-song", handleGeminiSong);
  statusSource.addEventListener("gemini-complete", handleGeminiComplete);
  statusSource.addEventListener("status-message", handleStatusMessage);
  statusSource.addEventListener("status-error", handleStatusError);
}

const formatTokenLimit = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : undefined;

const findModel = (modelName) =>
  availableModels.find((model) => model.name === modelName) || null;

const getSelectedModel = () => {
  if (!modelSelect || modelSelect.disabled) return undefined;
  const selected = modelSelect.value;
  return selected && selected !== "" ? selected : undefined;
};

function updateModelStatus(model) {
  if (!modelStatus) return;
  if (!model) {
    showStatus(
      modelStatus,
      t("Select a Gemini model to start generating.", {}, {
        fallback: "Select a Gemini model to start generating.",
      }),
      "error"
    );
    return;
  }

  const inputLimit = formatTokenLimit(model.inputTokenLimit);
  const outputLimit = formatTokenLimit(model.outputTokenLimit);
  const limitText =
    inputLimit && outputLimit
      ? t("Tokens in/out: {input} / {output}", { input: inputLimit, output: outputLimit })
      : inputLimit
      ? t("Input tokens: {value}", { value: inputLimit })
      : outputLimit
      ? t("Output tokens: {value}", { value: outputLimit })
      : "";

  const detail = [model.displayName || model.name, limitText, model.description]
    .filter(Boolean)
    .join(" · ");

  showStatus(modelStatus, detail, "");
}

async function loadGeminiModels() {
  if (!modelSelect || !modelStatus) return;
  if (modelsLoading) return;

  modelsLoading = true;
  modelsLoaded = false;

  availableModels = [];
  modelSelect.disabled = true;
  showStatus(
    modelStatus,
    t("Loading available Gemini models…", {}, { fallback: "Loading available Gemini models…" }),
    ""
  );
  modelSelect.innerHTML = "";
  const loadingOption = document.createElement("option");
  loadingOption.value = "";
  loadingOption.textContent = t("Loading…", {}, { fallback: "Loading…" });
  modelSelect.append(loadingOption);

  try {
    const response = await fetch("/gemini-models");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to load Gemini models");
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    if (!models.length) {
      throw new Error("No Gemini models available for this API key");
    }

    availableModels = models;
    modelSelect.innerHTML = "";
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.name;
      option.textContent = model.displayName || model.name;
      modelSelect.append(option);
    });

    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    const defaultName = typeof data.defaultModel === "string" ? data.defaultModel : undefined;
    const fallbackModel =
      findModel(stored) || findModel(defaultName) || models[0];

    if (fallbackModel) {
      modelSelect.value = fallbackModel.name;
      localStorage.setItem(MODEL_STORAGE_KEY, fallbackModel.name);
      updateModelStatus(fallbackModel);
    }

    modelSelect.disabled = false;
    modelsLoaded = true;
  } catch (error) {
    modelSelect.innerHTML = "";
    const unavailableOption = document.createElement("option");
    unavailableOption.value = "";
    unavailableOption.textContent = t("Unavailable", {}, { fallback: "Unavailable" });
    modelSelect.append(unavailableOption);
    modelSelect.disabled = true;
    const message = error?.message
      ? t(error.message, {}, { fallback: error.message })
      : t("Could not load Gemini models");
    showStatus(modelStatus, message, "error");
  } finally {
    modelsLoading = false;
  }
}

const createLoader = (label) => {
  const loader = document.createElement("div");
  loader.className = "loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  const resolvedLabel = label
    ? t(label, {}, { fallback: label })
    : t("Loading playlists", {}, { fallback: "Loading playlists" });
  loader.innerHTML = `
    <span class="loader__orb"></span>
    <span class="loader__text">${resolvedLabel}</span>
  `;
  return loader;
};

function showStatus(element, message, type) {
  if (!element) return;

  const content = typeof message === "string" ? message.trim() : message ? String(message) : "";
  const hasContent = Boolean(content);

  element.classList.remove("status--error", "status--success");

  if (!hasContent) {
    element.textContent = "";
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    return;
  }

  element.hidden = false;
  element.removeAttribute("aria-hidden");
  element.textContent = content;

  if (type) {
    element.classList.add(type === "error" ? "status--error" : "status--success");
  }
}

function setMixStatusKey(key, replacements = {}, type = "", fallback) {
  if (!mixStatus) return;
  const message = t(key, replacements, { fallback: fallback ?? key });
  showStatus(mixStatus, message, type);
  mixState.statusKey = key;
  mixState.statusReplacements = replacements;
  mixState.statusFallback = fallback ?? key ?? message;
  mixState.statusType = type || "";
}

function setMixStatusMessage(message, type = "") {
  if (!mixStatus) return;
  const content = typeof message === "string" ? message : message ? String(message) : "";
  showStatus(mixStatus, content, type);
  mixState.statusKey = null;
  mixState.statusReplacements = {};
  mixState.statusFallback = content;
  mixState.statusType = type || "";
}

function refreshMixStatusLocale() {
  if (!mixStatus) return;
  if (mixState.statusKey) {
    const message = t(mixState.statusKey, mixState.statusReplacements, {
      fallback: mixState.statusFallback || mixState.statusKey,
    });
    showStatus(mixStatus, message, mixState.statusType);
  } else if (mixState.statusFallback) {
    showStatus(mixStatus, mixState.statusFallback, mixState.statusType);
  } else {
    showStatus(mixStatus, "", "");
  }
}

function renderMixPendingState() {
  if (!mixResults) return;
  mixState.pending = true;
  mixState.lastPayload = null;
  mixResults.innerHTML = "";
  mixResults.removeAttribute("data-empty");
  const loader = createLoader("mix.status.mixing");
  mixResults.append(loader);
}

function setPlaylistSelectStatus(message, type) {
  if (!playlistSelectStatus) return;
  playlistSelectStatus.textContent = message || "";
  playlistSelectStatus.classList.remove("status--error", "status--success");
  if (type) {
    playlistSelectStatus.classList.add(type === "error" ? "status--error" : "status--success");
  }
}

const findPlaylistOption = (value) => {
  if (!playlistSelect || !value) return null;
  return (
    Array.from(playlistSelect.options).find((option) => option.value === value) || null
  );
};

function updatePlaylistStatusForValue(value) {
  const trimmed = value ? value.trim() : "";
  if (!trimmed) {
    setPlaylistSelectStatus(
      t("Paste a link or choose a playlist (optional)", {}, {
        fallback: "Paste a link or choose a playlist (optional)",
      }),
      ""
    );
    return;
  }

  const option = findPlaylistOption(trimmed);
  if (option) {
    const label = option.dataset?.name || option.textContent || "your playlist";
    setPlaylistSelectStatus(
      t("We’ll enhance “{label}”", { label }, { fallback: `We’ll enhance “${label}”` }),
      "success"
    );
  } else {
    setPlaylistSelectStatus(
      t(
        "Using a custom link/ID. Make sure the playlist is yours or collaborative.",
        {},
        {
          fallback:
            "Using a custom link/ID. Make sure the playlist is yours or collaborative.",
        }
      ),
      ""
    );
  }
}

function setChatStatus(message, type = "") {
  if (!chatStatus) return;
  showStatus(chatStatus, message, type);
}

function setChatPlaylistHint(message, type = "") {
  if (!chatPlaylistHint) return;
  showStatus(chatPlaylistHint, message, type);
}

function setChatCreationStatus(message, type = "") {
  if (!chatCreationStatus) return;
  showStatus(chatCreationStatus, message, type);
}

function switchView(target) {
  const targets = {
    playlists: playlistView,
    chat: chatView,
  };

  Object.entries(targets).forEach(([key, element]) => {
    if (!element) return;
    const isActive = key === target;
    element.classList.toggle("view--active", isActive);
    element.hidden = !isActive;
  });

  viewButtons.forEach((button) => {
    const isActive = button.dataset.viewTarget === target;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function appendChatMessage(role, content, options = {}) {
  if (!chatLog) return;
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) return;

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message chat-message--${role}`;

  const avatar = document.createElement("div");
  avatar.className = "chat-message__avatar";
  avatar.textContent = role === "assistant" ? "✨" : "🎧";

  const bubble = document.createElement("div");
  bubble.className = "chat-message__bubble";

  const sender = document.createElement("span");
  sender.className = "chat-message__sender";
  sender.textContent = t(
    role === "assistant" ? "chat.sender.assistant" : "chat.sender.user",
    {},
    { fallback: role === "assistant" ? "Geminify" : "You" }
  );

  const body = document.createElement("p");
  body.className = "chat-message__body";

  trimmed.split(/\n+/).forEach((line, index, lines) => {
    body.append(document.createTextNode(line));
    if (index < lines.length - 1) {
      body.append(document.createElement("br"));
    }
  });

  bubble.append(sender, body);
  const steps = role === "assistant" && Array.isArray(options.steps) ? options.steps : [];
  const stepsToggle = role === "assistant" ? createChatStepsToggle(steps) : null;

  const messageContent = document.createElement("div");
  messageContent.className = "chat-message__content";

  if (stepsToggle) {
    messageContent.append(stepsToggle);
  }

  messageContent.append(bubble);

  wrapper.append(avatar, messageContent);
  chatLog.append(wrapper);
  chatLog.scrollTo({
    top: chatLog.scrollHeight,
    behavior: "smooth",
  });
}

function mergeTags(current, incoming) {
  const map = new Map();
  current.forEach((tag) => {
    if (typeof tag !== "string") return;
    const trimmed = tag.trim();
    if (!trimmed) return;
    map.set(trimmed.toLowerCase(), trimmed);
  });

  incoming.forEach((tag) => {
    if (typeof tag !== "string") return;
    const trimmed = tag.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!map.has(key)) {
      map.set(key, trimmed);
    }
  });

  return Array.from(map.values());
}

function renderTagGroup(container, tags, group, emptyMessageKey) {
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(tags) || tags.length === 0) {
    container.dataset.empty = "true";
    const empty = document.createElement("p");
    empty.className = "tag-empty";
    empty.textContent = t(emptyMessageKey, {}, { fallback: emptyMessageKey });
    container.append(empty);
    return;
  }

  container.removeAttribute("data-empty");

  tags.forEach((tag) => {
    const trimmed = typeof tag === "string" ? tag.trim() : "";
    if (!trimmed) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-pill";
    button.dataset.group = group;
    button.dataset.tag = trimmed;
    button.setAttribute(
      "aria-label",
      t("Remove tag {tag}", { tag: trimmed }, { fallback: `Remove tag ${trimmed}` })
    );

    const label = document.createElement("span");
    label.className = "tag-pill__label";
    label.textContent = trimmed;

    const close = document.createElement("span");
    close.className = "tag-pill__remove";
    close.setAttribute("aria-hidden", "true");
    close.textContent = "×";

    button.append(label, close);
    container.append(button);
  });
}

function createChatStepsToggle(steps) {
  const validSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (!validSteps.length) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "chat-steps-inline";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-steps-toggle";
  button.setAttribute("aria-expanded", "false");

  const icon = document.createElement("span");
  icon.className = "chat-steps-toggle__icon";
  icon.textContent = "^";

  const label = document.createElement("span");
  label.className = "chat-steps-toggle__label";
  label.textContent = t("chat.steps.toggle", {}, {
    fallback: "Ver etapas da resposta",
  });

  button.append(icon, label);

  const detail = document.createElement("div");
  detail.className = "chat-steps-detail";
  detail.hidden = true;

  validSteps.forEach((step) => {
    if (!step) return;

    const item = document.createElement("div");
    item.className = "chat-steps-detail__item";

    const header = document.createElement("div");
    header.className = "chat-steps-detail__header";

    const badge = document.createElement("span");
    badge.className = "chat-steps-detail__badge";

    const badgeIcon = document.createElement("span");
    badgeIcon.className = "chat-steps-detail__badge-icon";
    badgeIcon.textContent = CHAT_STEP_ICONS[step.key] || "•";

    const badgeLabel = document.createElement("span");
    badgeLabel.className = "chat-steps-detail__badge-label";
    badgeLabel.textContent = typeof step.title === "string" && step.title.trim()
      ? step.title.trim()
      : t("chat.steps.item", {}, { fallback: "Etapa" });

    badge.append(badgeIcon, badgeLabel);
    header.append(badge);
    item.append(header);

    const detailText = typeof step.detail === "string" ? step.detail.trim() : "";
    if (detailText) {
      const body = document.createElement("p");
      body.className = "chat-steps-detail__body";
      body.textContent = detailText;
      item.append(body);
    }

    detail.append(item);
  });

  container.append(button, detail);

  const toggleDetail = () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    detail.hidden = expanded;
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    toggleDetail();
  });

  return container;
}

function getStepStatusMessage(stepKey, steps) {
  if (Array.isArray(steps)) {
    const match = steps.find((step) => step?.key === stepKey && typeof step.title === "string");
    if (match) {
      return match.title.trim();
    }
  }

  const fallback = STEP_STATUS_FALLBACK[stepKey] || "";
  return t(`chat.steps.status.${stepKey}`, {}, { fallback }) || fallback;
}

function hasChatStep(key, steps) {
  if (!Array.isArray(steps)) {
    return false;
  }
  return steps.some((step) => step?.key === key);
}

function clearChatStepProgression() {
  if (chatStepStatusTimers.length) {
    chatStepStatusTimers.forEach((timerId) => clearTimeout(timerId));
    chatStepStatusTimers = [];
  }
}

function beginChatStepProgression() {
  clearChatStepProgression();
  setChatStatus(getStepStatusMessage("analysis"), "");
}

function advanceChatStepProgression(steps) {
  clearChatStepProgression();
  let delay = 0;

  CHAT_STEP_SEQUENCE.forEach((key) => {
    if (key !== "analysis" && !hasChatStep(key, steps)) {
      return;
    }

    const message = getStepStatusMessage(key, steps);
    const type = key === "finalize" ? "success" : "";
    const timer = setTimeout(() => {
      setChatStatus(message, type);
    }, delay);

    chatStepStatusTimers.push(timer);
    delay += key === "finalize" ? 0 : 420;
  });

  if (!hasChatStep("finalize", steps)) {
    const message = getStepStatusMessage("finalize", steps);
    const timer = setTimeout(() => {
      setChatStatus(message, "success");
    }, delay || 0);
    chatStepStatusTimers.push(timer);
  }
}

function failChatStepProgression(message) {
  clearChatStepProgression();
  setChatStatus(message, "error");
}

function updatePreviewButtonDisplay(button, isPlaying) {
  if (!(button instanceof HTMLElement)) {
    return;
  }

  const usesText = button.dataset.usesText === "true";
  button.classList.toggle("is-playing", isPlaying);

  if (usesText) {
    button.textContent = isPlaying
      ? t("chat.songs.stopPreview", {}, { fallback: "Stop" })
      : t("chat.songs.preview", {}, { fallback: "Preview" });
  } else {
    button.setAttribute(
      "aria-label",
      isPlaying
        ? t("chat.songs.pausePreview", {}, { fallback: "Pause preview" })
        : t("chat.songs.playPreview", {}, { fallback: "Play preview" })
    );
  }
}

function updateSongPreviewButtons(itemElement, isPlaying) {
  if (!(itemElement instanceof HTMLElement)) {
    return;
  }

  const buttons = itemElement.querySelectorAll('[data-action="preview"]');
  buttons.forEach((button) => {
    if (button instanceof HTMLElement) {
      updatePreviewButtonDisplay(button, isPlaying);
    }
  });
}

function getSongPreviewReference(suggestion) {
  if (!suggestion) {
    return null;
  }

  if (typeof suggestion.uri === "string" && suggestion.uri.trim()) {
    return suggestion.uri.trim();
  }

  if (typeof suggestion.spotifyUrl === "string" && suggestion.spotifyUrl.trim()) {
    return suggestion.spotifyUrl.trim();
  }

  if (typeof suggestion.id === "string" && suggestion.id.startsWith("spotify:track:")) {
    return suggestion.id;
  }

  return null;
}

function formatPreviewUnavailableReason(reasonKey) {
  if (typeof reasonKey !== "string" || !reasonKey) {
    return t("chat.songs.noPreview", {}, { fallback: "No preview available for this song." });
  }

  return t(`chat.songs.previewUnavailableReason.${reasonKey}`, {}, {
    fallback: t("chat.songs.noPreview", {}, { fallback: "No preview available for this song." }),
  });
}

function ensurePreviewForSuggestion(suggestion) {
  if (!suggestion) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  if (typeof suggestion.previewUrl === "string" && suggestion.previewUrl) {
    return;
  }

  const reference = getSongPreviewReference(suggestion);
  if (!reference) {
    return;
  }

  if (songPreviewLookupState.inFlight.has(reference) || songPreviewLookupState.completed.has(reference)) {
    return;
  }

  const request = fetch(`/track-preview?reference=${encodeURIComponent(reference)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Track preview lookup failed with status ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (!data || typeof data !== "object") {
        return;
      }

      const previewUrl = typeof data.previewUrl === "string" ? data.previewUrl : undefined;
      const reason = typeof data.reason === "string" ? data.reason : undefined;

      if (previewUrl) {
        const prevUrl = suggestion.previewUrl;
        suggestion.previewUrl = previewUrl;
        suggestion.previewUnavailableReason = undefined;
        songPreviewLookupState.completed.add(reference);

        if (prevUrl !== previewUrl) {
          setTimeout(() => {
            renderSongSuggestions();
            updateMiniPlayerState();
          }, 0);
        }
      } else if (reason) {
        suggestion.previewUnavailableReason = reason;
        songPreviewLookupState.completed.add(reference);
      } else {
        suggestion.previewUnavailableReason = suggestion.previewUnavailableReason || "unknown";
        songPreviewLookupState.completed.add(reference);
      }
    })
    .catch((error) => {
      console.warn("Preview lookup failed", error);
      suggestion.previewUnavailableReason = suggestion.previewUnavailableReason || "error";
    })
    .finally(() => {
      songPreviewLookupState.inFlight.delete(reference);
    });

  songPreviewLookupState.inFlight.set(reference, request);
}

function ensureSongMiniPlayer() {
  if (songSuggestionPreviewState.miniPlayer) {
    return songSuggestionPreviewState.miniPlayer;
  }

  const container = document.createElement("aside");
  container.className = "mini-player";
  container.hidden = true;
  container.setAttribute("aria-live", "polite");
  container.setAttribute("role", "complementary");
  container.setAttribute(
    "aria-label",
    t("chat.songs.playerNowPlaying", {}, { fallback: "Now playing" })
  );

  const content = document.createElement("div");
  content.className = "mini-player__content";

  const art = document.createElement("div");
  art.className = "mini-player__art";
  art.setAttribute("aria-hidden", "true");

  const info = document.createElement("div");
  info.className = "mini-player__info";

  const label = document.createElement("span");
  label.className = "mini-player__label";
  label.textContent = t("chat.songs.playerNowPlaying", {}, { fallback: "Now playing" });

  const title = document.createElement("p");
  title.className = "mini-player__title";
  title.textContent = t("chat.songs.preview", {}, { fallback: "Preview" });

  const artist = document.createElement("p");
  artist.className = "mini-player__artist";
  artist.textContent = "";

  info.append(label, title, artist);

  const controls = document.createElement("div");
  controls.className = "mini-player__controls";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "mini-player__button mini-player__play";
  playButton.setAttribute(
    "aria-label",
    t("chat.songs.playPreview", {}, { fallback: "Play preview" })
  );
  playButton.textContent = "▶";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "mini-player__button mini-player__close";
  closeButton.setAttribute(
    "aria-label",
    t("chat.songs.closePlayer", {}, { fallback: "Close mini player" })
  );
  closeButton.textContent = "✕";

  controls.append(playButton, closeButton);

  const volume = document.createElement("div");
  volume.className = "mini-player__volume";

  const volumeSlider = document.createElement("input");
  volumeSlider.type = "range";
  volumeSlider.className = "mini-player__volume-slider";
  volumeSlider.min = "0";
  volumeSlider.max = "1";
  volumeSlider.step = "0.05";
  volumeSlider.value = String(songSuggestionPreviewState.volume);
  volumeSlider.setAttribute(
    "aria-label",
    t("chat.songs.volume", {}, { fallback: "Volume" })
  );

  const applyVolume = (value) => {
    const numeric = Number(value);
    const clamped = Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 1) : 1;
    volumeSlider.value = String(clamped);
    const percent = `${Math.round(clamped * 100)}%`;
    volumeSlider.style.setProperty("--volume-percent", percent);
    songSuggestionPreviewState.volume = clamped;
    if (songSuggestionPreviewState.audio) {
      songSuggestionPreviewState.audio.volume = clamped;
    }
  };

  volumeSlider.addEventListener("input", () => {
    applyVolume(volumeSlider.value);
  });
  volumeSlider.addEventListener("change", () => {
    applyVolume(volumeSlider.value);
  });

  applyVolume(volumeSlider.value);

  volume.append(volumeSlider);

  const progress = document.createElement("div");
  progress.className = "mini-player__progress";
  const progressFill = document.createElement("div");
  progressFill.className = "mini-player__progress-fill";
  progress.append(progressFill);

  content.append(art, info, controls);
  container.append(content, volume, progress);

  const audio = document.createElement("audio");
  audio.preload = "none";
  audio.hidden = true;
  audio.volume = songSuggestionPreviewState.volume;
  container.append(audio);

  document.body.append(container);

  const miniPlayer = {
    container,
    art,
    label,
    title,
    artist,
    playButton,
    closeButton,
    volume,
    volumeSlider,
    progress,
    progressFill,
  };

  songSuggestionPreviewState.audio = audio;
  songSuggestionPreviewState.miniPlayer = miniPlayer;

  playButton.addEventListener("click", () => {
    if (!songSuggestionPreviewState.audio) {
      return;
    }
    if (!songSuggestionPreviewState.activeId) {
      return;
    }
    if (songSuggestionPreviewState.audio.paused) {
      songSuggestionPreviewState.audio
        .play()
        .catch(() => undefined);
    } else {
      songSuggestionPreviewState.audio.pause();
    }
  });

  closeButton.addEventListener("click", () => {
    stopActiveSongPreview({ hidePlayer: true });
  });

  audio.addEventListener("play", () => {
    songSuggestionPreviewState.isPlaying = true;
    updateMiniPlayerState();
  });

  audio.addEventListener("pause", () => {
    songSuggestionPreviewState.isPlaying = false;
    updateMiniPlayerState();
  });

  audio.addEventListener("ended", () => {
    songSuggestionPreviewState.isPlaying = false;
    audio.currentTime = 0;
    updateMiniPlayerState();
  });

  audio.addEventListener("timeupdate", () => {
    if (!songSuggestionPreviewState.miniPlayer) return;
    const duration = audio.duration;
    const current = audio.currentTime;
    const percent = duration ? Math.min((current / duration) * 100, 100) : 0;
    songSuggestionPreviewState.miniPlayer.progressFill.style.width = `${percent}%`;
  });

  audio.addEventListener("volumechange", () => {
    const currentVolume = Math.min(Math.max(audio.volume, 0), 1);
    songSuggestionPreviewState.volume = currentVolume;
    if (songSuggestionPreviewState.miniPlayer?.volumeSlider) {
      const slider = songSuggestionPreviewState.miniPlayer.volumeSlider;
      if (document.activeElement !== slider) {
        slider.value = String(currentVolume);
      }
      slider.style.setProperty("--volume-percent", `${Math.round(currentVolume * 100)}%`);
    }
  });

  return miniPlayer;
}

function updateMiniPlayerState() {
  const { miniPlayer, audio, card, item } = songSuggestionPreviewState;
  if (!miniPlayer || !audio) {
    return;
  }

  const { playButton, container } = miniPlayer;
  if (songSuggestionPreviewState.activeId) {
    container.hidden = false;
    container.classList.add("is-visible");
  } else {
    container.classList.remove("is-visible");
    container.hidden = true;
  }

  const isPlaying = !audio.paused && !audio.ended;
  playButton.classList.toggle("is-playing", isPlaying);
  playButton.setAttribute(
    "aria-label",
    isPlaying
      ? t("chat.songs.pausePreview", {}, { fallback: "Pause preview" })
      : t("chat.songs.playPreview", {}, { fallback: "Play preview" })
  );
  playButton.textContent = isPlaying ? "⏸" : "▶";

  if (card) {
    card.classList.toggle("is-playing", isPlaying);
  }
  if (item) {
    item.classList.toggle("is-playing", isPlaying);
  }

  if (item) {
    updateSongPreviewButtons(item, isPlaying);
  }

  if (!isPlaying && audio.currentTime === 0) {
    miniPlayer.progressFill.style.width = "0%";
  }

  if (miniPlayer.volumeSlider && document.activeElement !== miniPlayer.volumeSlider) {
    const currentVolume = Math.min(Math.max(audio.volume, 0), 1);
    miniPlayer.volumeSlider.value = String(currentVolume);
    miniPlayer.volumeSlider.style.setProperty("--volume-percent", `${Math.round(currentVolume * 100)}%`);
  }
}

function normalizeSongSuggestionId(baseTitle, baseArtist, fallbackSeed = "") {
  const titleKey = (baseTitle || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const artistKey = (baseArtist || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const combined = `${titleKey || "song"}-${artistKey || "artist"}-${fallbackSeed}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return combined || `song-${Date.now()}`;
}

function normalizeIncomingSongSuggestion(raw, index = 0) {
  if (!raw) {
    return null;
  }

  if (typeof raw === "string") {
    const separatorMatch = raw.match(/\s[–—-]\s/);
    let candidateTitle = raw.trim();
    let candidateArtist = "";
    if (separatorMatch) {
      const separator = separatorMatch[0];
      const index = raw.indexOf(separator);
      candidateTitle = raw.slice(0, index).trim();
      candidateArtist = raw.slice(index + separator.length).trim();
    }
    const id = normalizeSongSuggestionId(candidateTitle, candidateArtist, index.toString());
    return {
      id,
      title: candidateTitle,
      artist: candidateArtist,
      album: undefined,
      previewUrl: null,
      uri: null,
      spotifyUrl: undefined,
      imageUrl: undefined,
    };
  }

  if (typeof raw !== "object") {
    return null;
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : typeof raw.name === "string" ? raw.name.trim() : "";
  const artist = typeof raw.artist === "string" ? raw.artist.trim() : "";
  const reason =
    typeof raw.previewUnavailableReason === "string" && raw.previewUnavailableReason.trim()
      ? raw.previewUnavailableReason.trim()
      : undefined;
  if (!title) {
    return null;
  }

  const idFromPayload =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : typeof raw.uri === "string" && raw.uri.trim()
      ? raw.uri.trim()
      : normalizeSongSuggestionId(title, artist, index.toString());

  return {
    id: idFromPayload,
    title,
    artist,
    album: typeof raw.album === "string" ? raw.album.trim() : undefined,
    previewUrl:
      typeof raw.previewUrl === "string"
        ? raw.previewUrl
        : raw.previewUrl === null
        ? null
        : undefined,
    uri: typeof raw.uri === "string" ? raw.uri : null,
    spotifyUrl:
      typeof raw.spotifyUrl === "string"
        ? raw.spotifyUrl
        : typeof raw.url === "string"
        ? raw.url
        : undefined,
    imageUrl:
      typeof raw.imageUrl === "string"
        ? raw.imageUrl
        : Array.isArray(raw.images) && raw.images[0]
        ? raw.images[0]
        : undefined,
    previewUnavailableReason: reason,
  };
}

function mergeSongSuggestions(current, incoming) {
  if (!Array.isArray(incoming) || !incoming.length) {
    return current.slice();
  }

  const merged = current.slice();
  const lookup = new Map();
  merged.forEach((item) => {
    if (item?.id) {
      lookup.set(item.id, item);
    }
  });

  incoming.forEach((entry, index) => {
    const normalized = normalizeIncomingSongSuggestion(entry, index);
    if (!normalized) {
      return;
    }
    const existing = normalized.id ? lookup.get(normalized.id) : undefined;
    if (existing) {
      existing.title = normalized.title || existing.title;
      existing.artist = normalized.artist || existing.artist;
      existing.album = normalized.album ?? existing.album;
      if (normalized.previewUrl !== undefined) {
        existing.previewUrl = normalized.previewUrl;
      }
      if (normalized.uri) {
        existing.uri = normalized.uri;
      }
      if (normalized.spotifyUrl) {
        existing.spotifyUrl = normalized.spotifyUrl;
      }
      if (normalized.imageUrl) {
        existing.imageUrl = normalized.imageUrl;
      }
      if (normalized.previewUnavailableReason !== undefined) {
        existing.previewUnavailableReason = normalized.previewUnavailableReason;
      }
    } else {
      merged.push({
        ...normalized,
      });
      lookup.set(normalized.id, merged[merged.length - 1]);
    }
  });

  return merged;
}

function getActiveSongSuggestions() {
  return [...chatState.songSuggestions];
}

function stopActiveSongPreview(options = {}) {
  const { hidePlayer = false } = options;
  const { audio, miniPlayer, button, card, item } = songSuggestionPreviewState;

  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }

  if (card) {
    card.classList.remove("is-playing");
  }
  if (item) {
    item.classList.remove("is-playing");
    updateSongPreviewButtons(item, false);
  } else if (button) {
    updatePreviewButtonDisplay(button, false);
  }

  if (miniPlayer) {
    miniPlayer.progressFill.style.width = "0%";
    if (hidePlayer) {
      miniPlayer.container.classList.remove("is-visible");
      miniPlayer.container.hidden = true;
    }
  }

  songSuggestionPreviewState.activeId = null;
  songSuggestionPreviewState.button = null;
  songSuggestionPreviewState.card = null;
  songSuggestionPreviewState.item = null;
  songSuggestionPreviewState.suggestion = null;
  songSuggestionPreviewState.isPlaying = false;
  updateMiniPlayerState();
}

function setMiniPlayerContent(suggestion) {
  const miniPlayer = ensureSongMiniPlayer();

  miniPlayer.title.textContent = suggestion.title || t("chat.songs.unknownSong", {}, { fallback: "Unknown song" });
  miniPlayer.artist.textContent = suggestion.artist || t("Unknown artist", {}, { fallback: "Unknown artist" });

  const nowPlayingLabel = t("chat.songs.playerNowPlaying", {}, { fallback: "Now playing" });
  miniPlayer.label.textContent = nowPlayingLabel;
  miniPlayer.container.setAttribute(
    "aria-label",
    suggestion.title ? `${nowPlayingLabel}: ${suggestion.title}` : nowPlayingLabel
  );

  if (suggestion.imageUrl) {
    const safeUrl = suggestion.imageUrl.replace(/"/g, '\\"');
    miniPlayer.art.style.setProperty("--mini-player-art", `url("${safeUrl}")`);
    miniPlayer.art.style.backgroundImage = `url("${safeUrl}")`;
    miniPlayer.art.classList.add("has-image");
  } else {
    miniPlayer.art.style.removeProperty("--mini-player-art");
    miniPlayer.art.style.backgroundImage = "";
    miniPlayer.art.classList.remove("has-image");
  }

  miniPlayer.progressFill.style.width = "0%";

  if (miniPlayer.volumeSlider && document.activeElement !== miniPlayer.volumeSlider) {
    const currentVolume = Math.min(Math.max(songSuggestionPreviewState.volume, 0), 1);
    miniPlayer.volumeSlider.value = String(currentVolume);
  }
  if (miniPlayer.volumeSlider) {
    miniPlayer.volumeSlider.style.setProperty(
      "--volume-percent",
      `${Math.round(Math.min(Math.max(songSuggestionPreviewState.volume, 0), 1) * 100)}%`
    );
  }
}

function toggleSongPreview(suggestion, itemElement, button) {
  if (!suggestion || !button || !itemElement) {
    return;
  }

  if (!suggestion.previewUrl) {
    const message = t("chat.songs.noPreview", {}, { fallback: "No preview available for this song." });
    setChatStatus(message, "error");
    setTimeout(() => {
      if (chatStatus?.textContent === message) {
        setChatStatus("", "");
      }
    }, 3000);
    return;
  }

  ensureSongMiniPlayer();

  if (songSuggestionPreviewState.audio && songSuggestionPreviewState.activeId !== suggestion.id) {
    songSuggestionPreviewState.audio.pause();
  }

  if (songSuggestionPreviewState.activeId === suggestion.id) {
    songSuggestionPreviewState.button = button;
    songSuggestionPreviewState.item = itemElement;
    songSuggestionPreviewState.card = itemElement.querySelector(".song-card");
    if (songSuggestionPreviewState.audio?.paused) {
      songSuggestionPreviewState.audio
        .play()
        .catch(() => undefined);
    } else if (songSuggestionPreviewState.audio) {
      songSuggestionPreviewState.audio.pause();
    }
    return;
  }

  if (songSuggestionPreviewState.item && songSuggestionPreviewState.item !== itemElement) {
    songSuggestionPreviewState.item.classList.remove("is-playing");
    songSuggestionPreviewState.card?.classList.remove("is-playing");
    updateSongPreviewButtons(songSuggestionPreviewState.item, false);
  }

  songSuggestionPreviewState.button = button;
  songSuggestionPreviewState.card = itemElement.querySelector(".song-card");
  songSuggestionPreviewState.item = itemElement;

  songSuggestionPreviewState.activeId = suggestion.id;
  songSuggestionPreviewState.suggestion = suggestion;
  songSuggestionPreviewState.isPlaying = false;

  setMiniPlayerContent(suggestion);

  if (songSuggestionPreviewState.audio) {
    songSuggestionPreviewState.audio.src = suggestion.previewUrl;
    songSuggestionPreviewState.audio.currentTime = 0;
    songSuggestionPreviewState.audio.volume = songSuggestionPreviewState.volume;
    if (songSuggestionPreviewState.miniPlayer) {
      songSuggestionPreviewState.miniPlayer.progressFill.style.width = "0%";
    }
    songSuggestionPreviewState.audio
      .play()
      .catch(() => undefined);
  }

  updateMiniPlayerState();
}

function removeSongSuggestion(songId) {
  if (songSuggestionPreviewState.activeId === songId) {
    stopActiveSongPreview();
  }
  chatState.songSuggestions = chatState.songSuggestions.filter((suggestion) => suggestion.id !== songId);
  if (!chatState.songSuggestions.length) {
    stopActiveSongPreview();
  }
  renderSongSuggestions();
}

function renderSongSuggestions() {
  if (!songSuggestionList) return;
  songSuggestionList.innerHTML = "";

  const suggestions = chatState.songSuggestions || [];
  if (!suggestions.length) {
    stopActiveSongPreview({ hidePlayer: true });
    songSuggestionList.dataset.empty = "true";
    const empty = document.createElement("p");
    empty.className = "tag-empty";
    empty.textContent = t("chat.tags.emptySong", {}, { fallback: "No songs yet." });
    songSuggestionList.append(empty);
    return;
  }

  songSuggestionList.removeAttribute("data-empty");

  const list = document.createElement("ul");
  list.className = "song-suggestions";
  list.setAttribute("role", "list");

  suggestions.forEach((suggestion) => {
    if (!suggestion?.id) return;
    const item = document.createElement("li");
    item.className = "song-suggestions__item";
    item.dataset.songId = suggestion.id;

    if (!suggestion.previewUrl) {
      ensurePreviewForSuggestion(suggestion);
    }

    const card = document.createElement("article");
    card.className = "song-card";

    const media = document.createElement("div");
    media.className = "song-card__media";
    if (suggestion.imageUrl) {
      const image = document.createElement("img");
      image.src = suggestion.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      media.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "song-card__placeholder";
      placeholder.textContent = "♪";
      media.append(placeholder);
    }

    const body = document.createElement("div");
    body.className = "song-card__body";

    const header = document.createElement("div");
    header.className = "song-card__header";

  const title = document.createElement("span");
  title.className = "song-card__title";
  title.textContent = suggestion.title;
  header.append(title);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "song-card__remove";
    removeButton.setAttribute("data-action", "remove");
    removeButton.textContent = t("chat.songs.remove", {}, { fallback: "Remove" });
    removeButton.setAttribute(
      "aria-label",
      t("chat.songs.removeAria", { title: suggestion.title }, { fallback: `Remove ${suggestion.title}` })
    );
    header.append(removeButton);

    body.append(header);

    const artist = document.createElement("p");
    artist.className = "song-card__artist";
    artist.textContent = suggestion.artist || t("Unknown artist", {}, { fallback: "Unknown artist" });
    body.append(artist);

    const controls = document.createElement("div");
    controls.className = "song-card__controls";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "song-card__play";

    const playIcon = document.createElement("span");
    playIcon.className = "song-card__play-icon";
    playIcon.setAttribute("aria-hidden", "true");
    playButton.append(playIcon);

    if (suggestion.previewUrl) {
      playButton.setAttribute("data-action", "preview");
      playButton.dataset.previewKind = "icon";
      playButton.setAttribute(
        "aria-label",
        t("chat.songs.playPreview", {}, { fallback: "Play preview" })
      );

      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "song-card__preview";
      previewButton.setAttribute("data-action", "preview");
      previewButton.dataset.previewKind = "text";
      previewButton.dataset.usesText = "true";
      previewButton.textContent = t("chat.songs.preview", {}, { fallback: "Preview" });

      controls.append(playButton, previewButton);
    } else {
      playButton.disabled = true;
      playButton.classList.add("is-disabled");
      playButton.setAttribute("aria-disabled", "true");
      const reasonText = formatPreviewUnavailableReason(suggestion.previewUnavailableReason);
      playButton.setAttribute("aria-label", reasonText);
      playButton.setAttribute("title", reasonText);
      controls.append(playButton);

      const reasonLabel = document.createElement("span");
      reasonLabel.className = "song-card__no-preview";
      reasonLabel.textContent = reasonText;
      controls.append(reasonLabel);
    }

    if (suggestion.spotifyUrl) {
      const link = document.createElement("a");
      link.href = suggestion.spotifyUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "song-card__spotify";
      link.setAttribute("data-action", "spotify");
      link.innerHTML = `
        <span class="song-card__spotify-icon" aria-hidden="true"></span>
        <span class="sr-only">${t("Open in Spotify", {}, { fallback: "Open in Spotify" })}</span>
      `;
      controls.append(link);
    }

    if (controls.childElementCount) {
      body.append(controls);
    }

    card.append(media, body);
    item.append(card);
    list.append(item);
  });

  songSuggestionList.append(list);

  const previousPreviewKind = songSuggestionPreviewState.button?.dataset?.previewKind;

  if (songSuggestionPreviewState.activeId) {
    const activeItem = list.querySelector(`[data-song-id="${songSuggestionPreviewState.activeId}"]`);
    if (activeItem instanceof HTMLElement) {
      songSuggestionPreviewState.item = activeItem;
      songSuggestionPreviewState.card = activeItem.querySelector(".song-card");
      const candidateButtons = Array.from(
        activeItem.querySelectorAll('[data-action="preview"]')
      ).filter((button) => button instanceof HTMLElement);
      const preferredButton = candidateButtons.find(
        (button) => button.dataset?.previewKind === previousPreviewKind
      );
      const fallbackButton = candidateButtons[0];
      songSuggestionPreviewState.button =
        preferredButton instanceof HTMLElement
          ? preferredButton
          : fallbackButton instanceof HTMLElement
          ? fallbackButton
          : null;

      updateSongPreviewButtons(activeItem, !!songSuggestionPreviewState.isPlaying);
      updateMiniPlayerState();
    } else {
      stopActiveSongPreview({ hidePlayer: true });
    }
  }
}

function handleSongSuggestionClick(event) {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  const actionElement = event.target.closest("[data-action]");
  if (!(actionElement instanceof HTMLElement)) {
    return;
  }

  const action = actionElement.dataset.action;
  if (!action) {
    return;
  }

  const item = actionElement.closest("[data-song-id]");
  if (!(item instanceof HTMLElement)) {
    return;
  }

  const songId = item.dataset.songId;
  if (!songId) {
    return;
  }

  if (action === "remove") {
    event.preventDefault();
    removeSongSuggestion(songId);
    return;
  }

  if (action === "preview") {
    event.preventDefault();
    const suggestion = chatState.songSuggestions.find((entry) => entry?.id === songId);
    if (suggestion) {
      toggleSongPreview(suggestion, item, actionElement);
    }
    return;
  }

  if (action === "spotify") {
    stopActiveSongPreview();
  }
}

function populateChatPlaylistSelect(playlists) {
  if (!chatPlaylistSelect) return;

  const previousValue = chatState.playlistContext?.id || chatPlaylistSelect.value;
  chatPlaylistSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = playlists.length
    ? t("Select a playlist to enhance (optional)", {}, {
        fallback: "Select a playlist to enhance (optional)",
      })
    : t("No playlists found", {}, { fallback: "No playlists found" });
  chatPlaylistSelect.append(placeholder);

  if (!playlists.length) {
    chatPlaylistSelect.disabled = true;
    chatPlaylistSelect.value = "";
    setChatPlaylistHint(
      t("We couldn't find playlists in your account yet.", {}, {
        fallback: "We couldn't find playlists in your account yet.",
      }),
      ""
    );
    return;
  }

  playlists.slice(0, 200).forEach((playlist) => {
    if (!playlist?.id || !playlist?.name) return;
    const option = document.createElement("option");
    const trackCount = typeof playlist.trackCount === "number" ? playlist.trackCount : undefined;
    option.value = playlist.id;
    option.textContent = trackCount
      ? `${playlist.name} (${trackCount} ${getCopyLabel("song", trackCount)})`
      : playlist.name;
    option.dataset.name = playlist.name;
    chatPlaylistSelect.append(option);
  });

  chatPlaylistSelect.disabled = false;
  const hasPrevious = previousValue && Array.from(chatPlaylistSelect.options).some((option) => option.value === previousValue);
  chatPlaylistSelect.value = hasPrevious ? previousValue : "";
  updateChatPlaylistHint();
}

function updateChatPlaylistHint() {
  if (!chatPlaylistSelect) return;
  const value = chatPlaylistSelect.value;

  if (!value) {
    setChatPlaylistHint("", "");
    return;
  }

  const selectedOption = chatPlaylistSelect.options[chatPlaylistSelect.selectedIndex];
  const name = selectedOption?.dataset?.name || selectedOption?.textContent || "playlist";

  if (chatState.playlistContext && chatState.playlistContext.id === value) {
    const count = Array.isArray(chatState.playlistContext.songs)
      ? chatState.playlistContext.songs.length
      : 0;
    setChatPlaylistHint(
      t(
        "Enhancing “{name}” with {count} {songsLabel} loaded.",
        {
          name,
          count,
          songsLabel: getCopyLabel("song", count),
        },
        {
          fallback: `Enhancing “${name}” with ${count} ${count === 1 ? "song" : "songs"} loaded.`,
        }
      ),
      "success"
    );
  } else {
    setChatPlaylistHint(
      t("Select “{name}” to load songs for enhancement.", { name }, {
        fallback: `Select “${name}” to load songs for enhancement.`,
      }),
      ""
    );
  }
}

async function loadChatPlaylistDetails(playlistId) {
  if (!playlistId) return;

  chatPlaylistLoading = true;
  const selectedOption = chatPlaylistSelect?.options[chatPlaylistSelect.selectedIndex];
  const name = selectedOption?.dataset?.name || selectedOption?.textContent || "playlist";
  setChatPlaylistHint(
    t("Loading songs from “{name}”…", { name }, { fallback: `Loading songs from “${name}”…` }),
    ""
  );

  try {
    const response = await fetch(`/playlist-details?id=${encodeURIComponent(playlistId)}`);
    if (response.status === 401) {
      throw Object.assign(
        new Error("Log in with Spotify to load this playlist."),
        { status: 401 }
      );
    }
    if (response.status === 403) {
      throw Object.assign(
        new Error("We need new Spotify permissions to view this playlist."),
        { status: 403 }
      );
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Couldn't load playlist songs.");
    }

    const data = await response.json();
    const playlist = data?.playlist;
    if (!playlist || !playlist.id) {
      throw new Error("Playlist details were incomplete.");
    }

    const songs = Array.isArray(playlist.songs)
      ? playlist.songs
          .filter((song) => song && song.title && song.artist)
          .map((song) => ({
            title: song.title.trim(),
            artist: song.artist.trim(),
          }))
      : [];

    chatState.playlistContext = {
      id: playlist.id,
      name: playlist.name || name,
      description: playlist.description || "",
      songs,
    };
    chatState.didSendPlaylistContext = false;
    chatState.playlistSummaryPostedId = null;
    updateChatPlaylistHint();
  } catch (error) {
    console.error("Chat playlist details error", error);
    chatState.playlistContext = null;
    chatState.playlistSummaryPostedId = null;
    const message = error?.message
      ? t(error.message, {}, { fallback: error.message })
      : t("Couldn't load playlist songs.");
    setChatPlaylistHint(message, "error");
  } finally {
    chatPlaylistLoading = false;
  }
}

function handleChatPlaylistSelectChange() {
  if (!chatPlaylistSelect) return;
  const value = chatPlaylistSelect.value;
  chatState.playlistContext = null;
  chatState.didSendPlaylistContext = false;
  chatState.playlistSummaryPostedId = null;

  if (!value) {
    updateChatPlaylistHint();
    return;
  }

  loadChatPlaylistDetails(value);
}

async function handleChatPlaylistSend() {
  if (!chatPlaylistSelect) return;
  const sendButton = chatSendPlaylistContextButton instanceof HTMLButtonElement ? chatSendPlaylistContextButton : null;
  if (sendButton) {
    sendButton.disabled = true;
  }

  if (chatBlocked) {
    setChatPlaylistHint(t("Hold on a moment—still loading playlist details."), "error");
    if (sendButton) {
      sendButton.disabled = false;
    }
    return;
  }

  const playlistId = chatPlaylistSelect.value;
  if (!playlistId) {
    setChatPlaylistHint(t("chat.playlistModal.missingSelection"), "error");
    if (sendButton) {
      sendButton.disabled = false;
    }
    return;
  }

  if (chatPlaylistLoading) {
    setChatPlaylistHint(t("Hold on a moment—still loading playlist details."), "error");
    if (sendButton) {
      sendButton.disabled = false;
    }
    return;
  }

  try {
    if (!chatState.playlistContext || chatState.playlistContext.id !== playlistId) {
      await loadChatPlaylistDetails(playlistId);
    }

    const context = chatState.playlistContext;
    if (!context || context.id !== playlistId) {
      setChatPlaylistHint(t("Couldn't load playlist songs."), "error");
      return;
    }

    const songs = Array.isArray(context.songs) ? context.songs : [];
    if (!songs.length) {
      setChatPlaylistHint(t("Couldn't load playlist songs."), "error");
      return;
    }

    if (chatState.playlistSummaryPostedId === playlistId) {
      setChatPlaylistHint(t("chat.playlistModal.already"), "");
      return;
    }

    setChatPlaylistHint(t("chat.playlistModal.sending"), "");

    const total = songs.length;
    const highlightCount = Math.min(total, 30);
    const highlightLines = songs
      .slice(0, highlightCount)
      .map((song, index) => `${index + 1}. ${song.title} — ${song.artist}`);

    const summaryHeading = highlightLines.length
      ? t("chat.playlistModal.sentSummary", { name: context.name, total }, {
          fallback: `Loaded playlist "${context.name}" with ${total} tracks. Here are a few highlights:`,
        })
      : t("chat.playlistModal.sentSummaryNoHighlights", { name: context.name, total }, {
          fallback: `Loaded playlist "${context.name}" with ${total} tracks.`,
        });

    let summaryForModel = summaryHeading;
    if (highlightLines.length) {
      summaryForModel += `\n${highlightLines.join("\n")}`;
      if (total > highlightCount) {
        summaryForModel += `\n${t("chat.playlistModal.more", { count: total - highlightCount }, {
          fallback: `… +${total - highlightCount} more`,
        })}`;
      }
    }

    chatState.messages.push({ role: "user", content: summaryForModel });
    chatState.playlistSummaryPostedId = playlistId;
    chatState.playlistContext = context;
    chatState.didSendPlaylistContext = false;

    const wrapper = document.createElement("div");
    wrapper.className = "chat-message chat-message--user";
    const avatar = document.createElement("div");
    avatar.className = "chat-message__avatar";
    avatar.textContent = "🎧";
    const bubble = document.createElement("div");
    bubble.className = "chat-message__bubble";
    const sender = document.createElement("span");
    sender.className = "chat-message__sender";
    sender.textContent = t("chat.sender.user", {}, { fallback: "You" });
    const body = document.createElement("p");
    body.className = "chat-message__body";
    const intro = document.createElement("span");
    intro.textContent = summaryHeading;
    body.append(intro);

    if (highlightLines.length) {
      const list = document.createElement("ol");
      list.className = "chat-liked-list";
      songs.slice(0, highlightCount).forEach((song) => {
        const li = document.createElement("li");
        li.textContent = song.artist ? `${song.title} — ${song.artist}` : song.title;
        list.append(li);
      });
      if (total > highlightCount) {
        const more = document.createElement("li");
        more.textContent = t("chat.playlistModal.more", { count: total - highlightCount }, {
          fallback: `… +${total - highlightCount} more`,
        });
        list.append(more);
      }
      body.append(list);
    }

    bubble.append(sender, body);
    wrapper.append(avatar, bubble);
    chatLog?.append(wrapper);
    chatLog?.scrollTo({ top: chatLog.scrollHeight, behavior: "smooth" });

    closeChatPlaylistModal();
    setChatPlaylistHint("", "");
    setChatStatus(t("chat.playlistModal.ready"), "success");
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
    }
  }
}

function buildChatPlaylistPrompt() {
  const activeSongs = getActiveSongSuggestions();
  const activeSongLines = activeSongs.map((song) => {
    const artistPart = song.artist ? ` — ${song.artist}` : "";
    return `- ${song.title}${artistPart}`;
  });

  const sections = [];

  if (activeSongLines.length) {
    sections.push(
      t(
        "chat.songs.prompt.baseSelected",
        {},
        {
          fallback:
            "Create a cohesive Spotify playlist using only the songs the user kept from the suggestions. Provide a captivating name and a short description that reflects the chat context and these tracks.",
        }
      )
    );
    sections.push(
      t(
        "chat.songs.prompt.keepSelection",
        {},
        {
          fallback:
            "Do not add or remove songs. Feel free to suggest an order that enhances flow.",
        }
      )
    );
    sections.push(activeSongLines.join("\n"));
  } else {
    sections.push(
      t(
        "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.",
        {},
        {
          fallback:
            "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.",
        }
      )
    );
  }

  if (chatState.themeTags.length) {
    sections.push(
      t(
        "Focus tags: {tags}",
        { tags: chatState.themeTags.join(", ") },
        { fallback: `Focus tags: ${chatState.themeTags.join(", ")}` }
      )
    );
  }
  
  if (!activeSongLines.length) {
    const fallbackSongs = chatState.songSuggestions
      .map((song) => (song ? `${song.title}${song.artist ? ` — ${song.artist}` : ""}` : ""))
      .filter(Boolean);
    if (fallbackSongs.length) {
      sections.push(
        t(
          "Song references to echo or build around: {tags}",
          { tags: fallbackSongs.join(", ") },
          {
            fallback: `Song references to echo or build around: ${fallbackSongs.join(", ")}`,
          }
        )
      );
    }
  }

  if (chatState.likedSongs.length) {
    const highlightCount = Math.min(chatState.likedSongs.length, 40);
    const highlights = chatState.likedSongs
      .slice(0, highlightCount)
      .map((song, index) => `${index + 1}. ${song.name} — ${song.artist}`)
      .join("\n");
    const likedSection = t(
      "Liked songs uploaded ({total}). Sample:\n{highlights}",
      {
        total: chatState.likedSongs.length,
        highlights,
      },
      {
        fallback: `Liked songs uploaded (${chatState.likedSongs.length}). Sample:\n${highlights}`,
      }
    );
    sections.push(likedSection);
  }

  if (chatState.playlistContext) {
    const { name, description, songs } = chatState.playlistContext;
    const count = Array.isArray(songs) ? songs.length : 0;
    const countLabel = count
      ? t(
          " ({count} {songsLabel})",
          {
            count,
            songsLabel: getCopyLabel("song", count),
          },
          {
            fallback: ` (${count} ${count === 1 ? "song" : "songs"})`,
          }
        )
      : "";
    const header = t(
      "Existing playlist to enhance: “{name}”{countLabel}.",
      { name, countLabel },
      {
        fallback: `Existing playlist to enhance: “${name}”${countLabel}.`,
      }
    );
    const details = [];
    if (description) {
      details.push(
        t("Description: {description}", { description }, { fallback: `Description: ${description}` })
      );
    }

    if (count) {
      const highlights = songs
        .slice(0, 25)
        .map((song) => `- ${song.title} — ${song.artist}`)
        .join("\n");
      if (highlights) {
        details.push(
          t(
            "Current track highlights:\n{highlights}",
            { highlights },
            { fallback: `Current track highlights:\n${highlights}` }
          )
        );
      }
    }

    sections.push([header, ...details].join("\n"));
  }

  const recentMessages = chatState.messages.slice(-MAX_CHAT_HISTORY);
  const conversation = recentMessages
    .filter((message, index) => {
      if (
        index === 0 &&
        message.role === "assistant" &&
        message.content === chatState.initialAssistantMessage
      ) {
        return false;
      }
      return true;
    })
    .map((message) => {
      const speaker = message.role === "assistant" ? t("chat.sender.assistant") : t("chat.sender.user");
      return `${speaker}: ${message.content}`;
    })
    .join("\n");

  if (conversation) {
    sections.push(
      t("Conversation notes:\n{conversation}", { conversation }, { fallback: `Conversation notes:\n${conversation}` })
    );
  }

  return sections.join("\n\n");
}

function removeTag(group, value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return;

  if (group === "theme") {
    chatState.themeTags = chatState.themeTags.filter((tag) => tag.trim().toLowerCase() !== normalized);
    renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
  }
}

function handleTagListClick(event) {
  const target = event.target instanceof HTMLElement ? event.target.closest("button[data-tag]") : null;
  if (!target) return;
  event.preventDefault();
  const group = target.dataset.group;
  const value = target.dataset.tag;
  if (!group || !value) return;
  removeTag(group, value);
}

function resetChat() {
  initialAssistantMessage = getInitialAssistantMessage();
  chatState.initialAssistantMessage = initialAssistantMessage;
  chatState.messages = [{ role: "assistant", content: initialAssistantMessage }];
  chatState.themeTags = [];
  chatState.songSuggestions = [];
  chatState.chatSteps = [];
  chatState.didSendPlaylistContext = false;
  chatState.likedSongs = [];
  chatState.playlistSummaryPostedId = null;

  if (chatInput) {
    chatInput.value = "";
  }

  if (chatLog) {
    chatLog.innerHTML = "";
    appendChatMessage("assistant", initialAssistantMessage);
  }

  renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
  renderSongSuggestions();

  setChatStatus("", "");
  setChatCreationStatus("", "");
  updateChatPlaylistHint();
  updateLikedSongsButtonState();
}

async function requestChatResponse(messages, modelName, options = {}) {
  const payload = {
    messages,
  };
  if (modelName) {
    payload.model = modelName;
  }
  if (options.playlist) {
    payload.playlist = options.playlist;
  }

  const response = await fetch("/chat-ideas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const detail = typeof errorPayload.error === "string" ? errorPayload.error : null;
    throw new Error(detail || "We couldn’t chat with the model right now.");
  }

  return response.json();
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (chatBlocked) return;
  if (!chatInput) return;
  const message = chatInput.value.trim();
  if (!message) {
    setChatStatus(t("Write a message before sending."), "error");
    return;
  }

  if (chatPlaylistLoading) {
    setChatStatus(t("Hold on a moment—still loading playlist details."), "error");
    return;
  }

  const shouldAttachPlaylistContext =
    chatState.playlistContext && !chatState.didSendPlaylistContext;
  const playlistContext = shouldAttachPlaylistContext ? chatState.playlistContext : null;

  chatState.messages.push({ role: "user", content: message });
  appendChatMessage("user", message);
  chatInput.value = "";
  beginChatStepProgression();

  if (chatSendButton) {
    chatSendButton.disabled = true;
    chatSendButton.classList.add("is-loading");
  }

  try {
    const recentMessages = chatState.messages.slice(-MAX_CHAT_HISTORY);
    const selectedModel = getSelectedModel();
    chatState.chatSteps = [];
    const payload = await requestChatResponse(recentMessages, selectedModel, {
      playlist: playlistContext || undefined,
    });
    const reply = typeof payload.reply === "string" ? payload.reply.trim() : "";

    if (playlistContext) {
      chatState.didSendPlaylistContext = true;
      updateChatPlaylistHint();
    }

    const incomingThemes = Array.isArray(payload.themeTags)
      ? payload.themeTags
      : Array.isArray(payload.tags)
      ? payload.tags
      : [];
    const incomingSongLabels = Array.isArray(payload.songExamples)
      ? payload.songExamples
      : Array.isArray(payload.songTags)
      ? payload.songTags
      : [];
    const structuredSuggestions = Array.isArray(payload.songSuggestions)
      ? payload.songSuggestions
      : [];
    const combinedSongSuggestions = structuredSuggestions.length
      ? structuredSuggestions
      : incomingSongLabels;

    if (incomingThemes.length) {
      chatState.themeTags = mergeTags(chatState.themeTags, incomingThemes);
    }

    if (combinedSongSuggestions.length) {
      chatState.songSuggestions = mergeSongSuggestions(
        chatState.songSuggestions,
        combinedSongSuggestions
      );
    }

    chatState.chatSteps = Array.isArray(payload.steps) ? payload.steps : [];

    renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
    renderSongSuggestions();

    if (reply) {
      chatState.messages.push({ role: "assistant", content: reply });
      appendChatMessage("assistant", reply, { steps: chatState.chatSteps });
    }

    advanceChatStepProgression(chatState.chatSteps);
  } catch (error) {
    console.error("Chat error", error);
    const fallback = t("We couldn’t chat with the model right now.");
    const message =
      typeof error?.message === "string"
        ? t(error.message, {}, { fallback: error.message })
        : fallback;
    failChatStepProgression(message || fallback);
  } finally {
    if (chatSendButton) {
      chatSendButton.disabled = false;
      chatSendButton.classList.remove("is-loading");
    }
  }
}

function handleChatInputKeydown(event) {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return;
  }

  event.preventDefault();

  if (chatForm) {
    if (typeof chatForm.requestSubmit === "function") {
      chatForm.requestSubmit();
    } else {
      chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  }
}

async function handleChatPlaylistCreation() {
  if (!chatCreatePlaylistButton) return;

  const selectedSongs = getActiveSongSuggestions();
  const hasConversation = chatState.messages.some((message) => message.role === "user");
  const hasContext = hasConversation || chatState.themeTags.length > 0 || selectedSongs.length > 0;

  if (!selectedSongs.length) {
    setChatCreationStatus(
      t("chat.songs.selectBeforeCreate", {}, { fallback: "Keep at least one suggested song before creating a playlist." }),
      "error"
    );
    return;
  }

  if (!hasContext) {
    setChatCreationStatus(
      t("Chat with Gemini or capture some tags before creating a playlist."),
      "error"
    );
    return;
  }

  const prompt = buildChatPlaylistPrompt();
  if (!prompt.trim()) {
    setChatCreationStatus(
      t("We need more chat context or tags to craft a playlist."),
      "error"
    );
    return;
  }

  const originalLabel =
    (chatCreatePlaylistButton.textContent || "").trim() || t("chat.form.create");
  chatCreatePlaylistButton.disabled = true;
  chatCreatePlaylistButton.textContent = t("Creating…");
  setChatCreationStatus(t("Creating a playlist from your chat…"), "");

  resetLiveStatus();
  startLiveStatus("custom");

  try {
    const selectedModel = getSelectedModel();
    const payload = { prompt };
    if (selectedModel) {
      payload.model = selectedModel;
    }
    if (chatState.playlistContext?.id) {
      payload.playlistId = chatState.playlistContext.id;
    }
    if (selectedSongs.length) {
      payload.songs = selectedSongs.map((song) => ({
        title: song.title,
        artist: song.artist,
        uri: song.uri ?? undefined,
      }));
    }

    const response = await fetch("/create-custom-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw Object.assign(
        new Error(errorPayload.error || "Couldn't create a playlist from chat."),
        { status: response.status }
      );
    }

    const data = await response.json();
    const playlist = data?.playlist;
    if (!playlist) {
      throw new Error("The server didn't return a playlist.");
    }

    prependPlaylist(playlist);
    setChatCreationStatus(
      t("Playlist created from your chat! Opening the playlists view…"),
      "success"
    );

    const songTitles = (playlist.songs || [])
      .map((song) =>
        song?.title && song?.artist
          ? `${song.title} — ${song.artist}`
          : song?.name && song?.artist
          ? `${song.name} — ${song.artist}`
          : undefined
      )
      .filter(Boolean)
      .slice(0, 40);

    completeLiveStatus(songTitles, {
      label: playlist.upgraded
        ? t("Playlist refreshed!")
        : t("Custom playlist ready!"),
    });

    switchView("playlists");
  } catch (error) {
    console.error("Chat playlist creation error", error);
    const message =
      error?.status === 401
        ? t("Log in with Spotify to create playlists.")
        : t(error?.message || "Couldn't create a playlist from chat.", {}, {
            fallback: error?.message || "Couldn't create a playlist from chat.",
          });
    setChatCreationStatus(message, "error");
    failLiveStatus(message);
  } finally {
    chatCreatePlaylistButton.disabled = false;
    chatCreatePlaylistButton.textContent = originalLabel;
  }
}

function syncPlaylistSelectionFromCurrentValue() {
  if (!targetPlaylistInput) {
    updatePlaylistStatusForValue("");
    return;
  }
  const currentValue = targetPlaylistInput.value.trim();
  if (playlistSelect) {
    const match = findPlaylistOption(currentValue);
    playlistSelect.value = match ? match.value : "";
  }
  updatePlaylistStatusForValue(currentValue);
}

async function loadUserPlaylists(options = {}) {
  if (!playlistSelect) return;
  if (playlistsLoading) return;

  playlistsLoading = true;
  playlistsLoaded = false;

  const { trigger = "auto", source = "form" } = options;
  const triggeredByFormButton = trigger === "manual" && source === "form";
  const triggeredByChatButton = trigger === "manual" && source === "chat";
  const originalFormButtonLabel = refreshPlaylistsButton?.textContent;
  const originalChatButtonLabel = chatRefreshPlaylistsButton?.textContent;

  playlistSelect.disabled = true;
  playlistSelect.innerHTML = "";
  const loadingOption = document.createElement("option");
  loadingOption.value = "";
  loadingOption.textContent = t("Loading…", {}, { fallback: "Loading…" });
  playlistSelect.append(loadingOption);
  setPlaylistSelectStatus(t("Loading your playlists…"), "");

  if (mixPlaylistSelect) {
    mixPlaylistSelect.disabled = true;
    mixPlaylistSelect.innerHTML = "";
    const mixLoadingOption = document.createElement("option");
    mixLoadingOption.value = "";
    mixLoadingOption.textContent = t("Loading…", {}, { fallback: "Loading…" });
    mixPlaylistSelect.append(mixLoadingOption);
  }

  setMixStatusMessage("");

  if (chatPlaylistSelect) {
    chatPlaylistSelect.disabled = true;
    chatPlaylistSelect.innerHTML = "";
    const chatLoadingOption = document.createElement("option");
    chatLoadingOption.value = "";
    chatLoadingOption.textContent = t("Loading…", {}, { fallback: "Loading…" });
    chatPlaylistSelect.append(chatLoadingOption);
  }
  setChatPlaylistHint(t("Loading your playlists…"), "");

  if (refreshPlaylistsButton) {
    refreshPlaylistsButton.disabled = true;
    if (triggeredByFormButton) {
      refreshPlaylistsButton.textContent = "Refreshing…";
    }
  }

  if (chatRefreshPlaylistsButton) {
    chatRefreshPlaylistsButton.disabled = true;
    if (triggeredByChatButton) {
      chatRefreshPlaylistsButton.textContent = "Refreshing…";
    }
  }

  try {
    const response = await fetch("/user-playlists");
    if (response.status === 401 || response.status === 403) {
      playlistSelect.innerHTML = "";
      const signinOption = document.createElement("option");
      signinOption.value = "";
      signinOption.textContent = t("Sign in to load your playlists");
      playlistSelect.append(signinOption);
      const message =
        response.status === 403
          ? t("We need new permissions to list your playlists. Click ‘Log in with Spotify’.")
          : t("Sign in with Spotify to choose an existing playlist.");
      setPlaylistSelectStatus(message, "error");
      playlistSelect.disabled = true;
      loginButton?.focus();
      playlistsLoaded = false;
      if (mixPlaylistSelect) {
        mixPlaylistSelect.innerHTML = "";
        const mixSigninOption = document.createElement("option");
        mixSigninOption.value = "";
        mixSigninOption.textContent = t("Sign in to load your playlists");
        mixPlaylistSelect.append(mixSigninOption);
        mixPlaylistSelect.disabled = true;
      }
      const mixMessage =
        response.status === 403
          ? message
          : t("mix.status.login", {}, { fallback: "Log in with Spotify to mix playlists." });
  setMixStatusMessage(mixMessage, "error");
      if (chatPlaylistSelect) {
        chatPlaylistSelect.innerHTML = "";
        const chatSigninOption = document.createElement("option");
        chatSigninOption.value = "";
        chatSigninOption.textContent = t("Sign in to load your playlists");
        chatPlaylistSelect.append(chatSigninOption);
        chatPlaylistSelect.disabled = true;
      }
      setChatPlaylistHint(t("Sign in with Spotify to enhance an existing playlist."), "error");
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Couldn't load your playlists.");
    }

    const data = await response.json();
    const playlists = Array.isArray(data?.playlists) ? data.playlists : [];
    cachedUserPlaylists = playlists;

    playlistSelect.innerHTML = "";

    if (!playlists.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = t("No playlists found");
      option.selected = true;
      playlistSelect.append(option);
      setPlaylistSelectStatus(t("We couldn't find playlists in your account yet."), "");
      playlistSelect.disabled = true;
      if (mixPlaylistSelect) {
        mixPlaylistSelect.innerHTML = "";
        const mixEmptyOption = document.createElement("option");
        mixEmptyOption.value = "";
        mixEmptyOption.textContent = t("No playlists found");
        mixPlaylistSelect.append(mixEmptyOption);
        mixPlaylistSelect.disabled = true;
      }
      setMixStatusKey(
        "We couldn't find playlists in your account yet.",
        {},
        "",
        "We couldn't find playlists in your account yet."
      );
      if (chatPlaylistSelect) {
        chatPlaylistSelect.innerHTML = "";
        const chatEmptyOption = document.createElement("option");
        chatEmptyOption.value = "";
        chatEmptyOption.textContent = t("No playlists found");
        chatPlaylistSelect.append(chatEmptyOption);
        chatPlaylistSelect.disabled = true;
      }
      setChatPlaylistHint(t("We couldn't find playlists in your account yet."), "");
      playlistsLoaded = true;
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("Select a playlist (optional)", {}, {
      fallback: "Select a playlist (optional)",
    });
    placeholder.selected = true;
    playlistSelect.append(placeholder);

    if (mixPlaylistSelect) {
      mixPlaylistSelect.innerHTML = "";
      const mixPlaceholder = document.createElement("option");
      mixPlaceholder.value = "";
      mixPlaceholder.textContent = t("mix.selectPlaceholder", {}, {
        fallback: "Select a playlist to mix",
      });
      mixPlaceholder.selected = true;
      mixPlaylistSelect.append(mixPlaceholder);
    }

    playlists.slice(0, 200).forEach((playlist) => {
      if (!playlist?.id || !playlist?.name) return;
      const option = document.createElement("option");
      option.value = playlist.id;
      const trackCount = typeof playlist.trackCount === "number" ? playlist.trackCount : undefined;
      option.textContent = trackCount
        ? `${playlist.name} (${trackCount} ${trackCount === 1 ? "song" : "songs"})`
        : playlist.name;
      option.dataset.name = playlist.name;
      playlistSelect.append(option);

      if (mixPlaylistSelect) {
        const mixOption = document.createElement("option");
        mixOption.value = playlist.id;
        mixOption.textContent = option.textContent;
        mixOption.dataset.name = playlist.name;
        mixPlaylistSelect.append(mixOption);
      }
    });

    playlistSelect.disabled = false;
    syncPlaylistSelectionFromCurrentValue();
    if (mixPlaylistSelect) {
      mixPlaylistSelect.disabled = false;
      handleMixSelectChange();
    }
    populateChatPlaylistSelect(playlists);
    if (triggeredByFormButton) {
      if (!targetPlaylistInput || !targetPlaylistInput.value.trim()) {
        setPlaylistSelectStatus(
          t("Playlists refreshed! Pick one to enhance."),
          "success"
        );
      }
    } else if (triggeredByChatButton) {
      setChatPlaylistHint(t("Playlists refreshed! Pick one to enhance."), "success");
    } else if (!targetPlaylistInput || !targetPlaylistInput.value.trim()) {
      setPlaylistSelectStatus(
        t("Pick a playlist to enhance or paste a link below."),
        ""
      );
    }
    playlistsLoaded = true;
  } catch (error) {
    const rawMessage = error?.message || "Couldn't load your playlists.";
    const message = t(rawMessage, {}, { fallback: rawMessage });
    playlistSelect.innerHTML = "";
    const retryOption = document.createElement("option");
    retryOption.value = "";
    retryOption.textContent = t("Load again");
    playlistSelect.append(retryOption);
    setPlaylistSelectStatus(message, "error");
    playlistSelect.disabled = true;
    if (mixPlaylistSelect) {
      mixPlaylistSelect.innerHTML = "";
      const mixRetryOption = document.createElement("option");
      mixRetryOption.value = "";
      mixRetryOption.textContent = t("Load again");
      mixPlaylistSelect.append(mixRetryOption);
      mixPlaylistSelect.disabled = true;
    }
  setMixStatusMessage(message, "error");
    if (chatPlaylistSelect) {
      chatPlaylistSelect.innerHTML = "";
      const chatRetryOption = document.createElement("option");
      chatRetryOption.value = "";
      chatRetryOption.textContent = t("Load again");
      chatPlaylistSelect.append(chatRetryOption);
      chatPlaylistSelect.disabled = true;
    }
    setChatPlaylistHint(message, "error");
    playlistsLoaded = false;
  } finally {
    if (refreshPlaylistsButton) {
      refreshPlaylistsButton.disabled = false;
      if (triggeredByFormButton && originalFormButtonLabel) {
        refreshPlaylistsButton.textContent = originalFormButtonLabel;
      }
    }
    if (chatRefreshPlaylistsButton) {
      chatRefreshPlaylistsButton.disabled = false;
      if (triggeredByChatButton && originalChatButtonLabel) {
        chatRefreshPlaylistsButton.textContent = originalChatButtonLabel;
      }
    }
    playlistsLoading = false;
  }
}

function handlePlaylistSelectChange() {
  if (!playlistSelect) return;
  const selectedValue = playlistSelect.value || "";
  if (targetPlaylistInput) {
    targetPlaylistInput.value = selectedValue;
  }
  updatePlaylistStatusForValue(selectedValue);
}

function handlePlaylistManualInput() {
  if (!targetPlaylistInput) return;
  const trimmed = targetPlaylistInput.value.trim();
  if (targetPlaylistInput.value !== trimmed) {
    targetPlaylistInput.value = trimmed;
  }
  if (playlistSelect) {
    const match = findPlaylistOption(trimmed);
    playlistSelect.value = match ? match.value : "";
  }
  updatePlaylistStatusForValue(trimmed);
}

function renderPlaylists(playlists) {
  resultsContainer.innerHTML = "";
  playlists.forEach((playlist) => {
    const card = document.createElement("article");
    card.className = "playlist-card";
    const previewTitle = t("Playlist preview for {name}", { name: playlist.name }, {
      fallback: `Playlist preview for ${playlist.name}`,
    });
    const openLabel = t("Open in Spotify");
    card.innerHTML = `
      <div>
        <h3>${playlist.name}</h3>
        <p>${playlist.description}</p>
      </div>
      <iframe
        src="${playlist.embedUrl}"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title="${previewTitle}"
      ></iframe>
      <a class="open-link" href="${playlist.spotifyUrl}" target="_blank" rel="noopener noreferrer">
          ${openLabel}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 19L19 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 5H19V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    `;
    resultsContainer.append(card);
  });
}

function prependPlaylist(playlist) {
  const cards = Array.from(resultsContainer.querySelectorAll(".playlist-card"));
  const card = document.createElement("article");
  card.className = "playlist-card";
  const previewTitle = t("Playlist preview for {name}", { name: playlist.name }, {
    fallback: `Playlist preview for ${playlist.name}`,
  });
  const openLabel = t("Open in Spotify");
  card.innerHTML = `
    <div>
      <h3>${playlist.name}</h3>
      <p>${playlist.description}</p>
    </div>
    <iframe
      src="${playlist.embedUrl}"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      title="${previewTitle}"
    ></iframe>
    <a class="open-link" href="${playlist.spotifyUrl}" target="_blank" rel="noopener noreferrer">
        ${openLabel}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 19L19 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 5H19V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </a>
  `;

  if (cards.length) {
    resultsContainer.prepend(card);
  } else {
    resultsContainer.append(card);
  }
}

function renderGenrePlaylists(playlists) {
  if (!genreResults) return;
  genreResults.innerHTML = "";

  if (!Array.isArray(playlists) || playlists.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status";
    empty.textContent = t("No liked songs to group just yet.");
    genreResults.append(empty);
    return;
  }

  playlists.forEach((playlist, index) => {
    const card = document.createElement("article");
    card.className = "genre-card";

    const header = document.createElement("div");
    header.className = "genre-card__header";

    const title = document.createElement("h3");
    title.className = "genre-card__title";
    title.textContent = playlist?.name || playlist?.genre || t("Genre playlist");

    const countLabel = document.createElement("span");
    countLabel.className = "genre-card__count";
    const count = typeof playlist?.count === "number" ? playlist.count : playlist?.songs?.length || 0;
    countLabel.textContent = `${count} ${getCopyLabel("song", count)}`;

    header.append(title, countLabel);

    const description = document.createElement("p");
    description.className = "genre-card__description";
    description.textContent = playlist?.description || t("Collection built from your liked songs.");

    const details = document.createElement("details");
    if (index === 0) {
      details.open = true;
    }

  const summary = document.createElement("summary");
    summary.textContent = t("View songs ({count})", { count }, { fallback: `View songs (${count})` });

    const list = document.createElement("ul");
    list.className = "genre-card__list";

    const songs = Array.isArray(playlist?.songs) ? playlist.songs : [];
    const renderLimit = 150;
    songs.slice(0, renderLimit).forEach((song, songIndex) => {
      if (!song) return;
      const li = document.createElement("li");
      const titleText = song?.title || song?.name || t("Track {index}", {
        index: songIndex + 1,
      }, { fallback: `Track ${songIndex + 1}` });
      const artistText = song?.artist || song?.artistName || t("Unknown artist");
      li.textContent = `${titleText} — ${artistText}`;
      list.append(li);
    });

    if (songs.length > renderLimit) {
      const more = document.createElement("li");
  more.className = "genre-card__list-more";
      more.textContent = t("… and {count} more songs", {
        count: songs.length - renderLimit,
      }, { fallback: `… and ${songs.length - renderLimit} more songs` });
      list.append(more);
    }

    details.append(summary, list);

    card.append(header, description, details);
    genreResults.append(card);
  });
}

function formatSigned(value, digits = 0) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Number(value.toFixed(digits));
  const epsilon = 1 / Math.pow(10, digits + 2);
  if (Math.abs(rounded) < epsilon) {
    if (digits > 0) {
      return `+0.${"0".repeat(digits)}`;
    }
    return "+0";
  }
  const formatted = rounded.toFixed(digits);
  return rounded > 0 ? `+${formatted}` : formatted;
}

function formatEnergyPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const clamped = Math.min(Math.max(value, 0), 1);
  return `${Math.round(clamped * 100)}%`;
}

function getKeyMatchLabel(distance) {
  if (!Number.isFinite(distance)) {
    return "contrast";
  }
  if (distance <= 0.25) {
    return "perfect";
  }
  if (distance <= 1.2) {
    return "smooth";
  }
  return "contrast";
}

function getEnergyDirection(delta) {
  if (!Number.isFinite(delta) || Math.abs(delta) <= 0.04) {
    return "steady";
  }
  return delta > 0 ? "build" : "release";
}

function renderMixHighlights(payload) {
  if (!mixResults) return;

  mixState.pending = false;
  mixState.lastPayload = payload && typeof payload === "object" ? payload : null;

  const summary = payload?.summary && typeof payload.summary === "object" ? payload.summary : null;
  const transitions = Array.isArray(payload?.transitions) ? payload.transitions : [];

  mixResults.innerHTML = "";

  const hasSummary = Boolean(summary);
  const hasTransitions = transitions.length > 0;

  if (!hasSummary && !hasTransitions) {
    mixState.lastPayload = null;
    const empty = document.createElement("div");
    empty.className = "mix-results__empty";
    const paragraph = document.createElement("p");
    paragraph.textContent = t("mix.empty");
    empty.append(paragraph);
    mixResults.append(empty);
    mixResults.setAttribute("data-empty", "");
    return;
  }

  mixResults.removeAttribute("data-empty");

  if (hasSummary) {
    const summaryCard = document.createElement("div");
    summaryCard.className = "mix-summary";

    const summaryTitle = document.createElement("h3");
    summaryTitle.className = "mix-summary__title";
    summaryTitle.textContent = t("mix.summaryTitle");
    summaryCard.append(summaryTitle);

    const list = document.createElement("ul");
    list.className = "mix-summary__list";

    const tempo = summary.tempo || {};
    if (Number.isFinite(tempo.min) && Number.isFinite(tempo.max)) {
      const min = Math.round(tempo.min);
      const max = Math.round(tempo.max);
      const delta = Math.abs(max - min);
      const item = document.createElement("li");
      item.textContent = t(
        "mix.summary.tempoRange",
        { min, max, delta },
        { fallback: `Tempo range: ${min}–${max} BPM (Δ ${delta})` }
      );
      list.append(item);
    }

    const energy = summary.energy || {};
    if (
      Number.isFinite(energy.start) &&
      Number.isFinite(energy.peak) &&
      Number.isFinite(energy.end)
    ) {
      const item = document.createElement("li");
      item.textContent = t(
        "mix.summary.energyArc",
        {
          start: formatEnergyPercent(energy.start),
          peak: formatEnergyPercent(energy.peak),
          end: formatEnergyPercent(energy.end),
        },
        {
          fallback: `Energy arc: ${formatEnergyPercent(energy.start)} → ${formatEnergyPercent(
            energy.peak
          )} → ${formatEnergyPercent(energy.end)}`,
        }
      );
      list.append(item);
    }

    const keyFamilies = Array.isArray(summary.key?.families)
      ? summary.key.families
      : [];
    const familiesLine = keyFamilies.length
      ? t(
          "mix.summary.keySpread",
          { families: keyFamilies.join(", ") },
          { fallback: `Key families covered: ${keyFamilies.join(", ")}` }
        )
      : t("mix.summary.keyFallback");
    const keysItem = document.createElement("li");
    keysItem.textContent = familiesLine;
    list.append(keysItem);

    if (summary.updatedAt) {
      const updated = new Date(summary.updatedAt);
      if (!Number.isNaN(updated.getTime())) {
        const formatter = new Intl.DateTimeFormat(currentLocale, {
          hour: "2-digit",
          minute: "2-digit",
        });
        const item = document.createElement("li");
        item.textContent = t(
          "mix.summary.updated",
          { time: formatter.format(updated) },
          { fallback: `Mixed at ${formatter.format(updated)}` }
        );
        list.append(item);
      }
    }

    if (payload?.limited && typeof payload.mixedCount === "number") {
      const limitedItem = document.createElement("li");
      limitedItem.textContent = t(
        "mix.summary.limited",
        { count: payload.mixedCount },
        {
          fallback: `Only the first ${payload.mixedCount} tracks were re-ordered to keep things fast.`,
        }
      );
      list.append(limitedItem);
    }

    summaryCard.append(list);
    mixResults.append(summaryCard);
  }

  if (hasTransitions) {
    const list = document.createElement("ul");
    list.className = "mix-transition-list";

    transitions.slice(0, 12).forEach((transition) => {
      if (!transition) return;
      const item = document.createElement("li");
      item.className = "mix-transition";

      const trackLine = document.createElement("div");
      trackLine.className = "mix-transition__tracks";

      const fromLabel = transition?.from?.title
        ? `${transition.from.title}${
            transition.from.artist ? ` — ${transition.from.artist}` : ""
          }`
        : transition?.from?.artist || t("Unknown artist");
      const toLabel = transition?.to?.title
        ? `${transition.to.title}${transition.to.artist ? ` — ${transition.to.artist}` : ""}`
        : transition?.to?.artist || t("Unknown artist");

      const fromSpan = document.createElement("span");
      fromSpan.textContent = fromLabel;
      const arrowSpan = document.createElement("span");
      arrowSpan.textContent = "→";
      const toSpan = document.createElement("span");
      toSpan.textContent = toLabel;

      trackLine.append(fromSpan, arrowSpan, toSpan);
      item.append(trackLine);

      const metrics = document.createElement("div");
      metrics.className = "mix-transition__metrics";

      const tempoMetric = document.createElement("span");
      tempoMetric.className = "mix-transition__metric";
      tempoMetric.textContent = t(
        "mix.transition.bpm",
        {
          delta: formatSigned(Number(transition?.tempoDelta ?? 0), 1),
        },
        {
          fallback: `Δ BPM ${formatSigned(Number(transition?.tempoDelta ?? 0), 1)}`,
        }
      );
      metrics.append(tempoMetric);

      const camelotFrom = transition?.from?.camelot || "N/A";
      const camelotTo = transition?.to?.camelot || "N/A";
      const matchLabelKey = getKeyMatchLabel(Number(transition?.camelotDistance));
      const keyMetric = document.createElement("span");
      keyMetric.className = "mix-transition__metric";
      keyMetric.textContent = t(
        "mix.transition.key",
        {
          from: camelotFrom,
          to: camelotTo,
          match: t(`mix.transition.matchLabels.${matchLabelKey}`),
        },
        {
          fallback: `Key ${camelotFrom} → ${camelotTo}`,
        }
      );
      metrics.append(keyMetric);

      const energyMetric = document.createElement("span");
      energyMetric.className = "mix-transition__metric";
      const energyDirection = getEnergyDirection(Number(transition?.energyDelta));
      energyMetric.textContent = t(
        "mix.transition.energy",
        {
          from: formatEnergyPercent(transition?.from?.energy),
          to: formatEnergyPercent(transition?.to?.energy),
          direction: t(`mix.transition.energyLabels.${energyDirection}`),
        },
        {
          fallback: `Energy ${formatEnergyPercent(transition?.from?.energy)} → ${formatEnergyPercent(
            transition?.to?.energy
          )}`,
        }
      );
      metrics.append(energyMetric);

      if (typeof transition?.timeSignatureMatch === "boolean") {
        const phrasingMetric = document.createElement("span");
        phrasingMetric.className = "mix-transition__metric";
        const phrasingKey = transition.timeSignatureMatch ? "locked" : "loose";
        phrasingMetric.textContent = t(
          "mix.transition.phrasing",
          { label: t(`mix.transition.phrasingLabels.${phrasingKey}`) },
          {
            fallback: `Phrasing ${transition.timeSignatureMatch ? "aligned" : "offset"}`,
          }
        );
        metrics.append(phrasingMetric);
      }

      item.append(metrics);
      list.append(item);
    });

    mixResults.append(list);
  }
}

function resetMixResultsToEmpty() {
  if (!mixResults) return;
  mixState.pending = false;
  mixState.lastPayload = null;
  mixResults.innerHTML = "";
  mixResults.setAttribute("data-empty", "");
  const empty = document.createElement("div");
  empty.className = "mix-results__empty";
  const paragraph = document.createElement("p");
  paragraph.textContent = t("mix.empty");
  empty.append(paragraph);
  mixResults.append(empty);
}

function handleMixSelectChange() {
  if (!mixPlaylistSelect) return;
  const value = (mixPlaylistSelect.value || "").trim();
  if (!value) {
    setMixStatusKey("mix.status.select");
    return;
  }
  const option = mixPlaylistSelect.options[mixPlaylistSelect.selectedIndex];
  const name = option?.dataset?.name || option?.textContent?.trim() || "";
  if (name) {
    setMixStatusKey("mix.status.ready", { name }, "", name ? `Ready to mix “${name}”` : undefined);
  } else {
    setMixStatusKey("mix.status.idle");
  }
}

async function handleMixPlaylist() {
  if (!mixPlaylistSelect || !mixPlaylistButton) return;
  if (mixProcessing) return;

  const playlistId = (mixPlaylistSelect.value || "").trim();
  if (!playlistId) {
    setMixStatusKey("mix.status.select", {}, "error");
    return;
  }

  mixProcessing = true;
  mixPlaylistButton.disabled = true;
  mixPlaylistButton.textContent = t("mix.ctaProgress");
  setMixStatusKey("mix.status.mixing");
  renderMixPendingState();

  resetLiveStatus();
  startLiveStatus("mix");
  switchTickerMode("mix", {
    requestId: null,
    operation: "mix",
    label: t("mix.status.mixing"),
    allowPlaceholder: true,
  });

  try {
    const response = await fetch("/mix-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId }),
    });

    if (response.status === 401 || response.status === 403) {
      const message =
        response.status === 403
          ? t(
              "We need new permissions to list your playlists. Click ‘Log in with Spotify’."
            )
          : t("mix.status.login");
      setMixStatusMessage(message, "error");
      failLiveStatus(message);
      resetMixResultsToEmpty();
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const rawMessage =
        typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : "Failed to mix playlist";
      const message = t(rawMessage, {}, { fallback: rawMessage });
      setMixStatusMessage(message, "error");
      failLiveStatus(message);
      resetMixResultsToEmpty();
      return;
    }

    const data = await response.json();
    renderMixHighlights(data);

    const playlistName = data?.playlist?.name || "";
    const changed = data?.changed !== false;
    const statusKey = changed ? "mix.status.success" : "mix.status.unchanged";
    const fallbackMessage = changed
      ? `Playlist mixed with seamless transitions!`
      : `Playlist was already optimized for smooth transitions.`;
    setMixStatusKey(statusKey, { name: playlistName }, "success", fallbackMessage);

    const tickerSongs = Array.isArray(data?.transitions)
      ? data.transitions
          .slice(0, 24)
          .map((transition) => {
            if (!transition?.from?.title || !transition?.from?.artist || !transition?.to?.title) {
              return undefined;
            }
            return `${transition.from.title} — ${transition.from.artist} → ${transition.to.title}`;
          })
          .filter(Boolean)
      : [];

    completeLiveStatus(tickerSongs, { label: statusKey });
  } catch (error) {
    console.error("Mix playlist error", error);
    const rawMessage = error?.message || "Failed to mix playlist";
    const message = t(rawMessage, {}, { fallback: rawMessage });
    setMixStatusMessage(message, "error");
    resetMixResultsToEmpty();
    failLiveStatus(message);
  } finally {
    mixProcessing = false;
    mixPlaylistButton.disabled = false;
    mixPlaylistButton.textContent = t("mix.cta");
  }
}

async function handlePreviewGeneration() {
  if (!previewButton) return;
  previewButton.disabled = true;
  previewButton.textContent = t("Generating…");
  const loader = createLoader();
  resultsContainer.innerHTML = "";
  resultsContainer.append(loader);
  resetLiveStatus();
  startLiveStatus("preview");

  try {
    const selectedModel = getSelectedModel();
    const params = new URLSearchParams();
    if (selectedModel) {
      params.set("model", selectedModel);
    }
    const query = params.toString();
    const response = await fetch(
      `/preview-playlists${query ? `?${query}` : ""}`
    );
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw Object.assign(new Error("Failed to generate playlists"), {
        status: response.status,
        detail: errorPayload.error,
      });
    }

    const data = await response.json();
    renderPlaylists(data.playlists || []);
    const songTitles = (data.playlists || [])
      .flatMap((playlist) => playlist.songs || [])
      .map((song) =>
        song?.title && song?.artist ? `${song.title} — ${song.artist}` : undefined
      )
      .filter(Boolean)
      .slice(0, 40);
    completeLiveStatus(songTitles);
  } catch (error) {
    const status =
      error.status === 401
        ? t("Spotify login required", {}, { fallback: "Spotify login required" })
        : t(error.detail || error.message || "Failed to generate playlists", {}, {
            fallback: error.detail || error.message || "Failed to generate playlists",
          });
    showStatus(formStatus, status, "error");
    resultsContainer.innerHTML = "";
    failLiveStatus(typeof status === "string" ? status : t("Generation failed"));
  } finally {
    previewButton.disabled = false;
    previewButton.textContent = t("hero.playlists.preview", {}, {
      fallback: "Generate Random Playlists",
    });
  }
}

async function handleCustomSubmit(event) {
  event.preventDefault();
  const promptValue = customPrompt.value.trim();
  const manualTarget = targetPlaylistInput ? targetPlaylistInput.value.trim() : "";
  const selectedTarget = playlistSelect ? playlistSelect.value.trim() : "";
  const playlistTarget = manualTarget || selectedTarget;

  if (!promptValue) {
    showStatus(formStatus, t("Please describe the playlist vibe first."), "error");
    return;
  }

  showStatus(formStatus, t("Spinning up your mix…"), "");
  resetLiveStatus();
  startLiveStatus(playlistTarget ? "customUpgrade" : "custom");

  const submitButton = customForm.querySelector("button[type=submit]");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = t("Creating…");
  }

  try {
    const selectedModel = getSelectedModel();
    const payload = { prompt: promptValue };
    if (selectedModel) {
      payload.model = selectedModel;
    }
    if (playlistTarget) {
      payload.playlistId = playlistTarget;
    }

    const response = await fetch("/create-custom-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw Object.assign(new Error(payload.error || "Failed to create playlist"), {
        status: response.status,
      });
    }

    const data = await response.json();
    if (data?.playlist) {
      prependPlaylist(data.playlist);
      const wasUpgraded = Boolean(data.playlist.upgraded || playlistTarget);
      showStatus(
        formStatus,
        wasUpgraded
          ? t("Playlist updated with fresh tracks on Spotify!")
          : t("Custom playlist created and added to Spotify!"),
        "success"
      );
      if (wasUpgraded) {
        customPrompt.value = "";
        if (targetPlaylistInput) {
          targetPlaylistInput.value = playlistTarget;
        }
        if (playlistSelect) {
          const match = findPlaylistOption(playlistTarget);
          playlistSelect.value = match ? match.value : "";
        }
        updatePlaylistStatusForValue(playlistTarget);
      } else {
        customForm.reset();
        if (playlistSelect) {
          playlistSelect.value = "";
        }
        updatePlaylistStatusForValue("");
      }
      const songTitles = (data.playlist.songs || [])
        .map((song) =>
          song?.title && song?.artist ? `${song.title} — ${song.artist}` : undefined
        )
        .filter(Boolean)
        .slice(0, 30);
      completeLiveStatus(songTitles);
    }
  } catch (error) {
    const message =
      error.status === 401
        ? t("Please log in with Spotify to continue.")
        : t(error.message || "Failed to create playlist", {}, {
            fallback: error.message || "Failed to create playlist",
          });
    showStatus(formStatus, message, "error");
    failLiveStatus(message);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = t("forms.custom.submit", {}, {
        fallback: "Create Custom Playlist",
      });
    }
  }
}

async function handleGenreGrouping() {
  if (!groupGenresButton) return;
  const originalLabel = groupGenresButton.textContent;
  groupGenresButton.disabled = true;
  groupGenresButton.textContent = t("Organizing…");

  if (genreStatus) {
  showStatus(genreStatus, t("Grouping your liked songs…"), "");
  }

  resetLiveStatus();
  startLiveStatus("genre");
  switchTickerMode("genre", {
    requestId: null,
    operation: "genre",
    label: t("live.genre.organizing"),
    allowPlaceholder: true,
  });

  if (genreResults) {
    const loader = createLoader("live.genre.organizing");
    genreResults.innerHTML = "";
    genreResults.append(loader);
  }

  try {
    const response = await fetch("/genre-playlists");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw Object.assign(
        new Error(payload?.error || "Couldn't group songs by genre."),
        { status: response.status }
      );
    }

    const data = await response.json();
    const playlists = Array.isArray(data?.playlists) ? data.playlists : [];
    renderGenrePlaylists(playlists);

    const totalPlaylists =
      typeof data?.summary?.totalPlaylists === "number"
        ? data.summary.totalPlaylists
        : playlists.length;
    const totalSongs =
      typeof data?.summary?.totalSongs === "number"
        ? data.summary.totalSongs
        : playlists.reduce((sum, playlist) => sum + (playlist?.songs?.length || 0), 0);

    if (genreStatus) {
      showStatus(
        genreStatus,
        t("Done! {playlists} genre playlists with {songs} songs.", {
          playlists: totalPlaylists,
          songs: totalSongs,
        }),
        "success"
      );
    }

    const sampleSongs = playlists
      .flatMap((playlist) =>
        (playlist?.songs || [])
          .slice(0, 3)
          .map((song) =>
            song?.title && song?.artist
              ? `${song.title} — ${song.artist}`
              : song?.name && song?.artist
              ? `${song.name} — ${song.artist}`
              : undefined
          )
      )
      .filter(Boolean)
      .slice(0, 80);

    completeLiveStatus(sampleSongs, {
      label: t("live.genre.ready"),
    });
  } catch (error) {
    const message =
      error?.status === 401
        ? t("Sign in with Spotify to continue.")
        : t(error?.message || "Couldn't group songs by genre.", {}, {
            fallback: error?.message || "Couldn't group songs by genre.",
          });
    if (genreStatus) {
      showStatus(genreStatus, message, "error");
    }
    if (genreResults) {
      genreResults.innerHTML = "";
    }
    failLiveStatus(message, { requestId: tickerState.requestId });
  } finally {
    groupGenresButton.disabled = false;
    groupGenresButton.textContent = originalLabel;
  }
}

groupGenresButton?.addEventListener("click", handleGenreGrouping);
previewButton?.addEventListener("click", handlePreviewGeneration);
customForm?.addEventListener("submit", handleCustomSubmit);
refreshModelsButton?.addEventListener("click", () => loadGeminiModels());
refreshPlaylistsButton?.addEventListener("click", () => loadUserPlaylists({ trigger: "manual" }));
playlistSelect?.addEventListener("change", handlePlaylistSelectChange);
targetPlaylistInput?.addEventListener("input", handlePlaylistManualInput);
mixPlaylistButton?.addEventListener("click", handleMixPlaylist);
mixPlaylistSelect?.addEventListener("change", handleMixSelectChange);
modelSelect?.addEventListener("change", () => {
  const selected = getSelectedModel();
  if (!selected) {
    localStorage.removeItem(MODEL_STORAGE_KEY);
    updateModelStatus(null);
    return;
  }

  localStorage.setItem(MODEL_STORAGE_KEY, selected);
  updateModelStatus(findModel(selected));
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.viewTarget === "chat" ? "chat" : "playlists";
    switchView(target);
  });
});

chatForm?.addEventListener("submit", handleChatSubmit);
chatInput?.addEventListener("keydown", handleChatInputKeydown);
themeTagList?.addEventListener("click", handleTagListClick);
songSuggestionList?.addEventListener("click", handleSongSuggestionClick);
chatCreatePlaylistButton?.addEventListener("click", handleChatPlaylistCreation);
chatResetButton?.addEventListener("click", resetChat);
chatPlaylistSelect?.addEventListener("change", handleChatPlaylistSelectChange);
chatRefreshPlaylistsButton?.addEventListener("click", () =>
  loadUserPlaylists({ trigger: "manual", source: "chat" })
);
chatOpenPlaylistModalButton?.addEventListener("click", openChatPlaylistModal);
chatPlaylistModalCloseButton?.addEventListener("click", () => closeChatPlaylistModal());
chatPlaylistModalCancelButton?.addEventListener("click", () => closeChatPlaylistModal());
chatPlaylistModalBackdrop?.addEventListener("click", () => closeChatPlaylistModal());
chatSendPlaylistContextButton?.addEventListener("click", handleChatPlaylistSend);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isChatPlaylistModalOpen()) {
    closeChatPlaylistModal();
  }
});

// upload dropdown toggle
if (chatUploadToggle) {
  chatUploadToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const expanded = chatUploadToggle.getAttribute('aria-expanded') === 'true';
    chatUploadToggle.setAttribute('aria-expanded', String(!expanded));
    if (chatUploadDropdown) {
      chatUploadDropdown.hidden = expanded;
    }
  });

  document.addEventListener('click', (event) => {
    if (!chatUploadDropdown) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    if (target === chatUploadToggle || chatUploadToggle.contains(target)) {
      return;
    }
    if (!chatUploadDropdown.hidden && !chatUploadDropdown.contains(target)) {
      chatUploadDropdown.hidden = true;
      chatUploadToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

if (sendLikedSongsButton) {
  sendLikedSongsButton.addEventListener('click', async (e) => {
    e.preventDefault();
    if (chatBlocked) return;
    if (chatState.likedSongs.length > 0) {
      setChatStatus(t('chat.liked.already'), '');
      return;
    }
    chatUploadToggle?.setAttribute('aria-expanded', 'false');
    if (chatUploadDropdown) chatUploadDropdown.hidden = true;

    // create pending user message
    const pendingCopy = t('chat.liked.sending');
    chatState.messages.push({ role: 'user', content: pendingCopy });
    const messageIndex = chatState.messages.length - 1;

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message chat-message--user chat-message--pending';
    const avatar = document.createElement('div');
    avatar.className = 'chat-message__avatar';
    avatar.textContent = '🎧';
    const bubble = document.createElement('div');
    bubble.className = 'chat-message__bubble';
    const sender = document.createElement('span');
    sender.className = 'chat-message__sender';
    sender.textContent = t('chat.sender.user', {}, { fallback: 'You' });
    const body = document.createElement('p');
    body.className = 'chat-message__body';
  const intro = document.createElement('span');
  intro.textContent = pendingCopy;
  body.append(intro);
    const loader = document.createElement('div');
    loader.className = 'chat-message__inline-loader';
  loader.setAttribute('aria-hidden', 'true');
    body.append(loader);
    bubble.append(sender, body);
    wrapper.append(avatar, bubble);
    chatLog?.append(wrapper);
    chatLog?.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });

    blockChat();
    setChatStatus(t('chat.liked.sending'), '');

    try {
      const response = await fetch('/liked-songs');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to send liked songs');
      }

      const likedSongs = await response.json().catch(() => []);
      if (!Array.isArray(likedSongs)) {
        throw new Error('Failed to send liked songs');
      }

      chatState.likedSongs = likedSongs;
      updateLikedSongsButtonState();
      const total = likedSongs.length;
      const highlightCount = Math.min(total, 30);
      const highlightLines = likedSongs
        .slice(0, highlightCount)
        .map((song, index) => `${index + 1}. ${song.name} — ${song.artist}`);

      const summaryHeading = highlightLines.length
        ? t('chat.liked.sentSummary', { total }, {
            fallback: `Sent ${total} liked songs. Here are a few highlights:`,
          })
        : t('chat.liked.sentSummaryNoHighlights', { total }, {
            fallback: `Sent ${total} liked songs.`,
          });

      let summaryForModel = summaryHeading;
      if (highlightLines.length) {
        summaryForModel += `\n${highlightLines.join('\n')}`;
        if (total > highlightCount) {
          summaryForModel += `\n${t('chat.liked.more', { count: total - highlightCount }, {
            fallback: `… +${total - highlightCount} more`,
          })}`;
        }
      }
      chatState.messages[messageIndex].content = summaryForModel;

      wrapper.classList.remove('chat-message--pending');
      body.innerHTML = '';
      const intro = document.createElement('span');
      intro.textContent = summaryHeading;
      body.append(intro);

      if (highlightLines.length) {
        const list = document.createElement('ol');
        list.className = 'chat-liked-list';
        likedSongs.slice(0, highlightCount).forEach((song) => {
          const li = document.createElement('li');
          const artist = song.artist || song.artistName || '';
          li.textContent = artist ? `${song.name} — ${artist}` : song.name;
          list.append(li);
        });
        if (total > highlightCount) {
          const more = document.createElement('li');
          more.textContent = t('chat.liked.more', { count: total - highlightCount }, {
            fallback: `… +${total - highlightCount} more`,
          });
          list.append(more);
        }
        body.append(list);
      }

      const playlistContext = !chatState.didSendPlaylistContext && chatState.playlistContext
        ? chatState.playlistContext
        : null;

      try {
  beginChatStepProgression();
        const recentMessages = chatState.messages.slice(-MAX_CHAT_HISTORY);
        const selectedModel = getSelectedModel();
        chatState.chatSteps = [];
        const payload = await requestChatResponse(recentMessages, selectedModel, {
          playlist: playlistContext || undefined,
        });

        const reply = typeof payload?.reply === 'string' ? payload.reply.trim() : '';

        const incomingThemes = Array.isArray(payload?.themeTags)
          ? payload.themeTags
          : Array.isArray(payload?.tags)
          ? payload.tags
          : [];
        const incomingSongLabels = Array.isArray(payload?.songExamples)
          ? payload.songExamples
          : Array.isArray(payload?.songTags)
          ? payload.songTags
          : [];
        const structuredSuggestions = Array.isArray(payload?.songSuggestions)
          ? payload.songSuggestions
          : [];
        const combinedSongSuggestions = structuredSuggestions.length
          ? structuredSuggestions
          : incomingSongLabels;

        if (incomingThemes.length) {
          chatState.themeTags = mergeTags(chatState.themeTags, incomingThemes);
        }

        if (combinedSongSuggestions.length) {
          chatState.songSuggestions = mergeSongSuggestions(
            chatState.songSuggestions,
            combinedSongSuggestions
          );
        }

        chatState.chatSteps = Array.isArray(payload?.steps) ? payload.steps : [];

        renderTagGroup(themeTagList, chatState.themeTags, 'theme', 'chat.tags.emptyTheme');
        renderSongSuggestions();

        if (reply) {
          chatState.messages.push({ role: 'assistant', content: reply });
          appendChatMessage('assistant', reply, { steps: chatState.chatSteps });
        }

        if (playlistContext) {
          chatState.didSendPlaylistContext = true;
          updateChatPlaylistHint();
        }
        advanceChatStepProgression(chatState.chatSteps);
      } catch (error) {
        console.error('Chat follow-up error', error);
        const fallback = t('We couldn’t chat with the model right now.');
        const message =
          typeof error?.message === 'string'
            ? t(error.message, {}, { fallback: error.message })
            : fallback;
  failChatStepProgression(message || fallback);
      }
    } catch (error) {
      console.error('Send liked songs error', error);
      chatState.messages.pop();
      wrapper.remove();
      setChatStatus(t(error.message || 'Failed to send liked songs'), 'error');
      updateLikedSongsButtonState();
    } finally {
      unblockChat();
    }
  });
}

renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
renderSongSuggestions();
updateChatPlaylistHint();
updateLikedSongsButtonState();
switchView("playlists");

function refreshDataIfUnloaded() {
  if (!modelsLoaded && !modelsLoading) {
    loadGeminiModels();
  }
  if (!playlistsLoaded && !playlistsLoading) {
    loadUserPlaylists();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshDataIfUnloaded();
  }
});

window.addEventListener("focus", () => {
  refreshDataIfUnloaded();
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    refreshDataIfUnloaded();
  }
});

initStatusStream();
loadGeminiModels();
loadUserPlaylists();
