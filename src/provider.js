import https from "node:https";
import { createHash, randomUUID } from "node:crypto";

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

const readProbability = (payload) => {
  if (Array.isArray(payload?.frames) && payload.frames.length) {
    const frameScores = payload.frames
      .map((frame) => {
        const confidence = clamp01(frame?.confidence);
        const verdict = String(frame?.verdict || "").toLowerCase();

        if (verdict.includes("synthetic") || verdict.includes("fake") || verdict.includes("ai")) {
          return confidence;
        }

        if (
          verdict.includes("human") ||
          verdict.includes("natural") ||
          verdict.includes("real") ||
          verdict.includes("authentic")
        ) {
          return 1 - confidence;
        }

        return Number.isFinite(confidence) ? confidence : null;
      })
      .filter((score) => score !== null);

    if (frameScores.length) {
      const total = frameScores.reduce((sum, score) => sum + score, 0);
      return clamp01(total / frameScores.length);
    }
  }

  const candidates = [
    payload?.ai_probability,
    payload?.aiProbability,
    payload?.deepfake_probability,
    payload?.deepfakeProbability,
    payload?.fake_probability,
    payload?.fakeProbability,
    payload?.mean_ai_prob,
    payload?.meanAiProb,
    payload?.score,
    payload?.probability,
    payload?.result?.ai_probability,
    payload?.result?.mean_ai_prob,
    payload?.result?.score
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") continue;
    const number = Number(candidate);
    if (Number.isFinite(number)) return number > 1 ? clamp01(number / 100) : clamp01(number);
  }

  return null;
};

export const classifyScore = (score) => {
  if (score >= 0.7) return "likely_ai";
  if (score <= 0.3) return "likely_human";
  return "unclear";
};

export const confidenceForScore = (score) => {
  const distance = Math.abs(score - 0.5);
  if (distance >= 0.32) return "high";
  if (distance >= 0.18) return "medium";
  return "low";
};

const mockDetect = ({ audioBuffer, filename, analyzeSeconds }) => {
  const hash = createHash("sha256")
    .update(audioBuffer.subarray(0, Math.min(audioBuffer.length, 16000)))
    .update(filename || "")
    .update(String(analyzeSeconds))
    .digest();

  const raw = hash.readUInt16BE(0) / 65535;
  const score = 0.12 + raw * 0.76;

  return {
    provider: "mock",
    aiProbability: Number(score.toFixed(4)),
    raw: null
  };
};

const postMultipart = ({
  apiUrl,
  apiKey,
  body,
  contentType,
  timeoutMs,
  requestId,
  redirects = 0,
  startedAt = Date.now()
}) =>
  new Promise((resolve, reject) => {
    const target = new URL(apiUrl);
    const request = https.request(
      {
        method: "POST",
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        headers: {
          "X-API-Key": apiKey,
          "X-Request-ID": requestId,
          "Content-Type": contentType,
          "Content-Length": String(body.length)
        }
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location &&
            redirects < 3
          ) {
            const nextUrl = new URL(response.headers.location, target).toString();
            postMultipart({
              apiUrl: nextUrl,
              apiKey,
              body,
              contentType,
              timeoutMs,
              requestId,
              redirects: redirects + 1,
              startedAt
            })
              .then(resolve)
              .catch(reject);
            return;
          }

          const text = Buffer.concat(chunks).toString("utf8");
          let payload = null;

          try {
            payload = text ? JSON.parse(text) : {};
          } catch {
            payload = { message: text };
          }

          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            payload,
            durationMs: Date.now() - startedAt
          });
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Modulate request timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });

export const detectVoice = async ({
  audioBuffer,
  filename,
  mimeType,
  analyzeSeconds,
  apiKey,
  apiUrl,
  timeoutMs = 25000
}) => {
  if (!apiKey || !apiUrl) {
    return mockDetect({ audioBuffer, filename, analyzeSeconds });
  }

  const boundary = `mvp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeFilename = String(filename || "audio-upload").replace(/["\r\n]/g, "_");
  const contentType = mimeType || "application/octet-stream";
  const multipartHeader = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="upload_file"; filename="${safeFilename}"`,
      `Content-Type: ${contentType}`,
      "",
      ""
    ].join("\r\n")
  );
  const multipartFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipartBody = Buffer.concat([multipartHeader, audioBuffer, multipartFooter]);
  const requestId = randomUUID();
  const startedAt = Date.now();

  let response;
  try {
    response = await postMultipart({
      apiUrl,
      apiKey,
      body: multipartBody,
      contentType: `multipart/form-data; boundary=${boundary}`,
      timeoutMs,
      requestId,
      startedAt
    });
  } catch (error) {
    console.error("Modulate detection request failed", {
      requestId,
      durationMs: Date.now() - startedAt,
      message: error.message
    });
    error.statusCode = error.message.includes("timed out") ? 504 : 502;
    throw error;
  }

  console.info("Modulate detection request completed", {
    requestId,
    status: response.status,
    ok: response.ok,
    durationMs: response.durationMs
  });

  const payload = response.payload;

  if (!response.ok) {
    const details = Array.isArray(payload?.detail)
      ? payload.detail
          .map((item) => item?.msg || item?.message || JSON.stringify(item))
          .filter(Boolean)
          .join("; ")
      : "";
    const message =
      payload?.error || payload?.message || details || `Provider returned HTTP ${response.status}`;
    console.error("Modulate detection request returned an error", {
      requestId,
      status: response.status,
      message
    });
    const error = new Error(message);
    error.statusCode = response.status === 429 ? 503 : 502;
    throw error;
  }

  const score = readProbability(payload);
  if (score === null) {
    console.error("Modulate detection response was missing an AI probability", {
      requestId,
      status: response.status
    });
    const error = new Error("Provider response did not include a recognizable AI probability field.");
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: "modulate",
    aiProbability: Number(score.toFixed(4)),
    raw: {
      filename: payload?.filename || filename,
      duration_ms: payload?.duration_ms,
      frames: payload?.frames
    }
  };
};
