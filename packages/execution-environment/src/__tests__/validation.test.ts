import { describe, it, expect } from 'vitest';
import {
  validateSessionRequest,
  validateActionRequest,
  type EnvironmentSessionRequest,
  type ActionRequest,
  type ExecutionEnvironment,
} from '../index.js';

describe('Validation', () => {
  describe('validateSessionRequest', () => {
    it('should pass for valid request', () => {
      const request: EnvironmentSessionRequest = {
        workspaceId: 'ws-1',
        runId: 'run-1',
        agentId: 'agent-1',
        environmentKind: 'git-worktree',
      };
      const errors = validateSessionRequest(request);
      expect(errors).toHaveLength(0);
    });

    it('should fail when workspaceId is missing', () => {
      const errors = validateSessionRequest({
        workspaceId: '',
        runId: 'run-1',
        agentId: 'agent-1',
        environmentKind: 'git-worktree',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('workspaceId');
    });

    it('should fail when runId is missing', () => {
      const errors = validateSessionRequest({
        workspaceId: 'ws-1',
        runId: '',
        agentId: 'agent-1',
        environmentKind: 'git-worktree',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('runId');
    });

    it('should fail when agentId is missing', () => {
      const errors = validateSessionRequest({
        workspaceId: 'ws-1',
        runId: 'run-1',
        agentId: '',
        environmentKind: 'git-worktree',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('agentId');
    });

    it('should fail when environmentKind is missing', () => {
      const errors = validateSessionRequest({
        workspaceId: 'ws-1',
        runId: 'run-1',
        agentId: 'agent-1',
        environmentKind: '',
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('environmentKind');
    });

    it('should collect multiple errors', () => {
      const errors = validateSessionRequest({
        workspaceId: '',
        runId: '',
        agentId: '',
        environmentKind: '',
      });
      expect(errors).toHaveLength(4);
    });
  });

  describe('validateActionRequest', () => {
    it('should pass for valid action', () => {
      const action: ActionRequest = { kind: 'shell', parameters: { command: 'ls' } };
      const errors = validateActionRequest(action);
      expect(errors).toHaveLength(0);
    });

    it('should fail when kind is missing', () => {
      const errors = validateActionRequest({ kind: '' });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('kind');
    });
  });
});

describe('Non-coding environment examples', () => {
  it('should support BrowserSessionEnvironment (research)', () => {
    // Demonstrates that ExecutionEnvironment is domain-agnostic
    const researchEnv: ExecutionEnvironment = {
      kind: 'browser-session',

      async createSession(request) {
        return {
          id: 'session-1',
          environmentKind: 'browser-session',
          state: 'ready',
          workingDirectory: null,
          workspaceId: request.workspaceId,
          runId: request.runId,
          agentId: request.agentId,
          createdAt: new Date().toISOString(),
        };
      },

      async getSession() {
        return null;
      },

      async executeAction(_sessionId, action) {
        if (action.kind === 'navigate') {
          return { success: true, kind: 'navigate', data: { url: action.parameters?.url } };
        }
        if (action.kind === 'scrape') {
          return { success: true, kind: 'scrape', data: { content: 'page content' } };
        }
        return { success: false, kind: action.kind, error: 'Unknown action' };
      },

      async readFile() {
        throw new Error('Browser environments do not support file reads');
      },

      async writeFile() {
        throw new Error('Browser environments do not support file writes');
      },

      async collectArtifacts() {
        return [];
      },

      async dispose() {},
    };

    expect(researchEnv.kind).toBe('browser-session');
    expect(researchEnv.executeCommand).toBeUndefined(); // No shell access
  });

  it('should support ImageWorkspaceEnvironment (image generation)', () => {
    const imageEnv: ExecutionEnvironment = {
      kind: 'image-workspace',

      async createSession(request) {
        return {
          id: 'session-2',
          environmentKind: 'image-workspace',
          state: 'ready',
          workingDirectory: '/tmp/images',
          workspaceId: request.workspaceId,
          runId: request.runId,
          agentId: request.agentId,
          createdAt: new Date().toISOString(),
        };
      },

      async getSession() {
        return null;
      },

      async executeAction(_sessionId, action) {
        if (action.kind === 'render') {
          return {
            success: true,
            kind: 'render',
            data: { path: '/tmp/images/output.png' },
          };
        }
        return { success: false, kind: action.kind, error: 'Unknown action' };
      },

      async readFile(_sessionId, path) {
        return { path, content: 'binary-data', encoding: 'binary', size: 1024 };
      },

      async writeFile(_sessionId, path, content) {
        return { path, bytesWritten: content.length };
      },

      async collectArtifacts() {
        return [
          {
            id: 'artifact-1',
            kind: 'image',
            content: '/tmp/images/output.png',
            summary: 'Generated image',
            metadata: { format: 'png', width: 1024, height: 768 },
            createdAt: new Date().toISOString(),
          },
        ];
      },

      async dispose() {},
    };

    expect(imageEnv.kind).toBe('image-workspace');
    expect(imageEnv.executeCommand).toBeUndefined(); // No shell access
  });

  it('should support MessageDraftEnvironment (messaging)', () => {
    const messagingEnv: ExecutionEnvironment = {
      kind: 'message-draft',

      async createSession(request) {
        return {
          id: 'session-3',
          environmentKind: 'message-draft',
          state: 'ready',
          workingDirectory: null,
          workspaceId: request.workspaceId,
          runId: request.runId,
          agentId: request.agentId,
          createdAt: new Date().toISOString(),
        };
      },

      async getSession() {
        return null;
      },

      async executeAction(_sessionId, action) {
        if (action.kind === 'draft') {
          return {
            success: true,
            kind: 'draft',
            data: { content: 'Dear team, ...' },
          };
        }
        if (action.kind === 'tone-check') {
          return {
            success: true,
            kind: 'tone-check',
            data: { score: 0.9, suggestions: [] },
          };
        }
        return { success: false, kind: action.kind, error: 'Unknown action' };
      },

      async readFile() {
        throw new Error('Messaging environments do not support file reads');
      },

      async writeFile() {
        throw new Error('Messaging environments do not support file writes');
      },

      async collectArtifacts() {
        return [
          {
            id: 'artifact-2',
            kind: 'draft',
            content: 'Dear team, ...',
            summary: 'Professional email draft',
            metadata: { tone: 'professional', wordCount: 150 },
            createdAt: new Date().toISOString(),
          },
        ];
      },

      async dispose() {},
    };

    expect(messagingEnv.kind).toBe('message-draft');
  });

  it('should support DesktopSessionEnvironment (desktop control)', () => {
    const desktopEnv: ExecutionEnvironment = {
      kind: 'desktop-session',

      async createSession(request) {
        return {
          id: 'session-4',
          environmentKind: 'desktop-session',
          state: 'ready',
          workingDirectory: null,
          workspaceId: request.workspaceId,
          runId: request.runId,
          agentId: request.agentId,
          createdAt: new Date().toISOString(),
        };
      },

      async getSession() {
        return null;
      },

      async executeAction(_sessionId, action) {
        if (action.kind === 'click') {
          return { success: true, kind: 'click', data: { x: 100, y: 200 } };
        }
        if (action.kind === 'screenshot') {
          return { success: true, kind: 'screenshot', data: { path: '/tmp/screenshot.png' } };
        }
        return { success: false, kind: action.kind, error: 'Unknown action' };
      },

      async readFile() {
        throw new Error('Desktop environments do not support file reads');
      },

      async writeFile() {
        throw new Error('Desktop environments do not support file writes');
      },

      async collectArtifacts() {
        return [];
      },

      async dispose() {},
    };

    expect(desktopEnv.kind).toBe('desktop-session');
  });
});
