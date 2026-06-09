import { defineConfig } from "drizzle-kit";
import { homedir } from "os";
import path from "path";

const defaultDbPath = path.join(homedir(), ".jarvis", "data", "jarvis.db");

export default defineConfig({
  schema: "./src/persistence/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.SQLITE_DB_PATH || defaultDbPath,
  },
});
