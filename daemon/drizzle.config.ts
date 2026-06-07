import { defineConfig } from "drizzle-kit";
import { homedir } from "os";
import path from "path";

const defaultDbPath = path.join(homedir(), ".jarvis", "jarvis.db");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.SQLITE_DB_PATH || defaultDbPath,
  },
});
