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

const INITIAL_ASSISTANT_MESSAGE =
  "Hey! Tell me the vibe, context, or inspiration you're exploring and I'll bring ideas, potential tags, and song examples.";
const THEME_EMPTY_MESSAGE = "No tags yet. Start chatting with the model!";
const SONG_EMPTY_MESSAGE = "When suggestions arrive, they’ll show up here.";
const MAX_CHAT_HISTORY = 12;

const chatState = {
  messages: [{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }],
  themeTags: [],
  songTags: [],
  playlistContext: null,
  didSendPlaylistContext: false,
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

const loadingSequences = {
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
};

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
    span.textContent = "Waiting for tracks…";
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
  setLiveStatusLabel("Tuning Gemini's frequency…");
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
  const sequence = loadingSequences[type] || [];
  renderStatusSteps(sequence);
  clearStatusTimeouts();
  stopTickerReveal();
  startPlaceholderTicker();
  if (!sequence.length) {
    setLiveStatusLabel("Creating playlists…");
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
  setLiveStatusLabel(label || "Playlists ready!");

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
  setLiveStatusLabel(message || "Something went wrong");
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
  switchTickerMode("liked", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label: "Loading liked songs…",
  });
}

function handleLikedSong(event) {
  const data = parseEventData(event);
  const requestId = data.requestId || null;
  if (!isCurrentRequest("liked", requestId)) {
    if (!tickerState.requestId) {
      switchTickerMode("liked", {
        requestId,
        operation: data.operation || tickerState.operation,
        label: "Loading liked songs…",
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

  setLiveStatusLabel(
    typeof total === "number"
      ? `Liked songs loaded (${total})`
      : "Liked songs loaded"
  );

  if (currentTickerSongs.length) {
    setTickerSongs(currentTickerSongs, { animate: true, allowPlaceholder: false });
  } else {
    setTickerSongs([], { animate: false, allowPlaceholder: true });
  }
}

function handleGenreStart(event) {
  const data = parseEventData(event);
  switchTickerMode("genre", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label: data.label || "Organizing by genre…",
    allowPlaceholder: true,
  });

  if (genreStatus) {
    const totalSongs =
      typeof data.totalSongs === "number" && Number.isFinite(data.totalSongs)
        ? data.totalSongs
        : undefined;
    const totalArtists =
      typeof data.totalArtists === "number" && Number.isFinite(data.totalArtists)
        ? data.totalArtists
        : undefined;

    const songText = totalSongs
      ? `${totalSongs} ${totalSongs === 1 ? "liked song" : "liked songs"}`
      : "Your liked songs";
    const artistText =
      typeof totalArtists === "number" && totalArtists > 0
        ? ` from ${totalArtists} ${totalArtists === 1 ? "artist" : "artists"}`
        : "";

    showStatus(genreStatus, `Grouping ${songText}${artistText}…`, "");
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
    setLiveStatusLabel(`Collecting genres (${processed}/${total} artists)`);
  } else if (stage === "grouping" && processed !== undefined && total !== undefined) {
    setLiveStatusLabel(`Building playlists (${processed}/${total} songs)`);
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
  completeLiveStatus(songs, {
    requestId: data.requestId || null,
    label: data.label || "Genre playlists ready!",
  });

  if (genreStatus && typeof data.totalPlaylists === "number") {
    const totalSongs = typeof data.totalSongs === "number" ? data.totalSongs : undefined;
    const summaryText = totalSongs
      ? `Done! ${data.totalPlaylists} genre playlists with ${totalSongs} songs.`
      : `Done! ${data.totalPlaylists} genre playlists.`;
    showStatus(genreStatus, summaryText, "success");
  }
}

function handleGeminiStart(event) {
  const data = parseEventData(event);
  switchTickerMode("gemini", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label: data.label || "Gemini is suggesting tracks…",
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
    setLiveStatusLabel(`Gemini is curating “${data.playlist}”`);
  }
}

function handleGeminiComplete(event) {
  const data = parseEventData(event);
  if (!isCurrentRequest("gemini", data.requestId || null)) {
    return;
  }
  const songs = Array.isArray(data.songs) ? data.songs : undefined;
  completeLiveStatus(songs, {
    requestId: data.requestId || null,
    label: data.label,
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
    setLiveStatusLabel(data.message);
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
    showStatus(modelStatus, "Select a Gemini model to start generating.", "error");
    return;
  }

  const inputLimit = formatTokenLimit(model.inputTokenLimit);
  const outputLimit = formatTokenLimit(model.outputTokenLimit);
  const limitText =
    inputLimit && outputLimit
      ? `Tokens in/out: ${inputLimit} / ${outputLimit}`
      : inputLimit
      ? `Input tokens: ${inputLimit}`
      : outputLimit
      ? `Output tokens: ${outputLimit}`
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
  showStatus(modelStatus, "Loading available Gemini models…", "");
  modelSelect.innerHTML = '<option value="">Loading…</option>';

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
    modelSelect.innerHTML = '<option value="">Unavailable</option>';
    modelSelect.disabled = true;
    showStatus(modelStatus, error.message || "Could not load Gemini models", "error");
  } finally {
    modelsLoading = false;
  }
}

const createLoader = (label = "Loading playlists") => {
  const loader = document.createElement("div");
  loader.className = "loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.innerHTML = `
    <span class="loader__orb"></span>
    <span class="loader__text">${label}</span>
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
    setPlaylistSelectStatus("Paste a link or choose a playlist (optional)", "");
    return;
  }

  const option = findPlaylistOption(trimmed);
  if (option) {
    const label = option.dataset?.name || option.textContent || "your playlist";
    setPlaylistSelectStatus(`We’ll enhance “${label}”`, "success");
  } else {
    setPlaylistSelectStatus(
      "Using a custom link/ID. Make sure the playlist is yours or collaborative.",
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

  if (target === "chat" && chatInput) {
    setTimeout(() => chatInput.focus(), 160);
  }
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
  sender.textContent = role === "assistant" ? "Geminify" : "You";

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

function renderTagGroup(container, tags, group, emptyMessage) {
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(tags) || tags.length === 0) {
    container.dataset.empty = "true";
    const empty = document.createElement("p");
    empty.className = "tag-empty";
    empty.textContent = emptyMessage;
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
  button.setAttribute("aria-label", `Remove tag ${trimmed}`);

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
    ? "Select a playlist to enhance (optional)"
    : "No playlists found";
  chatPlaylistSelect.append(placeholder);

  if (!playlists.length) {
    chatPlaylistSelect.disabled = true;
    chatPlaylistSelect.value = "";
    setChatPlaylistHint("We couldn't find playlists in your account yet.", "");
    return;
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
      `Enhancing “${name}” with ${count} ${count === 1 ? "song" : "songs"} loaded.`,
      "success"
    );
  } else {
    setChatPlaylistHint(`Select “${name}” to load songs for enhancement.`, "");
  }
}

async function loadChatPlaylistDetails(playlistId) {
  if (!playlistId) return;

  chatPlaylistLoading = true;
  const selectedOption = chatPlaylistSelect?.options[chatPlaylistSelect.selectedIndex];
  const name = selectedOption?.dataset?.name || selectedOption?.textContent || "playlist";
  setChatPlaylistHint(`Loading songs from “${name}”…`, "");

  try {
    const response = await fetch(`/playlist-details?id=${encodeURIComponent(playlistId)}`);
    if (response.status === 401) {
      throw Object.assign(new Error("Log in with Spotify to load this playlist."), { status: 401 });
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
    const message = error?.message || "Couldn't load playlist songs.";
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
    "Create a cohesive Spotify playlist that reflects this brainstorming session. Capture mood, pacing, and storytelling across 20-25 tracks.",
  ];

  if (chatState.themeTags.length) {
    sections.push(`Focus tags: ${chatState.themeTags.join(", ")}`);
  }

  if (chatState.songTags.length) {
    sections.push(`Song references to echo or build around: ${chatState.songTags.join(", ")}`);
  }

  if (chatState.playlistContext) {
    const { name, description, songs } = chatState.playlistContext;
    const count = Array.isArray(songs) ? songs.length : 0;
    const header = `Existing playlist to enhance: “${name}”${count ? ` (${count} ${count === 1 ? "song" : "songs"})` : ""}.`;
    const details = [];
    if (description) {
      details.push(`Description: ${description}`);
    }

    if (count) {
      const highlights = songs
        .slice(0, 25)
        .map((song) => `- ${song.title} — ${song.artist}`)
        .join("\n");
      if (highlights) {
        details.push(`Current track highlights:\n${highlights}`);
      }
    }

    sections.push([header, ...details].join("\n"));
  }

  const recentMessages = chatState.messages.slice(-MAX_CHAT_HISTORY);
  const conversation = recentMessages
    .filter((message, index) => {
      if (index === 0 && message.role === "assistant" && message.content === INITIAL_ASSISTANT_MESSAGE) {
        return false;
      }
      return true;
    })
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");

  if (conversation) {
    sections.push(`Conversation notes:\n${conversation}`);
  }

  return sections.join("\n\n");
}

function removeTag(group, value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return;

  if (group === "theme") {
    chatState.themeTags = chatState.themeTags.filter((tag) => tag.trim().toLowerCase() !== normalized);
    renderTagGroup(themeTagList, chatState.themeTags, "theme", THEME_EMPTY_MESSAGE);
  } else if (group === "song") {
    chatState.songTags = chatState.songTags.filter((tag) => tag.trim().toLowerCase() !== normalized);
    renderTagGroup(songTagList, chatState.songTags, "song", SONG_EMPTY_MESSAGE);
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
  chatState.messages = [{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }];
  chatState.themeTags = [];
  chatState.songTags = [];
  chatState.didSendPlaylistContext = false;

  if (chatInput) {
    chatInput.value = "";
  }

  if (chatLog) {
    chatLog.innerHTML = "";
    appendChatMessage("assistant", INITIAL_ASSISTANT_MESSAGE);
  }

  renderTagGroup(themeTagList, chatState.themeTags, "theme", THEME_EMPTY_MESSAGE);
  renderTagGroup(songTagList, chatState.songTags, "song", SONG_EMPTY_MESSAGE);

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
    setChatStatus("Write a message before sending.", "error");
    return;
  }

  if (chatPlaylistLoading) {
    setChatStatus("Hold on a moment—still loading playlist details.", "error");
    return;
  }

  const isFirstUserMessage = !chatState.messages.some((entry) => entry.role === "user");
  const playlistContext =
    isFirstUserMessage && chatState.playlistContext ? chatState.playlistContext : null;

  chatState.messages.push({ role: "user", content: message });
  appendChatMessage("user", message);
  chatInput.value = "";
  setChatStatus("Checking with Gemini…", "");

  if (chatSendButton) {
    chatSendButton.disabled = true;
    chatSendButton.textContent = "Sending…";
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

    renderTagGroup(themeTagList, chatState.themeTags, "theme", THEME_EMPTY_MESSAGE);
    renderTagGroup(songTagList, chatState.songTags, "song", SONG_EMPTY_MESSAGE);

    if (reply) {
      setChatStatus("Reply received!", "success");
    } else if (!incomingThemes.length && !incomingSongs.length) {
      setChatStatus("Conversation refreshed, no new tags this time.", "");
    } else {
      setChatStatus("Tags updated!", "success");
    }
  } catch (error) {
    console.error("Chat error", error);
    setChatStatus(error.message || "We couldn’t chat with the model right now.", "error");
  } finally {
    if (chatSendButton) {
      chatSendButton.disabled = false;
      chatSendButton.textContent = "Send";
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
      "Chat with Gemini or capture some tags before creating a playlist.",
      "error"
    );
    return;
  }

  const prompt = buildChatPlaylistPrompt();
  if (!prompt.trim()) {
    setChatCreationStatus(
      "We need more chat context or tags to craft a playlist.",
      "error"
    );
    return;
  }

  const originalLabel = (chatCreatePlaylistButton.textContent || "").trim() || "Create playlist from chat";
  chatCreatePlaylistButton.disabled = true;
  chatCreatePlaylistButton.textContent = "Creating...";
  setChatCreationStatus("Creating a playlist from your chat notes...", "");

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
      "Playlist created from your chat! Opening the playlists view...",
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
      label: playlist.upgraded ? "Playlist refreshed!" : "Custom playlist ready!",
    });

    switchView("playlists");
  } catch (error) {
    console.error("Chat playlist creation error", error);
    const message =
      error?.status === 401
        ? "Log in with Spotify to create playlists."
        : error?.message || "Couldn't create a playlist from chat.";
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
  playlistSelect.innerHTML = '<option value="">Loading…</option>';
  setPlaylistSelectStatus("Loading your playlists…", "");

  if (chatPlaylistSelect) {
    chatPlaylistSelect.disabled = true;
    chatPlaylistSelect.innerHTML = '<option value="">Loading…</option>';
  }
  setChatPlaylistHint("Loading your playlists…", "");

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
      playlistSelect.innerHTML =
        '<option value="">Sign in to load your playlists</option>';
      const message =
        response.status === 403
          ? "We need new permissions to list your playlists. Click ‘Log in with Spotify’."
          : "Sign in with Spotify to choose an existing playlist.";
      setPlaylistSelectStatus(message, "error");
      playlistSelect.disabled = true;
      loginButton?.focus();
      playlistsLoaded = false;
      if (chatPlaylistSelect) {
        chatPlaylistSelect.innerHTML = '<option value="">Sign in to load playlists</option>';
        chatPlaylistSelect.disabled = true;
      }
      setChatPlaylistHint("Sign in with Spotify to enhance an existing playlist.", "error");
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
      option.textContent = "No playlists found";
      option.selected = true;
      playlistSelect.append(option);
      setPlaylistSelectStatus("We couldn't find playlists in your account yet.", "");
      playlistSelect.disabled = true;
      if (chatPlaylistSelect) {
        chatPlaylistSelect.innerHTML = '<option value="">No playlists found</option>';
        chatPlaylistSelect.disabled = true;
      }
      setChatPlaylistHint("We couldn't find playlists in your account yet.", "");
      playlistsLoaded = true;
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a playlist (optional)";
    placeholder.selected = true;
    playlistSelect.append(placeholder);

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
    });

    playlistSelect.disabled = false;
    syncPlaylistSelectionFromCurrentValue();
    populateChatPlaylistSelect(playlists);
    if (triggeredByFormButton) {
      if (!targetPlaylistInput || !targetPlaylistInput.value.trim()) {
        setPlaylistSelectStatus(
          "Playlists refreshed! Pick one to enhance.",
          "success"
        );
      }
    } else if (triggeredByChatButton) {
      setChatPlaylistHint("Playlists refreshed! Pick one to enhance.", "success");
    } else if (!targetPlaylistInput || !targetPlaylistInput.value.trim()) {
      setPlaylistSelectStatus(
        "Pick a playlist to enhance or paste a link below.",
        ""
      );
    }
    playlistsLoaded = true;
  } catch (error) {
    const message = error?.message || "Couldn't load your playlists.";
    playlistSelect.innerHTML = '<option value="">Load again</option>';
    setPlaylistSelectStatus(message, "error");
    playlistSelect.disabled = true;
    if (chatPlaylistSelect) {
      chatPlaylistSelect.innerHTML = '<option value="">Load again</option>';
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
    card.innerHTML = `
      <div>
        <h3>${playlist.name}</h3>
        <p>${playlist.description}</p>
      </div>
      <iframe
        src="${playlist.embedUrl}"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title="Playlist preview for ${playlist.name}"
      ></iframe>
      <a class="open-link" href="${playlist.spotifyUrl}" target="_blank" rel="noopener noreferrer">
        Open in Spotify
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
  card.innerHTML = `
    <div>
      <h3>${playlist.name}</h3>
      <p>${playlist.description}</p>
    </div>
    <iframe
      src="${playlist.embedUrl}"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      title="Playlist preview for ${playlist.name}"
    ></iframe>
    <a class="open-link" href="${playlist.spotifyUrl}" target="_blank" rel="noopener noreferrer">
      Open in Spotify
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
    empty.textContent = "No liked songs to group just yet.";
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
  title.textContent = playlist?.name || playlist?.genre || "Genre playlist";

    const countLabel = document.createElement("span");
    countLabel.className = "genre-card__count";
    const count = typeof playlist?.count === "number" ? playlist.count : playlist?.songs?.length || 0;
  countLabel.textContent = `${count} ${count === 1 ? "song" : "songs"}`;

    header.append(title, countLabel);

    const description = document.createElement("p");
    description.className = "genre-card__description";
  description.textContent = playlist?.description || "Collection built from your liked songs.";

    const details = document.createElement("details");
    if (index === 0) {
      details.open = true;
    }

  const summary = document.createElement("summary");
  summary.textContent = `View songs (${count})`;

    const list = document.createElement("ul");
    list.className = "genre-card__list";

    const songs = Array.isArray(playlist?.songs) ? playlist.songs : [];
    const renderLimit = 150;
    songs.slice(0, renderLimit).forEach((song, songIndex) => {
      if (!song) return;
      const li = document.createElement("li");
  const titleText = song?.title || song?.name || `Track ${songIndex + 1}`;
  const artistText = song?.artist || song?.artistName || "Unknown artist";
      li.textContent = `${titleText} — ${artistText}`;
      list.append(li);
    });

    if (songs.length > renderLimit) {
      const more = document.createElement("li");
  more.className = "genre-card__list-more";
  more.textContent = `… and ${songs.length - renderLimit} more songs`;
      list.append(more);
    }

    details.append(summary, list);

    card.append(header, description, details);
    genreResults.append(card);
  });
}

async function handlePreviewGeneration() {
  if (!previewButton) return;
  previewButton.disabled = true;
  previewButton.textContent = "Generating...";
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
    const status = error.status === 401 ? "Spotify login required" : error.detail || error.message;
    showStatus(formStatus, status, "error");
    resultsContainer.innerHTML = "";
  failLiveStatus(typeof status === "string" ? status : "Generation failed");
  } finally {
    previewButton.disabled = false;
    previewButton.textContent = "Generate Random Playlists";
  }
}

async function handleCustomSubmit(event) {
  event.preventDefault();
  const promptValue = customPrompt.value.trim();
  const manualTarget = targetPlaylistInput ? targetPlaylistInput.value.trim() : "";
  const selectedTarget = playlistSelect ? playlistSelect.value.trim() : "";
  const playlistTarget = manualTarget || selectedTarget;

  if (!promptValue) {
    showStatus(formStatus, "Please describe the playlist vibe first.", "error");
    return;
  }

  showStatus(formStatus, "Spinning up your mix...", "");
  resetLiveStatus();
  startLiveStatus(playlistTarget ? "customUpgrade" : "custom");

  const submitButton = customForm.querySelector("button[type=submit]");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Creating...";
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
          ? "Playlist updated with fresh tracks on Spotify!"
          : "Custom playlist created and added to Spotify!",
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
    const message = error.status === 401 ? "Please log in with Spotify to continue." : error.message;
    showStatus(formStatus, message, "error");
    failLiveStatus(message);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Create Custom Playlist";
    }
  }
}

async function handleGenreGrouping() {
  if (!groupGenresButton) return;
  const originalLabel = groupGenresButton.textContent;
  groupGenresButton.disabled = true;
  groupGenresButton.textContent = "Organizing...";

  if (genreStatus) {
    showStatus(genreStatus, "Grouping your liked songs...", "");
  }

  resetLiveStatus();
  startLiveStatus("genre");
  switchTickerMode("genre", {
    requestId: null,
    operation: "genre",
    label: "Organizing by genre…",
    allowPlaceholder: true,
  });

  if (genreResults) {
    const loader = createLoader("Organizing by genre");
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
        `Done! ${totalPlaylists} genre playlists with ${totalSongs} songs.`,
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
      label: "Genre playlists ready!",
    });
  } catch (error) {
    const message =
      error?.status === 401
        ? "Sign in with Spotify to continue."
        : error?.message || "Couldn't group songs by genre.";
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

renderTagGroup(themeTagList, chatState.themeTags, "theme", THEME_EMPTY_MESSAGE);
renderTagGroup(songTagList, chatState.songTags, "song", SONG_EMPTY_MESSAGE);
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
