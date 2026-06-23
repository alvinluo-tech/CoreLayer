/**
 * Workspace Timeline Model — maps backend event payloads into display cards.
 *
 * Converts structured event payloads into a view model that the
 * WorkspaceTimeline component can render without parsing logic in JSX.
 */

export type TimelineCategory =
  | 'agent'
  | 'tool'
  | 'memory'
  | 'approval'
  | 'artifact'
  | 'verification'
  | 'system';

export interface TimelineDisplayCard {
  id: string;
  category: TimelineCategory;
  title: string;
  summary: string;
  timestamp: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  chips: string[];
  filePath?: string;
  diffPreview?: string;
}

interface BackendEvent {
  id: string;
  type: string;
  createdAt: string;
  payload?: any;
}

interface PayloadWithTitle {
  title?: string;
  summary?: string;
  severity?: string;
  [key: string]: any;
}

/**
 * Map a workspace event type to a timeline category.
 */
function eventTypeToCategory(type: string): TimelineCategory {
  if (type.includes('run.') || type.includes('task.') || type.includes('autonomy.')) return 'agent';
  if (type.includes('artifact.')) return 'artifact';
  if (type.includes('verification')) return 'verification';
  if (type.includes('blocked') || type.includes('approval')) return 'approval';
  if (
    type.includes('spec.') ||
    type.includes('team.') ||
    type.includes('created') ||
    type.includes('orchestrated') ||
    type.includes('decomposed')
  )
    return 'system';
  return 'system';
}

/**
 * Extract chips (metadata tags) from the event payload.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChips(type: string, payload: any): string[] {
  const chips: string[] = [];

  if (type.includes('task.') && payload?.taskTitle) {
    chips.push(`Task: ${payload.taskTitle}`);
  }
  if (type.includes('run.') && payload?.runtimeId) {
    chips.push(`Runtime: ${payload.runtimeId}`);
  }
  if (type.includes('run.') && payload?.durationMs) {
    const seconds = (payload.durationMs / 1000).toFixed(1);
    chips.push(`${seconds}s`);
  }
  if (type.includes('artifact.') && payload?.artifactType) {
    chips.push(payload.artifactType);
  }
  if (type.includes('verification') && payload?.command) {
    chips.push(payload.command);
  }
  if (type.includes('decomposed') && payload?.taskCount) {
    chips.push(`${payload.taskCount} tasks`);
  }
  if (type.includes('team.assigned') && payload?.agentCount) {
    chips.push(`${payload.agentCount} agents`);
  }

  return chips;
}

/**
 * Map a single backend event to a TimelineDisplayCard.
 */
export function mapEventToCard(event: BackendEvent): TimelineDisplayCard {
  const payload: PayloadWithTitle =
    event.payload && typeof event.payload === 'object' ? event.payload : {};

  const category = eventTypeToCategory(event.type);
  const severity = (payload.severity as TimelineDisplayCard['severity']) ?? 'info';

  return {
    id: event.id,
    category,
    title: payload.title ?? event.type.replace(/[._]/g, ' '),
    summary: payload.summary ?? '',
    timestamp: event.createdAt,
    severity,
    chips: extractChips(event.type, payload),
    filePath: payload.path ?? payload.file ?? payload.repoPath,
    diffPreview: payload.diff ?? payload.patch,
  };
}

/**
 * Map an array of backend events to TimelineDisplayCards.
 */
export function mapEventsToCards(events: BackendEvent[]): TimelineDisplayCard[] {
  return events.map(mapEventToCard);
}
