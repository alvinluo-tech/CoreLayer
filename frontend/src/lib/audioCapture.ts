function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, length * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const sample = Math.max(-1, Math.min(1, chunk[i] ?? 0));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export interface AudioCapture {
  stream: MediaStream;
  pcmChunks: Float32Array[];
  analyser: AnalyserNode;
  stop: () => void;
}

export async function startAudioCapture(): Promise<AudioCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recordCtx = new AudioContext({ sampleRate: 16000 });
  const source = recordCtx.createMediaStreamSource(stream);
  const processor = recordCtx.createScriptProcessor(4096, 1, 1);
  const pcmChunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    pcmChunks.push(new Float32Array(data));
  };

  source.connect(processor);
  processor.connect(recordCtx.destination);

  const analyser = recordCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const stop = () => {
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    recordCtx.close().catch(() => {});
  };

  return { stream, pcmChunks, analyser, stop };
}
