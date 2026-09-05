export const VOICE_SAMPLE_RATE = 16000;

const clampSample = (value) => Math.max(-1, Math.min(1, value));

export const encodePcm16Wav = (audioBuffer, seconds) => {
  const sourceSampleRate = audioBuffer.sampleRate;
  const targetSampleRate = Math.min(sourceSampleRate, VOICE_SAMPLE_RATE);
  const sourceFrameCount = Math.min(audioBuffer.length, Math.floor(sourceSampleRate * seconds));
  const outputFrameCount = Math.ceil((sourceFrameCount * targetSampleRate) / sourceSampleRate);
  const wavBuffer = new ArrayBuffer(44 + outputFrameCount * 2);
  const view = new DataView(wavBuffer);

  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + outputFrameCount * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, outputFrameCount * 2, true);

  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index)
  );
  const sourceStep = sourceSampleRate / targetSampleRate;

  let offset = 44;
  for (let frame = 0; frame < outputFrameCount; frame += 1) {
    const sourcePosition = Math.min(frame * sourceStep, Math.max(0, sourceFrameCount - 1));
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, Math.max(0, sourceFrameCount - 1));
    const mix = sourcePosition - leftIndex;
    let sample = 0;

    for (const channel of channels) {
      const left = channel[leftIndex] || 0;
      const right = channel[rightIndex] || left;
      sample += left + (right - left) * mix;
    }

    const monoSample = clampSample(sample / Math.max(1, channels.length));
    view.setInt16(offset, monoSample < 0 ? monoSample * 0x8000 : monoSample * 0x7fff, true);
    offset += 2;
  }

  return wavBuffer;
};
