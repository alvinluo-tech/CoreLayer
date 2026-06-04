/**
 * Natural language time expression parser for Chinese.
 * Converts expressions like "每天早上9点" into cron expressions.
 */

/** Parse a Chinese NL time expression into a cron string. Returns null if unparseable. */
export function parseNlTimeToCron(input: string): string | null {
  const text = input.trim().toLowerCase();

  // ---- Relative time (from now) ----
  // "5分钟后", "30秒后", "2小时后"
  const relativeMatch = text.match(
    /^(\d+)\s*(秒|分钟|分|小时|天|周)[后以]?/
  );
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]!);
    const unit = relativeMatch[2]!;
    const now = new Date();

    if (unit === "秒") {
      now.setSeconds(now.getSeconds() + amount);
    } else if (unit === "分钟" || unit === "分") {
      now.setMinutes(now.getMinutes() + amount);
    } else if (unit === "小时") {
      now.setHours(now.getHours() + amount);
    } else if (unit === "天") {
      now.setDate(now.getDate() + amount);
    } else if (unit === "周") {
      now.setDate(now.getDate() + amount * 7);
    }

    // One-shot: return exact time as cron
    return `${now.getMinutes()} ${now.getHours()} ${now.getDate()} ${now.getMonth() + 1} *`;
  }

  // ---- Absolute daily patterns ----
  // "每天早上9点", "每天下午3:30", "每天晚上10点"
  const dailyMatch = text.match(
    /每天\s*(凌晨|早上|上午|中午|下午|傍晚|晚上|晚)?\s*(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/
  );
  if (dailyMatch) {
    const period = dailyMatch[1] ?? "";
    let hour = parseInt(dailyMatch[2]!);
    const minute = dailyMatch[3] ? parseInt(dailyMatch[3]) : 0;

    // Adjust for Chinese period words
    if (["下午", "傍晚", "晚上", "晚"].includes(period) && hour < 12) {
      hour += 12;
    } else if (period === "中午" && hour === 12) {
      // noon stays 12
    } else if (period === "凌晨" && hour === 12) {
      hour = 0;
    }

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${minute} ${hour} * * *`;
    }
  }

  // ---- Weekly patterns ----
  // "每周一早上9点", "每周三下午2点"
  const weekdayMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 0, 日: 0, 天: 0,
  };
  const weeklyMatch = text.match(
    /每周([一二三四五六日天])\s*(凌晨|早上|上午|中午|下午|傍晚|晚上|晚)?\s*(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/
  );
  if (weeklyMatch) {
    const dow = weekdayMap[weeklyMatch[1]!];
    const period = weeklyMatch[2] ?? "";
    let hour = parseInt(weeklyMatch[3]!);
    const minute = weeklyMatch[4] ? parseInt(weeklyMatch[4]) : 0;

    if (["下午", "傍晚", "晚上", "晚"].includes(period) && hour < 12) {
      hour += 12;
    }

    if (dow !== undefined && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${minute} ${hour} * * ${dow}`;
    }
  }

  // ---- Monthly patterns ----
  // "每月1号早上9点", "每月15日下午3点"
  const monthlyMatch = text.match(
    /每月(\d{1,2})[号日]\s*(凌晨|早上|上午|中午|下午|傍晚|晚上|晚)?\s*(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/
  );
  if (monthlyMatch) {
    const dom = parseInt(monthlyMatch[1]!);
    const period = monthlyMatch[2] ?? "";
    let hour = parseInt(monthlyMatch[3]!);
    const minute = monthlyMatch[4] ? parseInt(monthlyMatch[4]) : 0;

    if (["下午", "傍晚", "晚上", "晚"].includes(period) && hour < 12) {
      hour += 12;
    }

    if (dom >= 1 && dom <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${minute} ${hour} ${dom} * *`;
    }
  }

  // ---- Interval patterns ----
  // "每5分钟", "每2小时"
  const intervalMatch = text.match(/每(\d+)\s*(秒|分钟|分|小时|天)/);
  if (intervalMatch) {
    const amount = parseInt(intervalMatch[1]!);
    const unit = intervalMatch[2]!;

    if (unit === "秒") {
      return `*/${amount} * * * *`;
    } else if (unit === "分钟" || unit === "分") {
      return `*/${amount} * * * *`;
    } else if (unit === "小时") {
      return `0 */${amount} * * *`;
    } else if (unit === "天") {
      return `0 0 */${amount} * *`;
    }
  }

  return null;
}
