import dotenv from "dotenv";
import path from "path";

if (process.env.JARVIS_RUNTIME_MODE !== "sidecar") {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

function getEnvVar(key: string, fallbackKeys: string[] = [], defaultValue?: string): string {
  let value = process.env[key];
  if (!value) {
    for (const fallback of fallbackKeys) {
      value = process.env[fallback];
      if (value) break;
    }
  }
  if (!value && defaultValue !== undefined) {
    value = defaultValue;
  }
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  // AI Provider selection (non-secret, can stay in .env)
  AI_PROVIDER: getEnvVar("AI_PROVIDER", [], "mimo"),
  AI_MODEL: getEnvVar("AI_MODEL", [], "mimo-v2.5-pro"),

  // Provider base URLs (non-secret defaults)
  MIMO_API_URL: getEnvVar("MIMO_API_URL", ["XIAOMI_API_URL", "OPENAI_API_BASE_URL"], "https://token-plan-ams.xiaomimimo.com/v1"),
  OLLAMA_BASE_URL: getEnvVar("OLLAMA_BASE_URL", [], "http://localhost:11434/v1"),

  // Storage
  STORAGE_MODE: getEnvVar("STORAGE_MODE", [], "local") as "local" | "cloud",

  // Server
  DAEMON_PORT: parseInt(getEnvVar("DAEMON_PORT", [], "3001"), 10),
  DAEMON_HOST: getEnvVar("DAEMON_HOST", [], "127.0.0.1"),

  // Runtime (set by Tauri supervisor in sidecar mode)
  JARVIS_RUNTIME_MODE: getEnvVar("JARVIS_RUNTIME_MODE", [], "dev") as "dev" | "sidecar" | "external",
  JARVIS_APP_DATA_DIR: getEnvVar("JARVIS_APP_DATA_DIR", [], ""),
  JARVIS_LOG_DIR: getEnvVar("JARVIS_LOG_DIR", [], ""),

  // General PostgreSQL
  DATABASE_URL: getEnvVar("DATABASE_URL", ["POSTGRES_URL"], ""),
} as const;
