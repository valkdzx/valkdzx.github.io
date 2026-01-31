const API_URL = "https://simpledownloader.giize.com/api";
const WS_URL   = "wss://simpledownloader.giize.com/api/ws/download";

let sessionToken = null;
let isDownloading = false;
let videoData = null;
let currentWs = null;

const videoUrlInput = document.getElementById("videoUrl");
const loadingSection = document.getElementById("loadingSection");
const downloadProgress = document.getElementById("downloadProgress");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");
const errorDiv = document.getElementById("error");
const videoPreview = document.getElementById("videoPreview");
const thumbnail = document.getElementById("thumbnail");
const videoTitle = document.getElementById("videoTitle");
const videoAuthor = document.getElementById("videoAuthor");
const resolutionOptions = document.getElementById("resolutionOptions");
const bitrateOptions = document.getElementById("bitrateOptions");
const formatOptions = document.getElementById("formatOptions");
const resolutionGroup = document.getElementById("resolutionGroup");
const downloadBtn = document.getElementById("downloadBtn");
const searchBtn = document.getElementById("searchBtn");
const searchBtnText = searchBtn.querySelector("span");
const filesizeText = document.getElementById("filesizeText");
const speedText = document.getElementById("speedText");
const etaText = document.getElementById("etaText");

searchBtn.disabled = true;
searchBtnText.textContent = "Загрузка...";

async function initSession() {
  try {
    const res = await fetch(`${API_URL}/get-session-token`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    sessionToken = data.token;
    searchBtn.disabled = false;
    searchBtnText.textContent = "Поиск";
  } catch (err) {
    showError("Ошибка инициализации: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", initSession);

async function searchVideo() {
  if (!sessionToken) return showError("Сессия не инициализирована");

  const url = videoUrlInput.value.trim();
  if (!url) return showError("Введите ссылку");

  showLoading(true);
  clearError();
  videoPreview.classList.add("hidden");
  downloadBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/info?url=${encodeURIComponent(url)}&token=${sessionToken}`);
    if (!res.ok) throw new Error(await res.text());

    videoData = await res.json();

    thumbnail.src = videoData.thumbnail || "";
    videoTitle.textContent = videoData.title || "Без названия";
    videoAuthor.textContent = videoData.uploader || "Неизвестно";

    setFormat("mp4");

    resolutionOptions.innerHTML = "";
    if (videoData.formats && videoData.formats.length > 0) {
      const videoFormats = videoData.formats
        .filter(f => f.ext === "mp4" && f.height)
        .sort((a, b) => b.height - a.height);

      videoFormats.forEach((f, i) => {
        const btn = document.createElement("button");
        btn.className = "option-btn resolution-btn" + (i === 0 ? " active" : "");
        btn.dataset.formatId = f.format_id;
        btn.textContent = `${f.height}p`;
        if (f.filesize) btn.textContent += ` (${(f.filesize / 1024 / 1024).toFixed(1)} MB)`;
        resolutionOptions.appendChild(btn);
      });
    }

    bitrateOptions.parentElement.classList.add("hidden");

    videoPreview.classList.remove("hidden");
    downloadBtn.disabled = false;
  } catch (err) {
    showError("Ошибка: " + err.message);
  } finally {
    showLoading(false);
  }
}

function setFormat(format) {
  formatOptions.querySelectorAll(".format-btn").forEach(b => b.classList.remove("active"));
  formatOptions.querySelector(`[data-format="${format}"]`).classList.add("active");

  if (format === "mp3") {
    resolutionGroup.classList.add("hidden");
  } else {
    resolutionGroup.classList.remove("hidden");
  }
}

formatOptions.addEventListener("click", (e) => {
  if (e.target.classList.contains("format-btn")) {
    setFormat(e.target.dataset.format);
  }
});

resolutionOptions.addEventListener("click", (e) => {
  if (e.target.classList.contains("resolution-btn")) {
    resolutionOptions.querySelectorAll(".resolution-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
  }
});

function lockUI(lock) {
  isDownloading = lock;

  downloadBtn.disabled = lock;
  videoUrlInput.disabled = lock;

  formatOptions
    .querySelectorAll("button")
    .forEach(b => b.disabled = lock);

  resolutionOptions
    .querySelectorAll("button")
    .forEach(b => b.disabled = lock);
}

function startDownload() {
  if (isDownloading) return;
  if (!videoData || !sessionToken) return;

  lockUI(true);
  showDownloadProgress(true);

  const format = formatOptions.querySelector(".format-btn.active").dataset.format;
  let format_id = null;
  if (format === "mp4") {
    const activeQuality = resolutionOptions.querySelector(".resolution-btn.active");
    if (activeQuality) format_id = activeQuality.dataset.formatId;
  }

  let attempts = 0;
  const maxAttempts = 3;

  function connectWebSocket() {
    attempts++;
    progressText.textContent = `Соединение с сервером... (попытка ${attempts}/${maxAttempts})`;
    
    currentWs = new WebSocket(`${WS_URL}?token=${sessionToken}`);

    currentWs.onopen = () => {
      progressText.textContent = "Соединение установлено, начало скачивания...";
      currentWs.send(JSON.stringify({
        url: videoUrlInput.value.trim(),
        format,
        format_id,
      }));
    };

    currentWs.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "progress") {
        progressFill.style.width = msg.percent + "%";
        progressPercent.textContent = Math.round(msg.percent) + "%";

        if (msg.filesize) {
            filesizeText.textContent = `Размер: ${msg.filesize.toFixed(2)} MB`;
        }

        if (msg.speed) {
            speedText.textContent = `Скорость: ${msg.speed.toFixed(2)} MB/s`;
        }

        if (msg.eta) {
            let minutes = Math.floor(msg.eta / 60);
            let seconds = msg.eta % 60;
            etaText.textContent = `Осталось: ${minutes}:${seconds.toString().padStart(2,'0')}`;
        }
        progressText.textContent = "Скачивание...";
      } else if (msg.type === "ready") {
        progressText.textContent = "Начало скачивания...";
        const downloadUrl = `${API_URL}/download/${encodeURIComponent(msg.filename)}?token=${sessionToken}`;

        const link = document.createElement("a");
        link.href = downloadUrl;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        
        let countdown = 3;
        const interval = setInterval(() => {
            progressText.textContent = `Загрузка запущена. Переход на главную страницу через ${countdown}...`;
            countdown--;
            if (countdown < 0) {
                clearInterval(interval);
                document.body.removeChild(link);
                location.reload();
            }
        }, 1000);
      } else if (msg.type === "error") {
        showError(msg.message);
        showDownloadProgress(false);
        lockUI(false);
      }
    };

    currentWs.onerror = currentWs.onclose = () => {
      if (attempts < maxAttempts) {
        progressText.textContent = `Ошибка соединения, повторная попытка через 1с...`;
        setTimeout(connectWebSocket, 1000);
      } else {
        showError("Не удалось подключиться к серверу. Попробуйте позже.");
        showDownloadProgress(false);
        lockUI(false);
      }
    };
  }

  connectWebSocket();
}

function showLoading(show) {
  loadingSection.classList.toggle("hidden", !show);
}

function showDownloadProgress(show) {
  downloadProgress.classList.toggle("hidden", !show);
  if (!show) {
    progressFill.style.width = "0%";
    progressPercent.textContent = "0%";
    progressText.textContent = "Скачивание...";
    filesizeText.textContent = "Размер: 0 MB";
    speedText.textContent = "Скорость: 0 MB/s";
    etaText.textContent = "Осталось: 0:00";
    downloadBtn.disabled = false;
  }
}


function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove("hidden");
  setTimeout(() => errorDiv.classList.add("hidden"), 8000);
}

function clearError() {
  errorDiv.classList.add("hidden");
}