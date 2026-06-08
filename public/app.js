const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const uploadTab = document.querySelector("#upload-tab");
const recordTab = document.querySelector("#record-tab");
const uploadPane = document.querySelector("#upload-pane");
const recordPane = document.querySelector("#record-pane");
const recordButton = document.querySelector("#record-button");
const recordLabel = document.querySelector("#record-label");
const recordTime = document.querySelector("#record-time");
const fileRow = document.querySelector("#file-row");
const fileName = document.querySelector("#file-name");
const fileMeta = document.querySelector("#file-meta");
const clearButton = document.querySelector("#clear-button");
const waveform = document.querySelector("#waveform");
const secondsInput = document.querySelector("#seconds-input");
const secondsOutput = document.querySelector("#seconds-output");
const detectButton = document.querySelector("#detect-button");
const statusEl = document.querySelector("#status");
const quotaChip = document.querySelector("#quota-chip");
const loginLink = document.querySelector("#login-link");
const userMenu = document.querySelector("#user-menu");
const userPicture = document.querySelector("#user-picture");
const userName = document.querySelector("#user-name");
const logoutButton = document.querySelector("#logout-button");
const resultSection = document.querySelector("#result-section");
const resultLabel = document.querySelector("#result-label");
const scoreFill = document.querySelector("#score-fill");
const humanScore = document.querySelector("#human-score");
const aiScore = document.querySelector("#ai-score");
const confidenceValue = document.querySelector("#confidence-value");
const providerValue = document.querySelector("#provider-value");
const analyzedValue = document.querySelector("#analyzed-value");
const remainingValue = document.querySelector("#remaining-value");
const resultNote = document.querySelector("#result-note");
const shareLinks = Array.from(document.querySelectorAll("[data-share]"));

let selectedFile = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordStartedAt = 0;
let recordTimer = null;
let accountState = null;

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
};

const formatTime = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const rest = String(safe % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
};

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
};

const showAuthError = () => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("auth_error");
  if (!error) return;

  setStatus(`Google sign-in failed: ${error}. Check the OAuth redirect URI and consent screen settings.`, true);
  params.delete("auth_error");
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
};

const renderAccount = (state) => {
  accountState = state;
  const remaining = state?.remainingDailyDetections ?? "--";
  const limit = state?.dailyLimit ?? "--";
  quotaChip.textContent = `${remaining}/${limit} free checks left`;

  if (!state?.authConfigured) {
    loginLink.classList.add("is-disabled");
    loginLink.setAttribute("aria-disabled", "true");
    loginLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
  }

  if (state?.user) {
    loginLink.hidden = true;
    userMenu.hidden = false;
    userName.textContent = state.user.name || state.user.email || "Account";
    userPicture.src = state.user.picture || "";
    userPicture.hidden = !state.user.picture;
  } else {
    loginLink.hidden = false;
    userMenu.hidden = true;
  }
};

const loadAccount = async () => {
  try {
    const response = await fetch("/api/me");
    const state = await response.json();
    renderAccount(state);
  } catch {
    quotaChip.textContent = "Free checks available";
  }
};

const setupShareLinks = () => {
  if (!shareLinks.length) return;

  const pageUrl = window.location.href.split("#")[0];
  const title = document.title || "AI Voice Detector";
  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedTitle = encodeURIComponent(title);
  const shareTargets = {
    x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
  };

  for (const link of shareLinks) {
    const target = shareTargets[link.dataset.share];
    if (target) link.href = target;
  }
};

const setTab = (mode) => {
  const isUpload = mode === "upload";
  uploadTab.classList.toggle("is-active", isUpload);
  recordTab.classList.toggle("is-active", !isUpload);
  uploadTab.setAttribute("aria-selected", String(isUpload));
  recordTab.setAttribute("aria-selected", String(!isUpload));
  uploadPane.classList.toggle("is-active", isUpload);
  recordPane.classList.toggle("is-active", !isUpload);
};

const drawEmptyWaveform = () => {
  const context = waveform.getContext("2d");
  const { width, height } = waveform;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101713";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,0.14)";
  context.lineWidth = 1;

  for (let x = 24; x < width; x += 48) {
    context.beginPath();
    context.moveTo(x, 24);
    context.lineTo(x, height - 24);
    context.stroke();
  }

  context.strokeStyle = "#d99b24";
  context.lineWidth = 3;
  context.beginPath();
  for (let x = 0; x < width; x += 8) {
    const y = height / 2 + Math.sin(x / 22) * 13 + Math.sin(x / 9) * 5;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
};

const drawFileWaveform = async (file) => {
  drawEmptyWaveform();
  try {
    const audioContext = new AudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const data = audioBuffer.getChannelData(0);
    const context = waveform.getContext("2d");
    const { width, height } = waveform;
    const step = Math.ceil(data.length / width);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#101713";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#38b68f";
    context.lineWidth = 2;

    for (let x = 0; x < width; x += 1) {
      let min = 1;
      let max = -1;
      for (let i = 0; i < step; i += 1) {
        const datum = data[x * step + i] || 0;
        min = Math.min(min, datum);
        max = Math.max(max, datum);
      }
      context.beginPath();
      context.moveTo(x, (1 + min) * height * 0.5);
      context.lineTo(x, (1 + max) * height * 0.5);
      context.stroke();
    }

    await audioContext.close();
  } catch {
    drawEmptyWaveform();
  }
};

const setSelectedFile = async (file) => {
  if (!file) return;
  selectedFile = file;
  fileName.textContent = file.name || "Recorded audio";
  fileMeta.textContent = `${file.type || "audio"} · ${formatBytes(file.size)}`;
  fileRow.hidden = false;
  detectButton.disabled = false;
  resultSection.hidden = true;
  setStatus("");
  await drawFileWaveform(file);
};

const clearSelectedFile = () => {
  selectedFile = null;
  fileInput.value = "";
  fileRow.hidden = true;
  detectButton.disabled = true;
  resultSection.hidden = true;
  setStatus("");
  drawEmptyWaveform();
};

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const encodePcm16Wav = (audioBuffer, seconds) => {
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = Math.min(audioBuffer.length, Math.floor(sampleRate * seconds));
  const wavBuffer = new ArrayBuffer(44 + frameCount * 2);
  const view = new DataView(wavBuffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + frameCount * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, frameCount * 2, true);

  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index)
  );

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const mixed = channels.reduce((sum, channel) => sum + (channel[frame] || 0), 0) / channels.length;
    const clamped = Math.max(-1, Math.min(1, mixed));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return wavBuffer;
};

const prepareAudioForDetection = async (file, seconds) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("This browser cannot prepare audio for detection.");
  }

  const context = new AudioContextCtor();
  try {
    const source = await file.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(source.slice(0));
    const wavBuffer = encodePcm16Wav(audioBuffer, seconds);
    const baseName = (file.name || "audio-upload").replace(/\.[^.]+$/, "");
    return new File([wavBuffer], `${baseName || "audio-upload"}-first-${seconds}s.wav`, {
      type: "audio/wav"
    });
  } finally {
    await context.close();
  }
};

const labelText = {
  likely_ai: "Likely AI",
  likely_human: "Likely Human",
  unclear: "Unclear"
};

const showResult = (result) => {
  const aiPercent = Math.round(result.aiProbability * 100);
  const humanPercent = Math.round(result.humanProbability * 100);

  resultLabel.textContent = labelText[result.label] || "Unclear";
  scoreFill.style.width = `${aiPercent}%`;
  aiScore.textContent = `${aiPercent}%`;
  humanScore.textContent = `${humanPercent}%`;
  confidenceValue.textContent = result.confidence || "--";
  providerValue.textContent = result.provider || "--";
  analyzedValue.textContent = `${result.analyzedSeconds || "--"}s`;
  remainingValue.textContent = String(result.remainingDailyDetections ?? "--");
  resultNote.textContent = result.notes || "";
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
};

const detectSelectedFile = async () => {
  if (!selectedFile) return;
  detectButton.disabled = true;
  setStatus(`Preparing first ${secondsInput.value} seconds...`);

  try {
    const uploadFile = await prepareAudioForDetection(selectedFile, Number(secondsInput.value));
    setStatus("Analyzing audio...");
    const response = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: await fileToBase64(uploadFile),
        filename: uploadFile.name,
        mimeType: uploadFile.type,
        analyzeSeconds: Number(secondsInput.value)
      })
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Detection failed.");

    showResult(payload);
    if (accountState) {
      accountState.remainingDailyDetections = payload.remainingDailyDetections;
      renderAccount(accountState);
    } else {
      await loadAccount();
    }
    setStatus(payload.cached ? "Returned cached result." : "Detection complete.");
  } catch (error) {
    setStatus(error.message || "Detection failed.", true);
  } finally {
    detectButton.disabled = false;
  }
};

const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    const file = new File([blob], `voice-recording-${Date.now()}.webm`, { type: blob.type });
    await setSelectedFile(file);
  });

  recordStartedAt = Date.now();
  recordTimer = window.setInterval(() => {
    recordTime.textContent = formatTime((Date.now() - recordStartedAt) / 1000);
  }, 250);

  mediaRecorder.start();
  recordButton.classList.add("is-recording");
  recordButton.setAttribute("aria-pressed", "true");
  recordLabel.textContent = "Stop";
};

const stopRecording = () => {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.stop();
  window.clearInterval(recordTimer);
  recordTimer = null;
  recordButton.classList.remove("is-recording");
  recordButton.setAttribute("aria-pressed", "false");
  recordLabel.textContent = "Record";
};

setupShareLinks();

const hasDetectorUi = Boolean(
  fileInput &&
    dropZone &&
    uploadTab &&
    recordTab &&
    uploadPane &&
    recordPane &&
    recordButton &&
    recordLabel &&
    recordTime &&
    fileRow &&
    fileName &&
    fileMeta &&
    clearButton &&
    waveform &&
    secondsInput &&
    secondsOutput &&
    detectButton &&
    statusEl &&
    quotaChip &&
    loginLink &&
    userMenu &&
    userPicture &&
    userName &&
    logoutButton &&
    resultSection &&
    resultLabel &&
    scoreFill &&
    humanScore &&
    aiScore &&
    confidenceValue &&
    providerValue &&
    analyzedValue &&
    remainingValue &&
    resultNote
);

if (hasDetectorUi) {
  uploadTab.addEventListener("click", () => setTab("upload"));
  recordTab.addEventListener("click", () => setTab("record"));

  fileInput.addEventListener("change", async () => {
    await setSelectedFile(fileInput.files?.[0]);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });

  dropZone.addEventListener("drop", async (event) => {
    await setSelectedFile(event.dataTransfer?.files?.[0]);
  });

  clearButton.addEventListener("click", clearSelectedFile);

  secondsInput.addEventListener("input", () => {
    secondsOutput.value = `${secondsInput.value}s`;
    secondsOutput.textContent = `${secondsInput.value}s`;
  });

  detectButton.addEventListener("click", detectSelectedFile);

  logoutButton.addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST" });
    await loadAccount();
  });

  recordButton.addEventListener("click", async () => {
    try {
      if (mediaRecorder?.state === "recording") {
        stopRecording();
        return;
      }
      await startRecording();
    } catch {
      setStatus("Microphone access failed.", true);
    }
  });

  drawEmptyWaveform();
  showAuthError();
  loadAccount();
}
