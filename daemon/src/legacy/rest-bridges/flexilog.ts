/**
 * @deprecated REST adapter for FlexiLog. Kept for backward compatibility.
 * New tools should be registered as native tools or MCP servers.
 * See skills/corelayer-mcp-adapter/SKILL.md for migration guidance.
 */

import { registerAdapterTools } from "./base.js";
import type { AppConfig, AdapterToolDef } from "./types.js";

const flexilogTools: AdapterToolDef[] = [
  {
    name: "flexilog_log_workout",
    title: "Log Workout",
    description: "Record a completed workout session in FlexiLog",
    risk: "medium",
    method: "POST",
    path: "/api/workouts",
    inputSchema: {
      type: "object",
      properties: {
        exercises: {
          type: "array",
          description: "Exercises performed",
          items: {
            type: "object",
            properties: {
              exerciseId: { type: "string" },
              sets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    reps: { type: "number" },
                    weight: { type: "number" },
                    rpe: { type: "number" },
                  },
                },
              },
            },
          },
        },
        duration: { type: "number", description: "Workout duration in minutes" },
        notes: { type: "string", description: "Workout notes" },
      },
      required: ["exercises"],
    },
  },
  {
    name: "flexilog_get_history",
    title: "Get Workout History",
    description: "Retrieve past workout sessions from FlexiLog",
    risk: "low",
    method: "GET",
    path: "/api/workouts",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of workouts to return (default 10)" },
        offset: { type: "number", description: "Offset for pagination" },
      },
    },
  },
  {
    name: "flexilog_get_exercises",
    title: "Get Exercise Library",
    description: "Browse the FlexiLog exercise library (200+ exercises)",
    risk: "low",
    method: "GET",
    path: "/api/exercises",
    inputSchema: {
      type: "object",
      properties: {
        muscleGroup: { type: "string", description: "Filter by muscle group" },
        equipment: { type: "string", description: "Filter by equipment type" },
        q: { type: "string", description: "Search query" },
      },
    },
  },
  {
    name: "flexilog_get_analytics",
    title: "Get Training Analytics",
    description: "Get training volume, frequency, and PR tracking analytics",
    risk: "low",
    method: "GET",
    path: "/api/analytics",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", description: "Time period: week, month, year" },
      },
    },
  },
];

/**
 * Register FlexiLog adapter tools.
 * Requires FLEXILOG_BASE_URL and optionally FLEXILOG_AUTH_TOKEN in env.
 */
export function registerFlexiLogAdapter(): number {
  const baseUrl = process.env["FLEXILOG_BASE_URL"];
  if (!baseUrl) {
    console.log("[Adapter] FLEXILOG_BASE_URL not set, skipping FlexiLog adapter");
    return 0;
  }

  const config: AppConfig = {
    appId: "flexilog",
    name: "FlexiLog",
    baseUrl,
    authToken: process.env["FLEXILOG_AUTH_TOKEN"],
  };

  console.log(`[Adapter] Registering FlexiLog tools (${flexilogTools.length})`);
  return registerAdapterTools(config, flexilogTools);
}
