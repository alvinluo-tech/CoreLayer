import { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, CheckCircle2, Eye } from 'lucide-react';
import { useArticleStore } from '@/stores/articleStore';

const statusIcon = {
  finished: <CheckCircle2 className="h-3 w-3 text-green-500" />,
  reading: <Eye className="h-3 w-3 text-yellow-500" />,
  unread: <BookOpen className="h-3 w-3 text-muted-foreground" />,
};

const statusLabel = {
  finished: <Badge variant="secondary">已读</Badge>,
  reading: <Badge variant="default">在读</Badge>,
  unread: <Badge variant="outline">未读</Badge>,
};

export function ReadingList() {
  const { articles, isLoading, error, fetchArticles } = useArticleStore();

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const unreadCount = articles.filter((a) => a.status === 'unread').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">阅读清单</CardTitle>
          <span className="text-xs text-muted-foreground">{unreadCount} 篇未读</span>
        </div>
      </CardHeader>
      <CardContent>
        {error && !isLoading ? (
          <p className="text-xs text-destructive text-center py-4">⚠️ {error}—请尝试刷新页面</p>
        ) : isLoading && articles.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">加载中...</p>
        ) : articles.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">暂无阅读清单</p>
        ) : (
          <div className="space-y-2">
            {articles.map((article) => (
              <div
                key={article.id}
                className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                {statusIcon[article.status as keyof typeof statusIcon]}
                <span className="flex-1 truncate">{article.title}</span>
                {article.category && (
                  <Badge variant="outline" className="text-xs">
                    {article.category}
                  </Badge>
                )}
                {statusLabel[article.status as keyof typeof statusLabel]}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
