import { create } from 'zustand';
import type { Article, AddArticleInput, UpdateReadingStatusInput } from '@/types/article';
import * as tauri from '@/lib/tauri';

interface ArticleState {
  articles: Article[];
  isLoading: boolean;
  error: string | null;
  fetchArticles: () => Promise<void>;
  addArticle: (input: AddArticleInput) => Promise<Article | null>;
  updateStatus: (input: UpdateReadingStatusInput) => Promise<Article | null>;
}

export const useArticleStore = create<ArticleState>((set) => ({
  articles: [],
  isLoading: false,
  error: null,

  fetchArticles: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await tauri.getReadingList();
      set({ articles: result.articles, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  addArticle: async (input) => {
    try {
      const result = await tauri.addArticle(input);
      const article = result.article;
      set((state) => ({ articles: [...state.articles, article] }));
      return article;
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },

  updateStatus: async (input) => {
    try {
      const result = await tauri.updateReadingStatus(input);
      const article = result.article;
      set((state) => ({
        articles: state.articles.map((a) => (a.id === input.articleId ? article : a)),
      }));
      return article;
    } catch (error) {
      set({ error: String(error) });
      return null;
    }
  },
}));
