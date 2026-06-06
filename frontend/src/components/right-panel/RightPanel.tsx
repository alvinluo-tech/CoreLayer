import { useState } from 'react';
import { CheckCircle2, Circle, BookOpen, Brain, ListTodo, ArrowUpRight } from 'lucide-react';
import { useConversationStore } from '@/stores/conversationStore';
import { useModelStore } from '@/stores/modelStore';
import { useTaskStore } from '@/stores/taskStore';
import { useArticleStore } from '@/stores/articleStore';
import { useReviewStore } from '@/stores/reviewStore';
import { useToastStore } from '@/stores/toastStore';

type RightPanelView = 'default' | 'todo' | 'reading';

interface RightPanelProps {
  onViewChange?: (view: RightPanelView) => void;
}

const viewTabs: { key: RightPanelView; label: string }[] = [
  { key: 'default', label: 'System' },
  { key: 'todo', label: 'Tasks' },
  { key: 'reading', label: 'Reading' },
];

function SessionCard() {
  const conversations = useConversationStore((s) => s.conversations);
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const activeProfile = useModelStore((s) => s.activeModelProfile);

  const conversation = conversations.find((c) => c.id === activeConversationId);

  if (!conversation) {
    return (
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>Session</span>
          <span
            style={{
              ...statusBadgeStyle,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--glass-border)',
            }}
          >
            IDLE
          </span>
        </div>
        <div style={{ padding: '8px 0', textAlign: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
            }}
          >
            Start a conversation to see session info
          </span>
        </div>
      </div>
    );
  }

  const totalTokens = conversation.promptTokens + conversation.completionTokens;
  const contextWindow = activeProfile?.limits.contextWindow ?? 128000;
  const tokenPct = Math.min((totalTokens / contextWindow) * 100, 100);

  const costPerInput = activeProfile?.cost.input ?? 0;
  const costPerOutput = activeProfile?.cost.output ?? 0;
  const cost =
    (conversation.promptTokens * costPerInput + conversation.completionTokens * costPerOutput) /
    1000;

  const durationMs =
    new Date(conversation.updatedAt).getTime() - new Date(conversation.createdAt).getTime();
  const durationSec = Math.floor(durationMs / 1000);
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const modelName = activeProfile?.displayName ?? conversation.modelUsed;

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>Session</span>
        <span
          style={{
            ...statusBadgeStyle,
            color: 'var(--emerald)',
            background: 'rgba(0,230,138,0.08)',
            border: '1px solid rgba(0,230,138,0.15)',
          }}
        >
          ACTIVE
        </span>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontFamily: 'var(--font-hud)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {conversation.title || 'Untitled Session'}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--cyan)',
              letterSpacing: 0.5,
            }}
          >
            {modelName}
          </span>
          <span
            style={{
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: 'var(--glass-border)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
            }}
          >
            {conversation.messageCount} messages
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={kvRowStyle}>
          <span style={kvLabelStyle}>Tokens</span>
          <span style={kvValueStyle}>
            {totalTokens.toLocaleString()} / {contextWindow.toLocaleString()}
          </span>
        </div>
        <div
          style={{
            height: 3,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.04)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 2,
              background: tokenPct > 80 ? 'var(--rose)' : 'var(--cyan)',
              transition: 'width 0.5s ease',
              width: `${tokenPct}%`,
            }}
          />
        </div>
        <div style={kvRowStyle}>
          <span style={kvLabelStyle}>Cost</span>
          <span style={{ ...kvValueStyle, color: 'var(--amber)' }}>${cost.toFixed(3)}</span>
        </div>
        <div style={kvRowStyle}>
          <span style={kvLabelStyle}>Duration</span>
          <span style={kvValueStyle}>{durationStr}</span>
        </div>
      </div>
    </div>
  );
}

function TodayOverviewCard() {
  const dailySummary = useReviewStore((s) => s.dailySummary);

  const tasksDone = dailySummary?.tasksCompleted ?? 0;
  const tasksTotal = dailySummary?.tasksTotal ?? 0;
  const articlesRead = dailySummary?.articlesRead ?? 0;
  const progress = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>Today</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          textAlign: 'center',
          padding: '4px 0',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--cyan)',
            }}
          >
            {tasksDone}/{tasksTotal}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>
            TASKS
          </div>
        </div>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--blue)',
            }}
          >
            {articlesRead}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>
            READS
          </div>
        </div>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-hud)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--emerald)',
            }}
          >
            {tasksDone}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: 0.5 }}>DONE</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Progress</span>
        <div
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.04)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 2,
              background: 'var(--cyan)',
              transition: 'width 0.5s ease',
              width: `${progress}%`,
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: 0.5,
          }}
        >
          {progress}%
        </span>
      </div>
    </div>
  );
}

function MemoryCard() {
  const addToast = useToastStore((s) => s.addToast);

  const memories = [
    {
      icon: '🧠',
      text: 'Prefers v2 sci-fi aesthetic over v3 clean style',
      time: '2h ago',
      color: 'cyan' as const,
    },
    {
      icon: '⚡',
      text: 'AI SDK v6 uses input/output not args/result',
      time: '1d ago',
      color: 'violet' as const,
    },
    {
      icon: '📌',
      text: 'Each phase merges to main after tests pass',
      time: '3d ago',
      color: 'emerald' as const,
    },
  ];

  const colorMap = {
    cyan: { bg: 'rgba(0,212,255,0.03)', border: 'rgba(0,212,255,0.06)' },
    violet: { bg: 'rgba(167,139,250,0.03)', border: 'rgba(167,139,250,0.06)' },
    emerald: { bg: 'rgba(0,230,138,0.03)', border: 'rgba(0,230,138,0.06)' },
  };

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>Memory</span>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: 0.5,
          }}
        >
          recent
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {memories.map((m, i) => {
          const c = colorMap[m.color];
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 'var(--r-sm)',
                background: c.bg,
                border: `1px solid ${c.border}`,
              }}
            >
              <span style={{ fontSize: 10, flexShrink: 0, marginTop: 1 }}>{m.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {m.text}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 8,
                    color: 'var(--text-tertiary)',
                    marginTop: 2,
                  }}
                >
                  {m.time}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => addToast('info', 'Memory', 'Full memory search coming soon')}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '6px 0',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--glass-border)',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-hud)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.5,
          cursor: 'pointer',
          transition: 'all 0.2s',
          textTransform: 'uppercase',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--cyan)';
          e.currentTarget.style.color = 'var(--cyan)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--glass-border)';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        View All Memories
      </button>
    </div>
  );
}

function QuickActionsCard({ onSwitchView }: { onSwitchView: (v: RightPanelView) => void }) {
  const addToast = useToastStore((s) => s.addToast);

  const actions = [
    { icon: <ListTodo size={12} />, label: 'Tasks', action: () => onSwitchView('todo') },
    { icon: <BookOpen size={12} />, label: 'Reading', action: () => onSwitchView('reading') },
    {
      icon: <ArrowUpRight size={12} />,
      label: 'Add Task',
      action: () => addToast('info', 'Add Task', 'Task editor coming soon'),
    },
    {
      icon: <Brain size={12} />,
      label: 'Memory',
      action: () => addToast('info', 'Memory', 'Full memory search coming soon'),
    },
  ];

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>Quick Actions</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.action}
            style={{
              padding: 8,
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-bg)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
              fontFamily: 'Exo 2, sans-serif',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--cyan)';
              e.currentTarget.style.color = 'var(--cyan)';
              e.currentTarget.style.boxShadow = '0 0 8px var(--cyan-glow)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TodoPanel() {
  const tasks = useTaskStore((s) => s.tasks);

  const todayTasks = tasks.filter((t) => t.status !== 'deleted');

  const pendingTasks = todayTasks.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  );
  const doneTasks = todayTasks.filter((t) => t.status === 'done');

  const priorityColors: Record<number, string> = {
    1: 'var(--rose)',
    2: 'var(--amber)',
    3: 'var(--text-tertiary)',
    4: 'var(--text-tertiary)',
    5: 'var(--text-tertiary)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={cardTitleStyle}>Today's Tasks</span>
          <span
            style={{
              ...statusBadgeStyle,
              color: 'var(--cyan)',
              background: 'var(--cyan-subtle)',
              border: '1px solid rgba(0,212,255,0.1)',
            }}
          >
            {doneTasks.length}/{todayTasks.length}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {todayTasks.length === 0 && (
            <div
              style={{
                padding: '16px 0',
                textAlign: 'center',
                fontFamily: 'var(--font-data)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              No tasks yet
            </div>
          )}
          {todayTasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                borderRadius: 'var(--r-sm)',
                transition: 'background 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,212,255,0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {task.status === 'done' ? (
                <CheckCircle2 size={14} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
              ) : (
                <Circle size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                }}
              >
                {task.title}
              </span>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: priorityColors[task.priority] ?? 'var(--text-tertiary)',
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.04)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: 'var(--cyan)',
                transition: 'width 0.5s ease',
                width: `${todayTasks.length > 0 ? (doneTasks.length / todayTasks.length) * 100 : 0}%`,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              letterSpacing: 0.5,
            }}
          >
            {todayTasks.length > 0 ? Math.round((doneTasks.length / todayTasks.length) * 100) : 0}%
          </span>
        </div>
      </div>

      {pendingTasks.length > 0 && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>Upcoming</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  borderRadius: 'var(--r-sm)',
                  transition: 'background 0.15s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0,212,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Circle size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {task.title}
                </span>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: priorityColors[task.priority] ?? 'var(--text-tertiary)',
                    flexShrink: 0,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadingPanel() {
  const articles = useArticleStore((s) => s.articles);

  type ArticleStatus = 'unread' | 'reading' | 'finished';
  const statusLabels: Record<
    ArticleStatus,
    { label: string; color: string; bg: string; border: string }
  > = {
    unread: {
      label: 'NEW',
      color: 'var(--cyan)',
      bg: 'var(--cyan-subtle)',
      border: 'rgba(0,212,255,0.1)',
    },
    reading: {
      label: 'WIP',
      color: 'var(--amber)',
      bg: 'rgba(255,184,0,0.08)',
      border: 'rgba(255,184,0,0.15)',
    },
    finished: {
      label: 'DONE',
      color: 'var(--emerald)',
      bg: 'rgba(0,230,138,0.08)',
      border: 'rgba(0,230,138,0.15)',
    },
  };
  const getDefaultStatus = (key: string) =>
    statusLabels[key as ArticleStatus] ?? statusLabels.unread;

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>Reading List</span>
        <span
          style={{
            ...statusBadgeStyle,
            color: 'var(--cyan)',
            background: 'var(--cyan-subtle)',
            border: '1px solid rgba(0,212,255,0.1)',
          }}
        >
          {articles.length} items
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {articles.length === 0 && (
          <div
            style={{
              padding: '16px 0',
              textAlign: 'center',
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
            }}
          >
            No articles yet
          </div>
        )}
        {articles.map((article) => {
          const s = getDefaultStatus(article.status);
          return (
            <div
              key={article.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                borderRadius: 'var(--r-sm)',
                transition: 'background 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,212,255,0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <BookOpen size={14} style={{ color: 'var(--violet)', flexShrink: 0 }} />
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {article.title}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 8,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: s.bg,
                  color: s.color,
                  border: `1px solid ${s.border}`,
                  letterSpacing: 0.5,
                  flexShrink: 0,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RightPanel({ onViewChange }: RightPanelProps) {
  const [view, setView] = useState<RightPanelView>('default');

  const handleSwitch = (v: RightPanelView) => {
    setView(v);
    onViewChange?.(v);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '8px 14px',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {viewTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleSwitch(tab.key)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              background: view === tab.key ? 'rgba(0,212,255,0.1)' : 'transparent',
              color: view === tab.key ? 'var(--cyan)' : 'var(--text-tertiary)',
              fontFamily: 'var(--font-hud)',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {view === 'default' && (
          <>
            <SessionCard />
            <TodayOverviewCard />
            <MemoryCard />
            <QuickActionsCard onSwitchView={handleSwitch} />
          </>
        )}
        {view === 'todo' && <TodoPanel />}
        {view === 'reading' && <ReadingPanel />}
      </div>
    </div>
  );
}

// ---- Shared styles ----

const cardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 'var(--r-lg)',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(16px)',
  transition: 'all 0.3s',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const cardTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-hud)',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 1.5,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
};

const statusBadgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 9,
  letterSpacing: 1,
  padding: '2px 8px',
  borderRadius: 20,
};

const kvRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const kvLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
};

const kvValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 10,
  color: 'var(--text-secondary)',
  letterSpacing: 0.5,
};
