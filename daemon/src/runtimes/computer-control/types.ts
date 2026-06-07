/**
 * Computer Control Runtime types.
 *
 * Defines the capabilities, operations, and permission model for
 * computer-control-runtime — the runtime that handles direct OS
 * interactions like screenshots, clicks, keyboard input, and window management.
 *
 * All computer control operations are high/critical risk and must
 * go through OSCapabilityBroker.
 */

import type { RiskLevel } from "@jarvis/types";

/** Computer control operation types */
export type ComputerControlOperation =
  | "screenshot"
  | "window.list"
  | "window.focus"
  | "window.close"
  | "click"
  | "double_click"
  | "right_click"
  | "type_text"
  | "key_press"
  | "key_combo"
  | "scroll"
  | "file_select"
  | "drag";

/** Risk level for each computer control operation */
export const COMPUTER_CONTROL_RISK: Record<ComputerControlOperation, RiskLevel> = {
  screenshot: "high",
  "window.list": "medium",
  "window.focus": "high",
  "window.close": "critical",
  click: "high",
  double_click: "high",
  right_click: "high",
  type_text: "critical",
  key_press: "high",
  key_combo: "critical",
  scroll: "medium",
  file_select: "critical",
  drag: "critical",
};

/** A computer control request */
export interface ComputerControlRequest {
  actorId: string;
  agentRunId?: string;
  taskId?: string;
  projectId?: string;
  operation: ComputerControlOperation;
  /** Screen coordinates for click/drag/scroll operations */
  coordinates?: { x: number; y: number };
  /** End coordinates for drag operations */
  endCoordinates?: { x: number; y: number };
  /** Text to type for type_text operation */
  text?: string;
  /** Key name for key_press operation */
  key?: string;
  /** Key combination for key_combo operation (e.g., ["ctrl", "c"]) */
  keys?: string[];
  /** Scroll direction and amount */
  scrollDelta?: { x: number; y: number };
  /** Window identifier for window operations */
  windowId?: string;
  /** File filter patterns for file_select */
  fileFilters?: string[];
  /** Reason for the operation (shown in approval UI) */
  reason?: string;
}

/** Result of a computer control operation */
export interface ComputerControlResult {
  success: boolean;
  operation: ComputerControlOperation;
  /** Screenshot image data (base64) for screenshot operations */
  screenshotData?: string;
  /** Window list for window.list operation */
  windows?: Array<{
    id: string;
    title: string;
    bounds: { x: number; y: number; width: number; height: number };
    focused: boolean;
  }>;
  /** Selected file path for file_select operation */
  selectedFile?: string;
  /** Error message if operation failed */
  error?: string;
  /** Whether the operation was denied by permission system */
  denied?: boolean;
  /** Permission decision reason */
  deniedReason?: string;
}

/** Permission status for a computer control capability */
export interface ComputerControlPermissionStatus {
  /** The operation type */
  operation: ComputerControlOperation;
  /** Whether this operation is currently enabled */
  enabled: boolean;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Whether user has granted blanket approval for this operation */
  blanketApproved: boolean;
  /** Whether screenshots/screen content recording is allowed */
  screenCaptureAllowed: boolean;
  /** Timestamp of last permission change */
  lastChangedAt?: string;
}

/** Computer control runtime status */
export interface ComputerControlRuntimeStatus {
  active: boolean;
  /** Total requests processed */
  totalRequests: number;
  /** Total denied requests */
  deniedRequests: number;
  /** Total approved requests */
  approvedRequests: number;
  /** Whether screen capture is globally enabled */
  screenCaptureEnabled: boolean;
  /** Per-operation permission statuses */
  permissions: ComputerControlPermissionStatus[];
}
