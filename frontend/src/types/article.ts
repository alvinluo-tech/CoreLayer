export type ArticleStatus = 'unread' | 'reading' | 'finished';

export interface Article {
  id: string;
  userId: string;
  url: string | null;
  title: string;
  description: string | null;
  status: ArticleStatus;
  rating: number | null; // 1-5
  notes: string | null;
  category: string | null;
  addedAt: string; // ISO datetime
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AddArticleInput {
  url?: string;
  title: string;
  category?: string;
  description?: string;
}

export interface UpdateReadingStatusInput {
  articleId: string;
  status: ArticleStatus;
  rating?: number;
  notes?: string;
}
