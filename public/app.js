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
const formStatus = document.getElementById("formStatus");
const modelSelect = document.getElementById("modelSelect");
const modelStatus = document.getElementById("modelStatus");
const refreshModelsButton = document.getElementById("refreshModels");

const MODEL_STORAGE_KEY = "claudify:selectedGeminiModel";
let availableModels = [];

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

async function handlePreviewGeneration() {
  if (!previewButton) return;
  previewButton.disabled = true;
  previewButton.textContent = "Generating...";
  const loader = createLoader();
  resultsContainer.innerHTML = "";
  resultsContainer.append(loader);

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
  } catch (error) {
    const status = error.status === 401 ? "Spotify login required" : error.detail || error.message;
    showStatus(formStatus, status, "error");
    resultsContainer.innerHTML = "";
  } finally {
    previewButton.disabled = false;
    previewButton.textContent = "Generate Random Playlists";
  }
}

async function handleCustomSubmit(event) {
  event.preventDefault();
  if (!customPrompt.value.trim()) {
    showStatus(formStatus, "Please describe the playlist vibe first.", "error");
    return;
  }

  showStatus(formStatus, "Spinning up your mix...", "");

  const submitButton = customForm.querySelector("button[type=submit]");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Creating...";
  }

  try {
    const selectedModel = getSelectedModel();
    const payload = { prompt: customPrompt.value };
    if (selectedModel) {
      payload.model = selectedModel;
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
      showStatus(formStatus, "Custom playlist created and added to Spotify!", "success");
      customForm.reset();
    }
  } catch (error) {
    const message = error.status === 401 ? "Please log in with Spotify to continue." : error.message;
    showStatus(formStatus, message, "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Create Custom Playlist";
    }
  }
}

previewButton?.addEventListener("click", handlePreviewGeneration);
customForm?.addEventListener("submit", handleCustomSubmit);
refreshModelsButton?.addEventListener("click", () => loadGeminiModels());
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

loadGeminiModels();
