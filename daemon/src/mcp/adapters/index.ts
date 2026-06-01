/**
 * @deprecated Legacy REST adapter barrel. Adapters have moved to legacy/rest-bridges/.
 * New tools should be registered as native tools or MCP servers.
 */

export { registerAdapterTools } from "../../legacy/rest-bridges/base.js";
export type { AppConfig, AdapterToolDef } from "../../legacy/rest-bridges/types.js";

export { registerVeridiaAdapter } from "../../legacy/rest-bridges/veridia.js";
export { registerTaskFlowAdapter } from "./taskflow.js";
export { registerFlexiLogAdapter } from "../../legacy/rest-bridges/flexilog.js";

import { registerVeridiaAdapter } from "../../legacy/rest-bridges/veridia.js";
import { registerTaskFlowAdapter } from "./taskflow.js";
import { registerFlexiLogAdapter } from "../../legacy/rest-bridges/flexilog.js";

/**
 * @deprecated Register all external app adapters.
 * Each adapter checks for required env vars and skips if not configured.
 */
export function registerAllAdapters(): number {
  let total = 0;
  total += registerVeridiaAdapter();
  total += registerTaskFlowAdapter();
  total += registerFlexiLogAdapter();
  console.log(`[Adapters] Registered ${total} external tools`);
  return total;
}
