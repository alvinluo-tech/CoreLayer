import { z } from "zod";

const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["openai_compatible", "ollama"]),
  baseURL: z.string().url(),
  enabled: z.boolean(),
});

const routingRuleSchema = z.object({
  taskType: z.string(),
  modelId: z.string(),
  conditions: z.record(z.unknown()).optional(),
});

const defaultsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).default(4096),
  maxSteps: z.number().int().min(1).max(100).default(20),
  streamTimeout: z.number().int().min(1000).default(120_000),
  turnTimeout: z.number().int().min(1000).default(180_000),
  memoryMinScore: z.number().min(0).max(1).default(0.3),
});

export const configSchema = z.object({
  version: z.literal(1).default(1),
  activeProvider: z.string().default("mimo"),
  activeModel: z.string().default("mimo-v2.5-pro"),
  providers: z.array(providerSchema).default([]),
  routingRules: z.array(routingRuleSchema).default([]),
  defaults: defaultsSchema.default({}),
  migrated: z.boolean().optional(),
});

export type JarvisConfigInput = z.infer<typeof configSchema>;

export interface ValidationResult {
  valid: boolean;
  config?: z.infer<typeof configSchema>;
  errors: string[];
}

export function validateConfig(raw: unknown): ValidationResult {
  const result = configSchema.safeParse(raw ?? {});
  if (result.success) {
    return { valid: true, config: result.data, errors: [] };
  }
  const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return { valid: false, errors };
}
