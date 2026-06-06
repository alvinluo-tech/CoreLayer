import { useEffect, useRef, useCallback } from 'react';
import { usePaletteStore } from '@/stores/paletteStore';
import {
  Search,
  MessageSquare,
  ListTodo,
  BookOpen,
  BarChart3,
  Mic,
  Settings,
  HelpCircle,
  Activity,
  Brain,
  ShieldCheck,
  FolderKanban,
  Bot,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
}

interface CommandPaletteProps {
  onChat: (message: string) => void;
  onNavigate: (view: string) => void;
  onVoiceToggle: () => void;
}

export function CommandPalette({ onChat, onNavigate, onVoiceToggle }: CommandPaletteProps) {
  const { isOpen, query, selectedIndex, close, setQuery, setSelectedIndex, moveUp, moveDown } =
    usePaletteStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'chat-today',
      label: '今日任务',
      description: '查看今天的待办任务',
      icon: <ListTodo className="h-4 w-4" />,
      action: () => {
        onChat('今天有什么任务？');
        close();
      },
      keywords: ['任务', 'today', 'todo', '待办'],
    },
    {
      id: 'chat-reading',
      label: '阅读清单',
      description: '查看阅读列表',
      icon: <BookOpen className="h-4 w-4" />,
      action: () => {
        onChat('阅读清单有什么？');
        close();
      },
      keywords: ['阅读', 'reading', '文章', 'book'],
    },
    {
      id: 'chat-summary',
      label: '今日总结',
      description: '查看今日任务完成情况',
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => {
        onChat('今日总结');
        close();
      },
      keywords: ['总结', 'summary', '复盘', '统计'],
    },
    {
      id: 'new-chat',
      label: '新建对话',
      description: '开始一个新的对话',
      icon: <MessageSquare className="h-4 w-4" />,
      action: () => {
        onNavigate('new-chat');
        close();
      },
      keywords: ['新建', 'new', 'chat', '对话'],
    },
    {
      id: 'voice',
      label: '语音输入',
      description: '切换语音输入模式',
      icon: <Mic className="h-4 w-4" />,
      action: () => {
        onVoiceToggle();
        close();
      },
      keywords: ['语音', 'voice', 'mic', '说话'],
    },
    {
      id: 'settings',
      label: '控制中心',
      description: '打开系统控制中心',
      icon: <Settings className="h-4 w-4" />,
      action: () => {
        onNavigate('control-center');
        close();
      },
      keywords: ['设置', 'settings', '配置', '控制', 'control'],
    },
    // Navigation commands
    {
      id: 'nav-assistant',
      label: 'Go to Assistant',
      description: '切换到助手对话界面',
      icon: <MessageSquare className="h-4 w-4" />,
      action: () => {
        onNavigate('assistant');
        close();
      },
      keywords: ['assistant', '助手', '对话', 'chat'],
    },
    {
      id: 'nav-tasks',
      label: 'Go to Tasks',
      description: '切换到任务中心',
      icon: <ListTodo className="h-4 w-4" />,
      action: () => {
        onNavigate('tasks');
        close();
      },
      keywords: ['tasks', '任务', '待办', 'todo'],
    },
    {
      id: 'nav-runs',
      label: 'Go to Runs',
      description: '查看 AgentRun 执行记录',
      icon: <Activity className="h-4 w-4" />,
      action: () => {
        onNavigate('runs');
        close();
      },
      keywords: ['runs', '执行', '运行', 'agent run', '历史'],
    },
    {
      id: 'nav-memory',
      label: 'Go to Memory',
      description: '管理记忆',
      icon: <Brain className="h-4 w-4" />,
      action: () => {
        onNavigate('memory');
        close();
      },
      keywords: ['memory', '记忆', 'brain'],
    },
    {
      id: 'nav-approvals',
      label: 'Go to Approvals',
      description: '查看待审批工具调用',
      icon: <ShieldCheck className="h-4 w-4" />,
      action: () => {
        onNavigate('approvals');
        close();
      },
      keywords: ['approvals', '审批', 'permission', '权限'],
    },
    {
      id: 'nav-projects',
      label: 'Go to Projects',
      description: '管理工作区和项目',
      icon: <FolderKanban className="h-4 w-4" />,
      action: () => {
        onNavigate('projects');
        close();
      },
      keywords: ['projects', '项目', 'workspace', '工作区'],
    },
    {
      id: 'nav-agents',
      label: 'Go to Agents',
      description: '查看 Agent 状态和配置',
      icon: <Bot className="h-4 w-4" />,
      action: () => {
        onNavigate('agents');
        close();
      },
      keywords: ['agents', '代理', 'agent', 'bot'],
    },
    {
      id: 'help',
      label: '帮助',
      description: '查看 Jarvis 可以做什么',
      icon: <HelpCircle className="h-4 w-4" />,
      action: () => {
        onChat('帮助');
        close();
      },
      keywords: ['帮助', 'help', '能做什么'],
    },
  ];

  const filtered = query.trim()
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description.toLowerCase().includes(query.toLowerCase()) ||
          cmd.keywords.some((k) => k.includes(query.toLowerCase()))
      )
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, setSelectedIndex]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeSelected = useCallback(() => {
    const item = filtered[selectedIndex];
    if (item) {
      item.action();
    }
  }, [filtered, selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          close();
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveDown();
          break;
        case 'Enter':
          e.preventDefault();
          executeSelected();
          break;
      }
    },
    [close, moveUp, moveDown, executeSelected]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={close}>
      {/* Glass backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          backdropFilter: 'blur(24px)',
          boxShadow: '0 0 24px rgba(0,212,255,0.08), 0 24px 48px rgba(0,0,0,0.4)',
        }}
      >
        {/* Search Input */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <Search className="h-5 w-5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入命令或搜索..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
          />
          <kbd
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              background: 'rgba(255,255,255,0.04)',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid var(--glass-border)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
              <p style={{ fontFamily: 'var(--font-data)', fontSize: 11 }}>没有匹配的命令</p>
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150"
                  style={{
                    background: isSelected ? 'rgba(0,212,255,0.06)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--cyan)' : '2px solid transparent',
                  }}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div
                    className="shrink-0"
                    style={{ color: isSelected ? 'var(--cyan)' : 'var(--text-tertiary)' }}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {item.description}
                    </p>
                  </div>
                  {isSelected && (
                    <kbd
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 10,
                        color: 'var(--cyan)',
                        background: 'rgba(0,212,255,0.06)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(0,212,255,0.15)',
                      }}
                    >
                      Enter
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2"
          style={{
            borderTop: '1px solid var(--glass-border)',
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: 0.5,
          }}
        >
          <span>↑↓ 导航</span>
          <span>↵ 执行</span>
          <span>ESC 关闭</span>
          <span className="ml-auto">Alt+Space 打开</span>
        </div>
      </div>
    </div>
  );
}
