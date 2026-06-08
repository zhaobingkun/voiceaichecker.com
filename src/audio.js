const readAscii = (buffer, start, end) => buffer.toString("ascii", start, end);

const parseWav = (buffer) => {
  if (buffer.length < 44 || readAscii(buffer, 0, 4) !== "RIFF" || readAscii(buffer, 8, 12) !== "WAVE") {
    throw new Error("Only WAV audio is accepted by the server.");
  }

  let offset = 12;
  let fmt = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = readAscii(buffer, offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) break;

    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
      };
    }

    if (chunkId === "data") {
      data = {
        start: chunkStart,
        size: chunkSize
      };
      break;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!fmt || !data) throw new Error("WAV file is missing required audio chunks.");
  if (fmt.audioFormat !== 1) throw new Error("Only PCM WAV audio is accepted by the server.");
  if (!fmt.sampleRate || !fmt.blockAlign) throw new Error("Invalid WAV format.");

  const durationSeconds = data.size / fmt.byteRate;
  return { fmt, data, durationSeconds };
};

const buildWav = ({ audioData, channels, sampleRate, bitsPerSample }) => {
  const blockAlign = Math.trunc((channels * bitsPerSample) / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + audioData.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(audioData.length, 40);

  return Buffer.concat([header, audioData]);
};

export const trimWavBuffer = ({ buffer, maxSeconds }) => {
  const parsed = parseWav(buffer);
  const { fmt, data, durationSeconds } = parsed;
  const maxBytes = Math.floor((fmt.byteRate * maxSeconds) / fmt.blockAlign) * fmt.blockAlign;
  const trimmedSize = Math.min(data.size, maxBytes);
  const audioData = buffer.subarray(data.start, data.start + trimmedSize);

  return {
    buffer: buildWav({
      audioData,
      channels: fmt.channels,
      sampleRate: fmt.sampleRate,
      bitsPerSample: fmt.bitsPerSample
    }),
    durationSeconds,
    trimmed: durationSeconds > maxSeconds
  };
};
