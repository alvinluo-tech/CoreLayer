export interface SplitResult {
  complete: string[];
  remainder: string;
}

/**
 * Split text into reasonable chunks for TTS (preserving punctuation and intonation).
 * Parameters:
 * - text: the incoming text buffer.
 * - isFirstChunk: if true, we are splitting the very first sentence of the stream.
 *                 We allow a much lower length threshold (8 characters) to ensure extremely low first-byte latency.
 */
export function splitSentences(text: string, chunkIndex = 0): SplitResult {
  const complete: string[] = [];
  let currentChunk = "";
  let i = 0;

  // Multi-tier configuration based on chunkIndex:
  // - chunkIndex === 0: Tier 1 (Ultra-low latency: min 5 chars, comma-split, force 10)
  // - chunkIndex === 1: Tier 2 (Medium latency bridge: min 15 chars, comma-split, force 25)
  // - chunkIndex >= 2:  Tier 3 (High stability breathing: min 35 chars, strict punctuation, force 150)
  let tier = 3;
  if (chunkIndex === 0) tier = 1;
  else if (chunkIndex === 1) tier = 2;

  let currentMinLength = tier === 1 ? 5 : tier === 2 ? 15 : 35;
  const forceLimit = tier === 1 ? 10 : tier === 2 ? 25 : 150;

  while (i < text.length) {
    const char = text[i];
    if (char === undefined) break;
    currentChunk += char;

    // Check if character is sentence terminator.
    // Tier 1 and Tier 2 allow splitting at commas (，, 、) to stream the voice immediately.
    const isTerminator =
      /[。！？!?\n]/.test(char) ||
      ((tier === 1 || tier === 2) && currentMinLength < 35 && /[，,、]/.test(char));

    if (isTerminator) {
      if (currentChunk.trim().length >= currentMinLength || char === "\n") {
        complete.push(currentChunk.trim());
        currentChunk = "";
        currentMinLength = 35; // Reset subsequent splits inside the same loop iteration to Tier 3
      }
    }
    
    // Force-split rule for low latency tiers to jumpstart audio
    if ((tier === 1 || tier === 2) && currentMinLength < 35 && currentChunk.trim().length >= forceLimit) {
      const containsEnglish = /[a-zA-Z]/.test(currentChunk);
      if (!containsEnglish) {
        complete.push(currentChunk.trim());
        currentChunk = "";
        currentMinLength = 35;
      }
    }

    // Force-split rule for Tier 3 long sentences to prevent overflow
    if (currentChunk.length >= 150) {
      const commaIndex = currentChunk.lastIndexOf("，");
      if (commaIndex !== -1 && commaIndex > 20) {
        complete.push(currentChunk.slice(0, commaIndex + 1).trim());
        currentChunk = currentChunk.slice(commaIndex + 1);
        currentMinLength = 35;
      } else {
        complete.push(currentChunk.slice(0, 150).trim());
        currentChunk = currentChunk.slice(150);
        currentMinLength = 35;
      }
    }

    i++;
  }

  return { complete, remainder: currentChunk };
}
