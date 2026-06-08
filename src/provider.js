import https from "node:https";
import { createHash } from "node:crypto";

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

const postMultipart = ({ apiUrl, apiKey, body, contentType, redirects = 0 }) =>
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
            postMultipart({ apiUrl: nextUrl, apiKey, body, contentType, redirects: redirects + 1 })
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
            payload
          });
        });
      }
    );

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
  apiUrl
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

  const response = await postMultipart({
    apiUrl,
    apiKey,
    body: multipartBody,
    contentType: `multipart/form-data; boundary=${boundary}`
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
    throw new Error(message);
  }

  const score = readProbability(payload);
  if (score === null) {
    throw new Error("Provider response did not include a recognizable AI probability field.");
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
