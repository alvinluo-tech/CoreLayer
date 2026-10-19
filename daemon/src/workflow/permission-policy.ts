/**
 * Maps an agent profile's declared permission vocabulary onto the coarse
 * permission policy understood by coding executors.
 *
 * The profile vocabulary (`chat`, `task_management`, `shell_exec`,
 * `file_write`, `file_read`) is what users see and what the rest of the
 * capability layer reasons about. Executors only understand
 * `strict | normal | permissive`, so the translation happens in one place.
 */

export type PermissionPolicy = "strict" | "normal" | "permissive";

/** Permissions that grant the ability to change files or run commands. */
const WRITE_CAPABILITIES = ["file_write", "shell_exec", "write", "execute"];

export function derivePermissionPolicy(permissions: readonly string[]): PermissionPolicy {
  const granted = new Set(permissions);
  if (granted.has("unrestricted")) return "permissive";
  if (WRITE_CAPABILITIES.some((capability) => granted.has(capability))) return "normal";
  return "strict";
}
