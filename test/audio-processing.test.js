import assert from "node:assert/strict";
import test from "node:test";

import { encodePcm16Wav, VOICE_SAMPLE_RATE } from "../public/audio-processing.js";

const fakeAudioBuffer = ({ sampleRate, seconds, channels = 2 }) => {
  const length = sampleRate * seconds;
  const channelData = Array.from({ length: channels }, (_, channelIndex) => {
    const data = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.sin((index / sampleRate) * Math.PI * 440) * (channelIndex ? 0.5 : 1);
    }
    return data;
  });

  return {
    sampleRate,
    length,
    numberOfChannels: channels,
    getChannelData(index) {
      return channelData[index];
    }
  };
};

test("browser audio preprocessing emits compact 16 kHz mono WAV", () => {
  const seconds = 30;
  const wav = encodePcm16Wav(fakeAudioBuffer({ sampleRate: 48000, seconds }), seconds);
  const view = new DataView(wav);

  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), VOICE_SAMPLE_RATE);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(wav.byteLength, 44 + VOICE_SAMPLE_RATE * seconds * 2);
  assert.ok(wav.byteLength < 1_000_000);
});

test("browser audio preprocessing does not upsample low-rate audio", () => {
  const seconds = 2;
  const wav = encodePcm16Wav(fakeAudioBuffer({ sampleRate: 8000, seconds, channels: 1 }), seconds);
  const view = new DataView(wav);

  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(wav.byteLength, 44 + 8000 * seconds * 2);
});
