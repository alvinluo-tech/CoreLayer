/**
 * Voice Runtime — public API surface (runtime boundary).
 *
 * This is the ONLY module that HTTP routes may import from the voice
 * runtime. Internal implementation details (providers, streaming internals)
 * are not exposed.
 *
 * Boundary rule: http/routes/* → public-api.ts → internal/*
 *
 * Future: will evolve into a command facade / protocol client when runtimes
 * move to separate processes.
 */

export { transcribeWithGroq, isAsrAvailable } from "./asr.js";
export { synthesizeSpeech, isTtsAvailable, type TTSModel } from "./tts.js";
export { StreamingTTS } from "./streaming-tts.js";
export { voiceRegistry } from "./providers.js";
