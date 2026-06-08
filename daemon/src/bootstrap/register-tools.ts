import { registerTodoTools } from "../runtimes/tool/adapters/native-tools/todo/connector.js";
import { registerReadingTools } from "../runtimes/tool/adapters/native-tools/reading/connector.js";
import { registerReviewTools } from "../runtimes/tool/adapters/native-tools/review/connector.js";
import { registerConversationTools } from "../runtimes/tool/adapters/native-tools/conversation.js";
import { registerMemoryTools } from "../runtimes/memory/connector.js";
import { registerChartTools } from "../runtimes/tool/adapters/native-tools/chart.js";
import { registerAllAdapters } from "../gateways/mcp/adapters/index.js";

export function registerAllTools(): void {
  registerTodoTools();
  registerReadingTools();
  registerReviewTools();
  registerConversationTools();
  registerMemoryTools();
  registerChartTools();
  registerAllAdapters();
}
