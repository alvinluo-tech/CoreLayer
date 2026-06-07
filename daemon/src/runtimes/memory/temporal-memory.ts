export interface TimeClue {
  original: string;
  type: string;
}

export interface DateTimeRange {
  start: string;
  end: string;
}

// Time clue patterns (Chinese relative time expressions)
const TIME_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /去年/g, type: "last_year" },
  { pattern: /今年/g, type: "this_year" },
  { pattern: /上个?月/g, type: "last_month" },
  { pattern: /这个?月/g, type: "this_month" },
  { pattern: /上(周|星期|礼拜)/g, type: "last_week" },
  { pattern: /这(周|星期|礼拜)/g, type: "this_week" },
  { pattern: /昨天/g, type: "yesterday" },
  { pattern: /今天/g, type: "today" },
  { pattern: /明天/g, type: "tomorrow" },
  { pattern: /(\d+)天前/g, type: "days_ago" },
  { pattern: /(\d+)天后/g, type: "days_later" },
  { pattern: /(\d+)月(\d+)日?/g, type: "specific_date" },
];

export function extractTimeClues(message: string): TimeClue[] {
  const clues: TimeClue[] = [];
  for (const { pattern, type } of TIME_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(message)) !== null) {
      clues.push({ original: match[0], type });
    }
  }
  return clues;
}

export function mapToDateTimeRange(original: string, now: Date = new Date()): DateTimeRange {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // Check specific patterns with captured groups
  const daysAgoMatch = original.match(/^(\d+)天前$/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    const target = new Date(today);
    target.setDate(target.getDate() - days);
    return toDayRange(target);
  }

  const daysLaterMatch = original.match(/^(\d+)天后$/);
  if (daysLaterMatch) {
    const days = parseInt(daysLaterMatch[1], 10);
    const target = new Date(today);
    target.setDate(target.getDate() + days);
    return toDayRange(target);
  }

  const specificDateMatch = original.match(/^(\d+)月(\d+)日?$/);
  if (specificDateMatch) {
    const month = parseInt(specificDateMatch[1], 10) - 1;
    const day = parseInt(specificDateMatch[2], 10);
    const target = new Date(Date.UTC(today.getUTCFullYear(), month, day));
    return toDayRange(target);
  }

  // Relative patterns
  switch (original) {
    case "今天":
      return toDayRange(today);
    case "昨天": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return toDayRange(d);
    }
    case "明天": {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return toDayRange(d);
    }
    case "这周":
    case "这星期":
    case "这礼拜": {
      const start = getWeekStart(today);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start: toISO(start), end: toEndOfDay(end) };
    }
    case "上周":
    case "上星期":
    case "上礼拜": {
      const start = getWeekStart(today);
      start.setUTCDate(start.getUTCDate() - 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start: toISO(start), end: toEndOfDay(end) };
    }
    case "这个月": {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 0));
      return { start: toISO(start), end: toEndOfDay(end) };
    }
    case "上个月":
    case "上月": {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0));
      return { start: toISO(start), end: toEndOfDay(end) };
    }
    case "今年": {
      const y = today.getUTCFullYear();
      const start = new Date(Date.UTC(y, 0, 1));
      const end = new Date(Date.UTC(y, 11, 31));
      return { start: toISO(start), end: toEndOfDay(end) };
    }
    case "去年": {
      const y = today.getUTCFullYear() - 1;
      const start = new Date(Date.UTC(y, 0, 1));
      const end = new Date(Date.UTC(y, 11, 31));
      return { start: toISO(start), end: toEndOfDay(end) };
    }
    default:
      // Fallback: treat as today
      return toDayRange(today);
  }
}

function toDayRange(d: Date): DateTimeRange {
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { start: toISO(start), end: toISO(end) };
}

function toISO(d: Date): string {
  return d.toISOString();
}

function toEndOfDay(d: Date): string {
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return toISO(end);
}

function getWeekStart(d: Date): Date {
  const result = new Date(d);
  const day = result.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  result.setUTCDate(result.getUTCDate() - diff);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}
