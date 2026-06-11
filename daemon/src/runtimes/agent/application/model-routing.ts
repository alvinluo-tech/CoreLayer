/**
 * Model routing for the agent loop.
 * Selects the best model based on message context and configured gateway.
 */

import { configManager } from "../../../config/config-manager.js";
import { getModelGateway } from "../../../gateways/model/gateway.js";
import { logError } from "../../../shared/errors.js";

/** Infer task context from message content for model selection. */
function inferTaskContext(userMessage: string, hasTools: boolean, historyLength: number): {
  mode?: 'text' | 'voice';
  expectedAnswerLength?: 'short' | 'medium' | 'long';
  requiresToolCalling?: boolean;
  requiresLongContext?: boolean;
  requiresPrivacy?: boolean;
  requiresVision?: boolean;
} {
  const msgLen = userMessage.length;

  const requiresPrivacy =
    /\b(password|passwd|密码|口令|api[_ ]?key|secret|token|credential|私密|隐私|个人|身份证|id[_ ]?card)\b/i.test(
      userMessage
    );

  const requiresVision =
    /\b(图片|图像|截图|照片|看图|识别图|image|screenshot|photo|picture|vision|analyze\s+image)\b/i.test(
      userMessage
    ) || /!\[.*\]\(.*\)/.test(userMessage);

  return {
    expectedAnswerLength: msgLen < 50 ? 'short' : msgLen > 300 ? 'long' : 'medium',
    requiresToolCalling: hasTools,
    requiresLongContext: historyLength > 40,
    requiresPrivacy: requiresPrivacy || undefined,
    requiresVision: requiresVision || undefined,
  };
}

/** Select model via ModelGateway, falling back to activeModel on failure. */
export function selectModelForConversation(
  userMessage: string,
  hasTools: boolean,
  historyLength: number,
): string {
  const activeModel = configManager.getActiveModel();

  if (activeModel && activeModel !== "auto") {
    return activeModel;
  }

  try {
    const gateway = getModelGateway();
    const criteria = inferTaskContext(userMessage, hasTools, historyLength);
    const selected = gateway.selectModel(criteria);
    gateway.getModel(selected);
    const profile = gateway.getProfile(selected);
    console.info(`[Router] selected model: ${selected} (${profile?.displayName ?? selected})`);
    return selected;
  } catch (err) {
    logError("selectModelForConversation/fallback", err);
    return "mimo-2.5-pro";
  }
}
