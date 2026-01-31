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

async function initSession() {
  try {
    const res = await fetch(`${API_URL}/get-session-token`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    sessionToken = data.token;
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

  const format = formatOptions.querySelector(".format-btn.active").dataset.format;
  let format_id = null;
  if (format === "mp4") {
    const activeQuality = resolutionOptions.querySelector(".resolution-btn.active");
    if (activeQuality) format_id = activeQuality.dataset.formatId;
  }

  currentWs = new WebSocket(`${WS_URL}?token=${sessionToken}`);

  currentWs.onopen = () => {
    currentWs.send(JSON.stringify({
      url: videoUrlInput.value.trim(),
      format,
      format_id,
    }));
    showDownloadProgress(true);
  };

  currentWs.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "progress") {
      progressFill.style.width = msg.percent + "%";
      progressPercent.textContent = Math.round(msg.percent) + "%";
    } else if (msg.type === "ready") {
      try {
        progressText.textContent = "Начало скачивания...";

        const downloadUrl = `${API_URL}/download/${encodeURIComponent(msg.filename)}?token=${sessionToken}`;
        
        const link = document.createElement("a");
        link.href = downloadUrl;
        
        link.style.display = "none";
        document.body.appendChild(link);
        
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
        }, 100);

        progressText.textContent = "Файл отправлен в загрузки!";
      } catch (err) {
        showError("Ошибка: " + err.message);
      } finally {
        setTimeout(() => {
          showDownloadProgress(false);
          location.reload();
        }, 1000)
      }
    } else if (msg.type === "error") {
      showError(msg.message);
      showDownloadProgress(false);
    }
  };

  currentWs.onclose = currentWs.onerror = () => {
    showDownloadProgress(false);
  };
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