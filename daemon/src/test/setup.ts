import { tmpdir } from "node:os";
import { join } from "node:path";

// Repository modules import the default SQLite client at module evaluation time.
// Keep all test migrations isolated from the operator's real Jarvis database.
process.env.JARVIS_RUNTIME_MODE = "sidecar";
process.env.JARVIS_APP_DATA_DIR = join(
  tmpdir(),
  "jarvis-vitest",
  `${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}`,
);
