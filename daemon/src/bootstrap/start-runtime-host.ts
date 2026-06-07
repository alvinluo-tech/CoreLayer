import { startAllRuntimes } from "../runtime-host/index.js";

export async function startRuntimeHost(): Promise<void> {
  await startAllRuntimes();
}
