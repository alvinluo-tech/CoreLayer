export function maskApiKey(key: string | undefined): string {
  if (!key || key === "ollama" || key.length <= 4) return key ?? "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

export function isMaskedKey(key: string): boolean {
  return /^\*{4,}/.test(key);
}
