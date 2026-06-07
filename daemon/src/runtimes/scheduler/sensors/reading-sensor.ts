import type { Sensor, SensorChange } from "./types.js";
import { getRepositories } from "../../../db/factory.js";

/**
 * Reading list sensor — polls the article repository for changes.
 * Detects new articles, status transitions, and reading progress.
 */
export interface ReadingSensorOptions {
  /** Check interval in ms (default 120000) */
  intervalMs?: number;
}

export function createReadingSensor(options: ReadingSensorOptions = {}): Sensor {
  let lastSnapshot: string | null = null;

  return {
    name: "reading",
    interval: options.intervalMs ?? 120_000,

    async check(): Promise<SensorChange[] | null> {
      try {
        const repos = getRepositories();
        const articles = await repos.articles.list();

        // Build a snapshot string for change detection
        const snapshot = JSON.stringify(
          articles
            .map((a) => `${a.id}:${a.status}:${a.rating}`)
            .sort()
        );

        if (lastSnapshot === null) {
          lastSnapshot = snapshot;
          return null;
        }

        if (snapshot === lastSnapshot) return null;

        const prevArticles = JSON.parse(lastSnapshot) as string[];
        const prevMap = new Map(prevArticles.map((s) => {
          const [id, status, rating] = s.split(":");
          return [id, { status, rating }];
        }));

        const changes: SensorChange[] = [];

        // Detect new articles
        for (const article of articles) {
          if (!prevMap.has(article.id)) {
            changes.push({
              type: "reading_added",
              detail: `New article: ${article.title}`,
            });
          }
        }

        // Detect status transitions
        for (const article of articles) {
          const prev = prevMap.get(article.id);
          if (prev && prev.status !== article.status) {
            if (article.status === "finished") {
              changes.push({
                type: "reading_finished",
                detail: `Finished reading: ${article.title}`,
              });
            } else if (article.status === "reading") {
              changes.push({
                type: "reading_started",
                detail: `Started reading: ${article.title}`,
              });
            } else {
              changes.push({
                type: "reading_status_changed",
                detail: `Article "${article.title}" status: ${prev.status} → ${article.status}`,
              });
            }
          }
        }

        lastSnapshot = snapshot;
        return changes.length > 0 ? changes : null;
      } catch {
        return null;
      }
    },
  };
}
