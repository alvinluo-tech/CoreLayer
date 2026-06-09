import { invoke } from '@tauri-apps/api/core';
import type { Article } from '@/types/article';

export async function getReadingList(options?: {
  status?: string;
  category?: string;
}): Promise<{ articles: Article[]; count: number }> {
  return invoke('get_reading_list', {
    status: options?.status ?? null,
    category: options?.category ?? null,
  });
}

export async function addArticle(input: {
  title: string;
  url?: string;
  category?: string;
  description?: string;
}): Promise<{ article: Article }> {
  return invoke('add_article', {
    title: input.title,
    url: input.url ?? null,
    category: input.category ?? null,
    description: input.description ?? null,
  });
}

export async function updateReadingStatus(input: {
  articleId: string;
  status: string;
  rating?: number;
  notes?: string;
}): Promise<{ article: Article }> {
  return invoke('update_reading_status', {
    articleId: input.articleId,
    status: input.status,
    rating: input.rating ?? null,
    notes: input.notes ?? null,
  });
}
