export interface ArticleRow {
  id: string;
  userId: string;
  url: string | null;
  title: string;
  description: string | null;
  status: "unread" | "reading" | "finished";
  rating: number | null;
  notes: string | null;
  category: string | null;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateArticleInput {
  title: string;
  url?: string;
  description?: string;
  category?: string;
}

export interface ArticleFilters {
  status?: string;
  category?: string;
  limit?: number;
}

export interface UpdateArticleData {
  status?: string;
  rating?: number;
  notes?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ArticleRepository {
  create(input: CreateArticleInput): Promise<ArticleRow>;
  list(filters?: ArticleFilters): Promise<ArticleRow[]>;
  getById(id: string): Promise<ArticleRow | null>;
  update(id: string, data: UpdateArticleData): Promise<ArticleRow>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<number>;
}
