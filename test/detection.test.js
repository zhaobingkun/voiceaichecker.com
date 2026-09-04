import assert from "node:assert/strict";
import test from "node:test";

const { handleDetect, handleHealth, handleMe } = await import("../src/server/handlers.js");

const responseRecorder = () => ({
  statusCode: null,
  headers: {},
  body: "",
  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = { ...this.headers, ...headers };
  },
  getHeader(name) {
    return this.headers[name];
  },
  setHeader(name, value) {
    this.headers[name] = value;
  },
  end(value = "") {
    this.body += value;
  }
});

const testWavBase64 = () => {
  const sampleRate = 8000;
  const samples = Buffer.alloc(sampleRate * 2);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);

  return Buffer.concat([header, samples]).toString("base64");
};

test("anonymous detection is capped at the configured 15-second window", async () => {
  const req = {
    method: "POST",
    headers: {},
    socket: { remoteAddress: "198.51.100.20" },
    body: {
      audioBase64: testWavBase64(),
      filename: "sample.wav",
      mimeType: "audio/wav",
      analyzeSeconds: 30
    }
  };
  const res = responseRecorder();

  await handleDetect(req, res);

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.provider, "mock");
  assert.equal(payload.analyzedSeconds, 15);
  assert.equal(payload.remainingDailyDetections, 2);
});

test("account status exposes the anonymous analysis window", async () => {
  const req = { headers: {}, socket: { remoteAddress: "198.51.100.21" } };
  const res = responseRecorder();

  await handleMe(req, res);

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.dailyLimit, 3);
  assert.equal(payload.maxAnalyzeSeconds, 15);
  assert.equal(payload.remainingDailyDetections, 3);
});

test("health reports the configured quota backend and timeout", () => {
  const res = responseRecorder();

  handleHealth(res);

  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.quotaBackend, "memory");
  assert.equal(payload.modulateRequestTimeoutMs, 25000);
});
