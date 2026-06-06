import { useEffect } from 'react';
import { BookOpen, CheckCircle2, Eye } from 'lucide-react';
import { useArticleStore } from '@/stores/articleStore';

type ArticleStatus = 'finished' | 'reading' | 'unread';

const statusConfig: Record<ArticleStatus, { icon: React.ReactNode; color: string; label: string }> =
  {
    finished: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      color: 'var(--emerald)',
      label: 'DONE',
    },
    reading: { icon: <Eye className="h-3 w-3" />, color: 'var(--amber)', label: 'WIP' },
    unread: { icon: <BookOpen className="h-3 w-3" />, color: 'var(--text-tertiary)', label: 'NEW' },
  };

function getStatus(key: string): { icon: React.ReactNode; color: string; label: string } {
  return statusConfig[key as ArticleStatus] ?? statusConfig.unread;
}

export function ReadingList() {
  const { articles, isLoading, error, fetchArticles } = useArticleStore();

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const unreadCount = articles.filter((a) => a.status === 'unread').length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--violet)' }} />
          <h4
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            Reading
          </h4>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: unreadCount > 0 ? 'var(--violet)' : 'var(--text-tertiary)',
          }}
        >
          {unreadCount} unread
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {error && !isLoading ? (
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--rose)',
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            {error}
          </p>
        ) : isLoading && articles.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            LOADING...
          </p>
        ) : articles.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              padding: '12px 0',
            }}
          >
            NO ARTICLES
          </p>
        ) : (
          <div className="space-y-1">
            {articles.slice(0, 5).map((article) => {
              const s = getStatus(article.status);
              return (
                <div
                  key={article.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
                >
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <span
                    className="flex-1 truncate"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {article.title}
                  </span>
                  {article.category && (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 9,
                        color: 'var(--text-tertiary)',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        border: '1px solid var(--glass-border)',
                      }}
                    >
                      {article.category}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 9,
                      color: s.color,
                      opacity: 0.7,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
            {articles.length > 5 && (
              <p
                className="text-center pt-1"
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                }}
              >
                +{articles.length - 5} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
