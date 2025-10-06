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
const songTagList = document.getElementById("songTagList");
const chatCreatePlaylistButton = document.getElementById("chatCreatePlaylistButton");
const languageSwitcher = document.querySelector(".language-switcher");
const languageButtons = Array.from(document.querySelectorAll(".language-switcher__option"));
const htmlElement = document.documentElement;
const mixPlaylistSelect = document.getElementById("mixPlaylistSelect");
const mixPlaylistButton = document.getElementById("mixPlaylistButton");
const mixStatus = document.getElementById("mixStatus");
const mixResults = document.getElementById("mixResults");

document.body.classList.toggle("chat-expanded", chatView?.classList.contains("view--active"));

let mixProcessing = false;
const mixState = {
  lastPayload: null,
  statusKey: null,
  statusReplacements: {},
  statusFallback: "",
  statusType: "",
  pending: false,
};

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
        hint: "Chat with the model and capture tags",
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
      initialMessage:
        "Hey! Tell me the vibe, context, or inspiration you're exploring and I'll bring ideas, potential tags, and song examples.",
      form: {
        label: "Message for the model",
        placeholder: "e.g. I want a cozy playlist with indie game lo-fi",
        send: "Send",
        create: "Create playlist from chat",
        reset: "Reset chat & tags",
      },
      canvas: {
        title: "Curation canvas",
        subtitle: "Arrange tags and preview tracks while you chat.",
        tracksTitle: "Featured suggestions",
        tracksSubtitle: "Browse artwork, shuffle order, and listen without leaving the flow.",
        tracksEmpty: "Tracks suggested in the chat will appear here with a Spotify player.",
      },
      settings: {
        title: "Session controls",
        subtitle: "Tune how suggestions are generated and choose playlists to update.",
        likedTitle: "Send liked songs",
        likedDescription: "Auto-share liked tracks to give the model more context.",
        likedToggle: "Toggle sharing liked songs",
        discoveryTitle: "Discovery mode",
        discoveryDescription: "Favor fresh finds outside your library for broader inspiration.",
        discoveryToggle: "Toggle discovery mode",
        playlistTitle: "Select playlist to edit",
        playlistDescription: "Pick an existing playlist to refine with the new ideas.",
      },
      tags: {
        themeTitle: "Vibes & narratives",
        themeDescription: "Collect quick keywords for vibe, genre, or references.",
        emptyTheme: "No tags yet. Start chatting with the model!",
        songTitle: "Suggested songs",
        songDescription: "Quick examples to jump-start your playlist.",
        emptySong: "When suggestions arrive, they’ll show up here.",
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
      "We couldn’t chat with the model right now.": "We couldn’t chat with the model right now.",
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
        hint: "Converse com o modelo e capture tags",
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
        title: "Converse com o modelo",
        description:
          "Compartilhe o clima, referências ou histórias que quer transformar em música. O Gemini responde com ideias e tags opcionais para turbinar sua playlist.",
      },
      initialMessage:
        "Oi! Conte o clima, contexto ou inspiração que você quer explorar e eu trago ideias, tags e exemplos de músicas.",
      form: {
        label: "Mensagem para o modelo",
        placeholder: "ex.: Quero uma playlist aconchegante com lo-fi de jogos indie",
        send: "Enviar",
        create: "Criar playlist a partir do chat",
        reset: "Limpar chat e tags",
      },
      canvas: {
        title: "Canvas musical",
        subtitle: "Organize tags e visualize faixas enquanto conversa com o modelo.",
        tracksTitle: "Sugestões em destaque",
        tracksSubtitle: "Veja capas, reorganize ordens e ouça sem sair da conversa.",
        tracksEmpty: "As músicas sugeridas pelo chat aparecerão aqui com um player do Spotify.",
      },
      settings: {
        title: "Configurações da sessão",
        subtitle: "Ajuste como as sugestões são geradas e escolha playlists para atualizar.",
        likedTitle: "Enviar músicas curtidas",
        likedDescription: "Compartilhe automaticamente faixas curtidas para inspirar o modelo.",
        likedToggle: "Ativar envio de músicas curtidas",
        discoveryTitle: "Modo descobrimento",
        discoveryDescription: "Priorize novidades fora do seu histórico para ampliar referências.",
        discoveryToggle: "Ativar modo descobrimento",
        playlistTitle: "Selecionar playlist para editar",
        playlistDescription: "Escolha uma playlist existente para refinar com as novas sugestões.",
      },
      tags: {
        themeTitle: "Climas e narrativas",
        themeDescription: "Colete palavras-chave rápidas de clima, gênero ou referências.",
        emptyTheme: "Ainda não há tags. Comece a conversar com o modelo!",
        songTitle: "Músicas sugeridas",
        songDescription: "Exemplos rápidos para acelerar sua playlist.",
        emptySong: "Quando houver sugestões, elas aparecem aqui.",
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
      "Checking with Gemini…": "Consultando o Gemini…",
      "Sending…": "Enviando…",
      "Reply received!": "Resposta recebida!",
      "Conversation refreshed, no new tags this time.": "Conversa atualizada, sem novas tags desta vez.",
      "Tags updated!": "Tags atualizadas!",
      "We couldn’t chat with the model right now.": "Não foi possível conversar com o modelo agora.",
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

function getInitialAssistantMessage() {
  return t("chat.initialMessage");
}

const MAX_CHAT_HISTORY = 12;

let initialAssistantMessage = getInitialAssistantMessage();

const chatState = {
  messages: [{ role: "assistant", content: initialAssistantMessage }],
  themeTags: [],
  songTags: [],
  playlistContext: null,
  didSendPlaylistContext: false,
  initialAssistantMessage,
};

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

  document.body.classList.toggle("chat-expanded", target === "chat");
}

function appendChatMessage(role, content) {
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
  wrapper.append(avatar, bubble);
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

function populateChatPlaylistSelect(playlists) {
  if (!chatPlaylistSelect) return;

  const previousValue = chatPlaylistSelect.value;
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
    option.value = playlist.id;
    const trackCount = typeof playlist.trackCount === "number" ? playlist.trackCount : undefined;
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
    updateChatPlaylistHint();
  } catch (error) {
    console.error("Chat playlist details error", error);
    chatState.playlistContext = null;
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

  if (!value) {
    updateChatPlaylistHint();
    return;
  }

  loadChatPlaylistDetails(value);
}

function buildChatPlaylistPrompt() {
  const sections = [
    t(
      "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.",
      {},
      {
        fallback:
          "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.",
      }
    ),
  ];

  if (chatState.themeTags.length) {
    sections.push(
      t(
        "Focus tags: {tags}",
        { tags: chatState.themeTags.join(", ") },
        { fallback: `Focus tags: ${chatState.themeTags.join(", ")}` }
      )
    );
  }

  if (chatState.songTags.length) {
    sections.push(
      t(
        "Song references to echo or build around: {tags}",
        { tags: chatState.songTags.join(", ") },
        {
          fallback: `Song references to echo or build around: ${chatState.songTags.join(", ")}`,
        }
      )
    );
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
  } else if (group === "song") {
    chatState.songTags = chatState.songTags.filter((tag) => tag.trim().toLowerCase() !== normalized);
    renderTagGroup(songTagList, chatState.songTags, "song", "chat.tags.emptySong");
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
  chatState.songTags = [];
  chatState.didSendPlaylistContext = false;

  if (chatInput) {
    chatInput.value = "";
  }

  if (chatLog) {
    chatLog.innerHTML = "";
    appendChatMessage("assistant", initialAssistantMessage);
  }

  renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
  renderTagGroup(songTagList, chatState.songTags, "song", "chat.tags.emptySong");

  setChatStatus("", "");
  setChatCreationStatus("", "");
  updateChatPlaylistHint();
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

  const isFirstUserMessage = !chatState.messages.some((entry) => entry.role === "user");
  const playlistContext =
    isFirstUserMessage && chatState.playlistContext ? chatState.playlistContext : null;

  chatState.messages.push({ role: "user", content: message });
  appendChatMessage("user", message);
  chatInput.value = "";
  setChatStatus(t("Checking with Gemini…"), "");

  if (chatSendButton) {
    chatSendButton.disabled = true;
    chatSendButton.textContent = t("Sending…");
  }

  try {
    const recentMessages = chatState.messages.slice(-MAX_CHAT_HISTORY);
    const selectedModel = getSelectedModel();
    const payload = await requestChatResponse(recentMessages, selectedModel, {
      playlist: playlistContext || undefined,
    });
    const reply = typeof payload.reply === "string" ? payload.reply.trim() : "";

    if (reply) {
      chatState.messages.push({ role: "assistant", content: reply });
      appendChatMessage("assistant", reply);
    }

    if (playlistContext) {
      chatState.didSendPlaylistContext = true;
      updateChatPlaylistHint();
    }

    const incomingThemes = Array.isArray(payload.themeTags)
      ? payload.themeTags
      : Array.isArray(payload.tags)
      ? payload.tags
      : [];
    const incomingSongs = Array.isArray(payload.songExamples)
      ? payload.songExamples
      : Array.isArray(payload.songTags)
      ? payload.songTags
      : [];

    if (incomingThemes.length) {
      chatState.themeTags = mergeTags(chatState.themeTags, incomingThemes);
    }

    if (incomingSongs.length) {
      chatState.songTags = mergeTags(chatState.songTags, incomingSongs);
    }

  renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
  renderTagGroup(songTagList, chatState.songTags, "song", "chat.tags.emptySong");

    if (reply) {
      setChatStatus(t("Reply received!"), "success");
    } else if (!incomingThemes.length && !incomingSongs.length) {
      setChatStatus(t("Conversation refreshed, no new tags this time."), "");
    } else {
      setChatStatus(t("Tags updated!"), "success");
    }
  } catch (error) {
    console.error("Chat error", error);
    const fallback = t("We couldn’t chat with the model right now.");
    const message =
      typeof error?.message === "string"
        ? t(error.message, {}, { fallback: error.message })
        : fallback;
    setChatStatus(message || fallback, "error");
  } finally {
    if (chatSendButton) {
      chatSendButton.disabled = false;
      chatSendButton.textContent = t("chat.form.send");
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

  const hasConversation = chatState.messages.some((message) => message.role === "user");
  const hasTags = chatState.themeTags.length > 0 || chatState.songTags.length > 0;

  if (!hasConversation && !hasTags) {
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
songTagList?.addEventListener("click", handleTagListClick);
chatCreatePlaylistButton?.addEventListener("click", handleChatPlaylistCreation);
chatResetButton?.addEventListener("click", resetChat);
chatPlaylistSelect?.addEventListener("change", handleChatPlaylistSelectChange);
chatRefreshPlaylistsButton?.addEventListener("click", () =>
  loadUserPlaylists({ trigger: "manual", source: "chat" })
);

renderTagGroup(themeTagList, chatState.themeTags, "theme", "chat.tags.emptyTheme");
renderTagGroup(songTagList, chatState.songTags, "song", "chat.tags.emptySong");
updateChatPlaylistHint();
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
