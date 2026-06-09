import type { ApprovalRequest, ApprovalRisk } from '@/stores/approvalStore';

export const riskColors: Record<ApprovalRisk, string> = {
  low: 'var(--text-tertiary)',
  medium: 'var(--amber)',
  high: 'var(--red)',
  critical: 'var(--red)',
};

export const riskLabels: Record<ApprovalRisk, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function formatArgs(args: unknown): string {
  if (!args) return '';
  if (typeof args === 'string') return args;
  try {
    const str = JSON.stringify(args);
    return str.length > 120 ? str.slice(0, 120) + '...' : str;
  } catch {
    return String(args);
  }
}

export type ListItem =
  | { type: 'single'; data: ApprovalRequest }
  | { type: 'batch'; runId: string; approvals: ApprovalRequest[] };

export function groupPendingApprovals(list: ApprovalRequest[]): ListItem[] {
  const pendingGroups: Record<string, ApprovalRequest[]> = {};
  const processedList: ListItem[] = [];

  for (const item of list) {
    if (item.status === 'pending' && item.runId) {
      const group = pendingGroups[item.runId] ?? [];
      group.push(item);
      pendingGroups[item.runId] = group;
    } else {
      processedList.push({ type: 'single', data: item });
    }
  }

  for (const [runId, group] of Object.entries(pendingGroups)) {
    if (group.length > 1) {
      processedList.push({ type: 'batch', runId, approvals: group });
    } else if (group.length === 1 && group[0]) {
      processedList.push({ type: 'single', data: group[0] });
    }
  }

  return processedList;
}
