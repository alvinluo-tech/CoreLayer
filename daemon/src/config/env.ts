import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root (parent of daemon/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

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
  // AI Provider (any string, defaults to "mimo" for backward compat)
  AI_PROVIDER: getEnvVar("AI_PROVIDER", [], "mimo"),
  AI_MODEL: getEnvVar("AI_MODEL", [], "mimo-v2.5-pro"),

  // MiMo (Xiaomi)
  MIMO_API_KEY: getEnvVar("MIMO_API_KEY", ["XIAOMI_API_KEY"], ""),
  MIMO_API_URL: getEnvVar("MIMO_API_URL", ["XIAOMI_API_URL", "OPENAI_API_BASE_URL"], "https://token-plan-ams.xiaomimimo.com/v1"),

  // Groq (for ASR and fallback LLM)
  GROQ_API_KEY: getEnvVar("GROQ_API_KEY", [], ""),

  // OpenRouter
  OPENROUTER_API_KEY: getEnvVar("OPENROUTER_API_KEY", [], ""),

  // Ollama (local)
  OLLAMA_BASE_URL: getEnvVar("OLLAMA_BASE_URL", [], "http://localhost:11434/v1"),

  // Supabase
  SUPABASE_URL: getEnvVar("SUPABASE_URL", [], ""),
  SUPABASE_ANON_KEY: getEnvVar("SUPABASE_ANON_KEY", [], ""),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar("SUPABASE_SERVICE_ROLE_KEY", [], ""),

  // Storage
  STORAGE_MODE: getEnvVar("STORAGE_MODE", [], "local") as "local" | "cloud",
  SQLITE_DB_PATH: getEnvVar("SQLITE_DB_PATH", [], "./data/jarvis.db"),

  // Server
  DAEMON_PORT: parseInt(getEnvVar("DAEMON_PORT", [], "3001"), 10),
  DAEMON_HOST: getEnvVar("DAEMON_HOST", [], "localhost"),

  // General PostgreSQL
  DATABASE_URL: getEnvVar("DATABASE_URL", ["POSTGRES_URL"], ""),

  // Wake word (Porcupine)
  PORCUPINE_ACCESS_KEY: getEnvVar("PORCUPINE_ACCESS_KEY", [], ""),
} as const;
