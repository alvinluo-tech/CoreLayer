import { registerAdapterTools } from "./base.js";
import type { AppConfig, AdapterToolDef } from "./types.js";

const veridiaTools: AdapterToolDef[] = [
  {
    name: "veridia_get_current",
    title: "Get Current Media",
    description: "Get currently active media items (in-progress books, shows, etc.)",
    risk: "low",
    method: "GET",
    path: "/api/jarvis/current",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Media type filter: book, movie, tv, article, course" },
      },
    },
  },
  {
    name: "veridia_get_stats",
    title: "Get Media Stats",
    description: "Get consumption statistics and dashboard data",
    risk: "low",
    method: "GET",
    path: "/api/jarvis/stats",
    inputSchema: {
      type: "object",
      properties: {
        range: { type: "string", description: "Time range: week, month, year" },
      },
    },
  },
  {
    name: "veridia_add_media",
    title: "Add Media",
    description: "Add a new media item to Veridia library",
    risk: "medium",
    method: "POST",
    path: "/api/jarvis/add",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Media title" },
        type: { type: "string", description: "Media type: book, movie, tv, article, course" },
        status: { type: "string", description: "Initial status (default: planned)" },
        reason_to_consume: { type: "string", description: "Why you want to consume this" },
        priority: { type: "number", description: "Priority (1-5)" },
      },
      required: ["title", "type"],
    },
  },
  {
    name: "veridia_update_status",
    title: "Update Media Status",
    description: "Update media status (planned, in_progress, completed, paused, dropped)",
    risk: "medium",
    method: "POST",
    path: "/api/jarvis/status",
    inputSchema: {
      type: "object",
      properties: {
        user_media_id: { type: "string", description: "User media ID" },
        title: { type: "string", description: "Media title (alternative to ID)" },
        status: { type: "string", description: "New status: planned, in_progress, completed, paused, dropped" },
      },
      required: ["status"],
    },
  },
  {
    name: "veridia_update_progress",
    title: "Update Progress",
    description: "Update reading/watching progress for a media item",
    risk: "medium",
    method: "POST",
    path: "/api/jarvis/progress",
    inputSchema: {
      type: "object",
      properties: {
        user_media_id: { type: "string", description: "User media ID" },
        title: { type: "string", description: "Media title (alternative to ID)" },
        progress_current: { type: "number", description: "Current progress value" },
        progress_total: { type: "number", description: "Total (e.g., total pages, episodes)" },
        progress_unit: { type: "string", description: "Unit: pages, episodes, chapters, etc." },
      },
      required: ["progress_current"],
    },
  },
  {
    name: "veridia_add_note",
    title: "Add Note",
    description: "Add a reflection note to a media item",
    risk: "medium",
    method: "POST",
    path: "/api/jarvis/note",
    inputSchema: {
      type: "object",
      properties: {
        user_media_id: { type: "string", description: "User media ID" },
        title: { type: "string", description: "Media title (alternative to ID)" },
        type: { type: "string", description: "Note type: general, quote, insight, question" },
        content: { type: "string", description: "Note content" },
        page_number: { type: "number", description: "Page number reference" },
        timestamp_seconds: { type: "number", description: "Timestamp for video/audio" },
        season_number: { type: "number", description: "TV show season" },
        episode_number: { type: "number", description: "TV show episode" },
      },
      required: ["content"],
    },
  },
];

/**
 * Register Veridia adapter tools.
 * Requires VERIDIA_BASE_URL and optionally VERIDIA_AUTH_TOKEN in env.
 */
export function registerVeridiaAdapter(): number {
  const baseUrl = process.env["VERIDIA_BASE_URL"];
  if (!baseUrl) {
    console.log("[Adapter] VERIDIA_BASE_URL not set, skipping Veridia adapter");
    return 0;
  }

  const config: AppConfig = {
    appId: "veridia",
    name: "Veridia",
    baseUrl,
    authToken: process.env["VERIDIA_AUTH_TOKEN"],
  };

  console.log(`[Adapter] Registering Veridia tools (${veridiaTools.length})`);
  return registerAdapterTools(config, veridiaTools);
}
