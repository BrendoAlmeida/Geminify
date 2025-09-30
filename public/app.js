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
const resultsContainer = document.getElementById("results");
const customForm = document.getElementById("customForm");
const customPrompt = document.getElementById("customPrompt");
const targetPlaylistInput = document.getElementById("targetPlaylist");
const playlistSelect = document.getElementById("playlistSelect");
const playlistSelectStatus = document.getElementById("playlistSelectStatus");
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

const MODEL_STORAGE_KEY = "claudify:selectedGeminiModel";
let availableModels = [];
let statusTimeouts = [];
let tickerRevealInterval = null;
let currentTickerSongs = [];
let statusSource = null;
let statusReconnectTimer = null;

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
    "Carregando músicas curtidas",
    "Coletando gêneros dos artistas",
    "Montando playlists por estilo",
    "Pronto para ouvir",
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
  setLiveStatusLabel(label || "Playlists prontas!");

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
  setLiveStatusLabel(message || "Algo deu errado");
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
    label: "Carregando músicas curtidas…",
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
        label: "Carregando músicas curtidas…",
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

  if (typeof data.total === "number" && Number.isFinite(data.total)) {
    setLiveStatusLabel(`Músicas curtidas carregadas (${data.total})`);
  } else {
    setLiveStatusLabel("Músicas curtidas carregadas");
  }

  if (currentTickerSongs.length) {
    setTickerSongs(currentTickerSongs, { animate: true, allowPlaceholder: false });
  }
}

function handleGenreStart(event) {
  const data = parseEventData(event);
  switchTickerMode("genre", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label: data.label || "Organizando por gênero…",
    allowPlaceholder: true,
  });

  if (typeof data.totalSongs === "number" && Number.isFinite(data.totalSongs)) {
    setLiveStatusLabel(`Analisando ${data.totalSongs} músicas curtidas…`);
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
    setLiveStatusLabel(`Coletando gêneros (${processed}/${total} artistas)`);
  } else if (stage === "grouping" && processed !== undefined && total !== undefined) {
    setLiveStatusLabel(`Montando playlists (${processed}/${total} músicas)`);
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
    label: data.label || "Playlists por gênero prontas!",
  });

  if (genreStatus && typeof data.totalPlaylists === "number") {
    const totalSongs = typeof data.totalSongs === "number" ? data.totalSongs : undefined;
    const summaryText = totalSongs
      ? `Pronto! ${data.totalPlaylists} playlists por gênero com ${totalSongs} músicas.`
      : `Pronto! ${data.totalPlaylists} playlists por gênero.`;
    showStatus(genreStatus, summaryText, "success");
  }
}

function handleGeminiStart(event) {
  const data = parseEventData(event);
  switchTickerMode("gemini", {
    requestId: data.requestId || null,
    operation: data.operation || tickerState.operation,
    label: data.label || "Gemini sugerindo faixas…",
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
    setLiveStatusLabel(`Gemini sugerindo “${data.playlist}”`);
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
  } catch (error) {
    modelSelect.innerHTML = '<option value="">Unavailable</option>';
    modelSelect.disabled = true;
    showStatus(modelStatus, error.message || "Could not load Gemini models", "error");
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
  element.textContent = message;
  element.classList.remove("status--error", "status--success");
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
    setPlaylistSelectStatus("Cole um link ou selecione uma playlist (opcional)", "");
    return;
  }

  const option = findPlaylistOption(trimmed);
  if (option) {
    const label = option.dataset?.name || option.textContent || "sua playlist";
    setPlaylistSelectStatus(`Vamos turbinar “${label}”`, "success");
  } else {
    setPlaylistSelectStatus(
      "Usando link/ID personalizado. Certifique-se de que a playlist é sua ou colaborativa.",
      ""
    );
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

async function loadUserPlaylists() {
  if (!playlistSelect) return;

  playlistSelect.disabled = true;
  playlistSelect.innerHTML = '<option value="">Carregando…</option>';
  setPlaylistSelectStatus("Carregando suas playlists…", "");

  try {
    const response = await fetch("/user-playlists");
    if (response.status === 401) {
      playlistSelect.innerHTML = '<option value="">Faça login para carregar suas playlists</option>';
      setPlaylistSelectStatus(
        "Entre com o Spotify para selecionar uma playlist existente.",
        "error"
      );
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Não foi possível carregar suas playlists.");
    }

    const data = await response.json();
    const playlists = Array.isArray(data?.playlists) ? data.playlists : [];

    playlistSelect.innerHTML = "";

    if (!playlists.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Nenhuma playlist encontrada";
      option.selected = true;
      playlistSelect.append(option);
      setPlaylistSelectStatus("Não encontramos playlists na sua conta ainda.", "");
      playlistSelect.disabled = true;
      return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecionar playlist (opcional)";
    placeholder.selected = true;
    playlistSelect.append(placeholder);

    playlists.slice(0, 200).forEach((playlist) => {
      if (!playlist?.id || !playlist?.name) return;
      const option = document.createElement("option");
      option.value = playlist.id;
      const trackCount = typeof playlist.trackCount === "number" ? playlist.trackCount : undefined;
      option.textContent = trackCount
        ? `${playlist.name} (${trackCount} ${trackCount === 1 ? "música" : "músicas"})`
        : playlist.name;
      option.dataset.name = playlist.name;
      playlistSelect.append(option);
    });

    playlistSelect.disabled = false;
    syncPlaylistSelectionFromCurrentValue();
    if (!targetPlaylistInput || !targetPlaylistInput.value.trim()) {
      setPlaylistSelectStatus("Selecione uma playlist para aprimorar ou cole um link abaixo.", "");
    }
  } catch (error) {
    const message = error?.message || "Não foi possível carregar suas playlists.";
    playlistSelect.innerHTML = '<option value="">Carregar novamente</option>';
    setPlaylistSelectStatus(message, "error");
    playlistSelect.disabled = true;
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
    empty.textContent = "Nenhuma música curtida para agrupar ainda.";
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
    title.textContent = playlist?.name || playlist?.genre || "Playlist por gênero";

    const countLabel = document.createElement("span");
    countLabel.className = "genre-card__count";
    const count = typeof playlist?.count === "number" ? playlist.count : playlist?.songs?.length || 0;
    countLabel.textContent = `${count} ${count === 1 ? "música" : "músicas"}`;

    header.append(title, countLabel);

    const description = document.createElement("p");
    description.className = "genre-card__description";
    description.textContent = playlist?.description || "Coleção criada a partir das suas músicas curtidas.";

    const details = document.createElement("details");
    if (index === 0) {
      details.open = true;
    }

    const summary = document.createElement("summary");
    summary.textContent = `Ver músicas (${count})`;

    const list = document.createElement("ul");
    list.className = "genre-card__list";

    const songs = Array.isArray(playlist?.songs) ? playlist.songs : [];
    const renderLimit = 150;
    songs.slice(0, renderLimit).forEach((song, songIndex) => {
      if (!song) return;
      const li = document.createElement("li");
      const titleText = song?.title || song?.name || `Faixa ${songIndex + 1}`;
      const artistText = song?.artist || song?.artistName || "Artista desconhecido";
      li.textContent = `${titleText} — ${artistText}`;
      list.append(li);
    });

    if (songs.length > renderLimit) {
      const more = document.createElement("li");
      more.className = "genre-card__list-more";
      more.textContent = `… e mais ${songs.length - renderLimit} músicas`;
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
    failLiveStatus(typeof status === "string" ? status : "Falha na geração");
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
  groupGenresButton.textContent = "Organizando...";

  if (genreStatus) {
    showStatus(genreStatus, "Agrupando suas músicas curtidas...", "");
  }

  resetLiveStatus();
  startLiveStatus("genre");
  switchTickerMode("genre", {
    requestId: null,
    operation: "genre",
    label: "Organizando por gênero…",
    allowPlaceholder: true,
  });

  if (genreResults) {
    const loader = createLoader("Organizando por gênero");
    genreResults.innerHTML = "";
    genreResults.append(loader);
  }

  try {
    const response = await fetch("/genre-playlists");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw Object.assign(
        new Error(payload?.error || "Não foi possível agrupar por gênero."),
        { status: response.status }
      );
    }

    const data = await response.json();
    const playlists = Array.isArray(data?.playlists) ? data.playlists : [];
    renderGenrePlaylists(playlists);

    const totalPlaylists = typeof data?.summary?.totalPlaylists === "number"
      ? data.summary.totalPlaylists
      : playlists.length;
    const totalSongs = typeof data?.summary?.totalSongs === "number"
      ? data.summary.totalSongs
      : playlists.reduce((sum, playlist) => sum + (playlist?.songs?.length || 0), 0);

    if (genreStatus) {
      showStatus(
        genreStatus,
        `Pronto! ${totalPlaylists} playlists por gênero com ${totalSongs} músicas.`,
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
      label: "Playlists por gênero prontas!",
    });
  } catch (error) {
    const message =
      error?.status === 401
        ? "Entre com o Spotify para continuar."
        : error?.message || "Não foi possível agrupar por gênero.";
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

initStatusStream();
loadGeminiModels();
loadUserPlaylists();
