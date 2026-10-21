import { registerTodoTools } from "../runtimes/tool/adapters/native-tools/todo/connector.js";
import { registerReadingTools } from "../runtimes/tool/adapters/native-tools/reading/connector.js";
import { registerReviewTools } from "../runtimes/tool/adapters/native-tools/review/connector.js";
import { registerConversationTools } from "../runtimes/tool/adapters/native-tools/conversation.js";
import { registerMemoryTools } from "../runtimes/memory/connector.js";
import { registerChartTools } from "../runtimes/tool/adapters/native-tools/chart.js";
import { registerDelegationTools } from "../runtimes/tool/adapters/native-tools/delegation.js";
import { registerTaskGraphTools } from "../runtimes/tool/adapters/native-tools/task-graph.js";
import { registerCodeIntelligenceTools } from "../runtimes/tool/adapters/native-tools/code-intelligence.js";
import { registerToolDiscoveryTools } from "../runtimes/tool/adapters/native-tools/tool-discovery.js";
import { registerAllAdapters } from "../gateways/mcp/adapters/index.js";

export function registerAllTools(): void {
  registerTodoTools();
  registerReadingTools();
  registerReviewTools();
  registerConversationTools();
  registerMemoryTools();
  registerChartTools();
  registerDelegationTools();
  registerTaskGraphTools();
  registerCodeIntelligenceTools();
  registerToolDiscoveryTools();
  registerAllAdapters();
}
