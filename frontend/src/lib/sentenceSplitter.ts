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
export function splitSentences(text: string, isFirstChunk = false): SplitResult {
  const complete: string[] = [];
  let currentChunk = "";
  let i = 0;

  // For the very first chunk, we want extremely low latency, so we use a threshold of 5 characters.
  let currentMinLength = isFirstChunk ? 5 : 30;
  const MAX_FORCE_LIMIT = 150;

  while (i < text.length) {
    const char = text[i];
    if (char === undefined) break;
    currentChunk += char;

    // Check if the character is a sentence terminator.
    // For the first chunk, we also treat commas as terminators to play the initial voice immediately!
    const isTerminator = /[。！？!?\n]/.test(char) || (isFirstChunk && currentMinLength < 30 && /[，,]/.test(char));

    if (isTerminator) {
      if (currentChunk.trim().length >= currentMinLength || char === "\n") {
        complete.push(currentChunk.trim());
        currentChunk = "";
        currentMinLength = 30; // Any subsequent chunks must be >= 30 chars to stabilize voice
      }
    }
    
    // ULTRA-LOW LATENCY RULE FOR FIRST CHUNK:
    // If we are still looking for the very first chunk, and the text has reached 10 characters
    // but we haven't met any punctuation terminator yet, we force split it anyway to start audio playback immediately!
    if (isFirstChunk && currentMinLength < 30 && currentChunk.trim().length >= 10) {
      complete.push(currentChunk.trim());
      currentChunk = "";
      currentMinLength = 30;
    }

    // Force split if current accumulated chunk is extremely long without punctuation
    if (currentChunk.length >= MAX_FORCE_LIMIT) {
      const commaIndex = currentChunk.lastIndexOf("，");
      if (commaIndex !== -1 && commaIndex > 20) {
        complete.push(currentChunk.slice(0, commaIndex + 1).trim());
        currentChunk = currentChunk.slice(commaIndex + 1);
        currentMinLength = 30;
      } else {
        complete.push(currentChunk.slice(0, MAX_FORCE_LIMIT).trim());
        currentChunk = currentChunk.slice(MAX_FORCE_LIMIT);
        currentMinLength = 30;
      }
    }

    i++;
  }

  return { complete, remainder: currentChunk };
}
