<p align="center">
  <img src="./public/assets/corelayer-hero.png" alt="CoreLayer — powered by Jarvis" width="100%" />
</p>

<br />

<p align="center">
  <img src="./public/assets/icon.png" alt="CoreLayer Icon" width="96" height="96" />
</p>

<h1 align="center">CoreLayer — powered by Jarvis</h1>

<p align="center">
  <strong>A local-first AI execution control layer for agents, tools, and personal workspaces.</strong>
</p>

<p align="center">
  Jarvis is the built-in assistant persona that helps coordinate workspaces, tasks, agents, tools, models, approvals, artifacts, MCP apps, and voice workflows.
</p>

<p align="center">
  Voice-native · MCP-first · Tool-aware · Permission-guarded · Local-first
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB?style=flat-square" />
  <img src="https://img.shields.io/badge/MCP--first-22D3EE?style=flat-square" />
  <img src="https://img.shields.io/badge/Model_Router-enabled-8B5CF6?style=flat-square" />
  <img src="https://img.shields.io/badge/Permission_Guard-enabled-F59E0B?style=flat-square" />
  <img src="https://img.shields.io/badge/Local--first-SQLite-10B981?style=flat-square" />
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README_zh.md">简体中文</a>
</p>

---

## Product Vision

Most AI products still treat work as a chat thread. CoreLayer treats work as an execution system.

You give Jarvis a goal. CoreLayer turns it into a workspace with tasks, agent runs, approvals, artifacts, logs, memory, and runtime state. Coding agents such as Claude Code, Codex, and OpenCode become managed executors inside a local-first control plane instead of unrestricted tools running on your machine.

```text
Goal
  -> Workspace
  -> Task Graph
  -> Agent Runs
  -> Scoped Approvals
  -> Artifacts + Logs
  -> Verified Delivery
```

CoreLayer's long-term direction is a local-first Agent OS: a desktop-native layer for managing agents, tools, model runtimes, permissions, workspaces, memory, and deliverables.

The first practical wedge is coding execution governance:

- **Workspace orchestration** — goals become projects, tasks, agents, timelines, and artifacts.
- **Executor governance** — Claude Code, Codex, and OpenCode are adapter-backed workers with lifecycle tracking.
- **Permission-first runtime** — risky actions create approvals, pending actions, grants, and audit records.
- **Artifact-driven delivery** — durable outputs are separated from logs, transcripts, and status noise.
- **Local-first architecture** — Tauri desktop app, local daemon, SQLite-first storage, MCP extensibility.

---

## What is CoreLayer?

**CoreLayer** is a local-first desktop control plane for AI agents, tools, and personal workspaces.

It is not another AI chat window.
It is a local-first workspace that turns goals into tasks, agent runs, approvals, artifacts, memory, and verifiable execution traces.

The built-in assistant persona is called **Jarvis**.

Jarvis can help you:

- create and manage workspaces from high-level goals
- decompose work into project tasks and agent runs
- coordinate coding executors such as Claude Code, Codex, and OpenCode
- track approvals, artifacts, logs, and run timelines
- control connected personal apps and MCP servers
- call tools safely through permission policies
- route requests across different AI models
- interact through voice with streaming TTS

---

## Why CoreLayer?

AI assistants are powerful, but serious work needs more than a prompt box.

Today, agent work is often hard to trust because:

- tasks disappear into chat history instead of becoming durable project state
- tool calls and shell actions are difficult to inspect or approve consistently
- multiple agents and executors do not share one workspace, memory, or artifact model
- outputs are mixed with logs, permission prompts, and status text
- local coding tools can be useful but need lifecycle, permission, and delivery boundaries

CoreLayer is built around a stricter product idea:

> Jarvis manages the work. Specialized tools execute the work.

That boundary lets CoreLayer coordinate models, agents, MCP tools, coding executors, permissions, artifacts, and memory without becoming locked to one provider or one IDE.

---

## Core Capabilities

<table>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/mcp.svg" width="32" />
      <h3>MCP-first Integration</h3>
      <p>Connect personal apps and external tools through MCP servers.</p>
    </td>
    <td width="50%">
      <img src="./public/assets/icons/registry.svg" width="32" />
      <h3>Workspace Execution</h3>
      <p>Turn goals into workspaces, projects, task graphs, agent runs, and durable artifacts.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/guard.svg" width="32" />
      <h3>Permission Runtime</h3>
      <p>Classify risky actions, request scoped approval, resume pending actions, and keep audit logs.</p>
    </td>
    <td width="50%">
      <img src="./public/assets/icons/models.svg" width="32" />
      <h3>Model Router</h3>
      <p>Route requests across MiMo, Groq, OpenRouter, and local models based on task needs.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/voice.svg" width="32" />
      <h3>Voice Pipeline</h3>
      <p>Wake, listen, transcribe, stream responses, speak back, and support interruption.</p>
    </td>
    <td width="50%">
      <img src="./public/assets/icons/control-center.svg" width="32" />
      <h3>Control Center</h3>
      <p>Manage models, agents, apps, tools, permissions, voice profiles, daemon health, and logs.</p>
    </td>
  </tr>
</table>

---

## Architecture

```text
User goal / voice / shortcut
  ↓
CoreLayer Desktop Workspace (Tauri + React)
  ├─ Workspace UI
  ├─ Task graph and timeline
  ├─ Agent / run / approval / artifact views
  └─ Control Center
  ↓
Jarvis Runtime Daemon (Hono + TypeScript)
  ├─ Workspace Orchestrator
  │   └─ Goal → project spec → tasks → agent assignments
  ├─ Agent Runtime
  │   └─ chat / voice / scheduled / workflow runs
  ├─ Coding Runtime
  │   └─ Claude Code / Codex / OpenCode adapters
  ├─ Permission Runtime
  │   └─ policy decisions → approvals → pending actions → grants
  ├─ Artifact + Log Store
  │   └─ deliverables, execution logs, run events, audit trail
  ├─ Tool Runtime
  │   └─ native tools, MCP tools, skills, REST adapters
  └─ Model Gateway
      └─ MiMo / Groq / OpenRouter / Ollama / OpenAI-compatible
  ↓
Local-first Data Layer
  ├─ SQLite repositories
  ├─ Supabase repositories
  └─ PostgreSQL configuration (experimental)
```

---

## Meet Coreling

<p align="center">
  <img src="./public/assets/coreling.png" alt="Coreling — Jarvis AI Core Companion" width="360" />
</p>

**Coreling** is Jarvis' holographic AI core companion.

It represents the voice-native, MCP-first, permission-aware command layer behind CoreLayer.

Coreling is not the product logo.
The product identity is the **CoreLayer control system**.
Coreling is the assistant avatar used in onboarding, voice mode, loading states, and documentation.

---

## Tech Stack

| Layer           | Tech                                              |
| --------------- | ------------------------------------------------- |
| Desktop         | Tauri 2                                           |
| Frontend        | React 19, Vite, Tailwind CSS, shadcn/ui           |
| State           | Zustand                                           |
| Daemon          | Node.js 22+, Hono                                 |
| Database        | SQLite, Drizzle ORM                               |
| AI SDK          | Vercel AI SDK                                     |
| Models          | MiMo, Groq, OpenRouter, Ollama, OpenAI-compatible |
| Voice           | Web Speech API, Groq Whisper, MiMo TTS            |
| Protocol        | MCP (Model Context Protocol)                      |
| Executors       | Claude Code, Codex, OpenCode adapters             |
| Package Manager | pnpm workspaces                                   |

---

## Project Structure

```text
corelayer/
├── frontend/                    # Tauri 2.0 desktop client
│   ├── src/
│   │   ├── components/          # React UI components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── stores/              # Zustand state management
│   │   ├── lib/                 # Client utilities
│   │   │   ├── jarvisClient.ts  # HTTP client with retry
│   │   │   ├── sseParser.ts     # SSE streaming parser
│   │   │   └── voiceProfile.ts  # Voice profile manager
│   │   └── App.tsx
│   └── src-tauri/               # Rust native code
│       └── src/
│           ├── lib.rs           # Tauri commands
│           └── daemon_supervisor.rs
│
├── daemon/                      # Node.js runtime daemon
│   └── src/
│       ├── http/routes/         # Hono REST endpoints
│       ├── runtimes/            # agent, coding, tool, voice, memory, scheduler runtimes
│       ├── workflow/            # run dispatch, queues, slots, resources
│       ├── services/            # workspace orchestration and detail aggregation
│       ├── capabilities/        # permission and capability policy
│       ├── approvals/           # approval and resume services
│       ├── persistence/         # SQLite/Supabase repositories
│       └── config/              # Env & storage config
│
├── packages/                    # Shared packages
│   ├── types/                   # Shared TypeScript types
│   ├── model-gateway/           # Multi-provider model routing
│   ├── mcp-client/              # MCP server connections
│   ├── tool-registry/           # Unified tool registration
│   ├── runtime-core/            # Managed runtime primitives
│   ├── runtime-protocol/        # Runtime actions, approvals, lifecycle protocol
│   ├── execution-environment/   # Execution environment contract
│   └── permission-guard/        # Risk-based execution guard
│
├── public/
│   └── assets/                  # Visual assets
│       ├── corelayer-hero.png   # README hero banner
│       ├── coreling.png         # Assistant mascot
│       ├── icon.png             # Desktop app icon
│       └── icons/               # Feature module SVG icons
│
└── docs/                        # Documentation
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Rust (latest stable, for Tauri)
- Tauri prerequisites for your OS

### Install

```bash
git clone https://github.com/your-username/Jarvis.git
cd Jarvis
pnpm install
```

### Environment

Create `.env` in the project root. The minimal local setup is:

```env
STORAGE_MODE=local
DAEMON_PORT=3001
DAEMON_HOST=127.0.0.1
```

Provider keys such as `MIMO_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are optional and can be added when enabling those integrations.

### Run all

```bash
pnpm dev
```

### Run daemon or desktop app separately

```bash
pnpm --filter daemon dev
pnpm --filter frontend tauri dev
```

---

## Installation & Running FAQ

### 1. macOS displays "App is damaged and should be moved to the Trash"

- **Reason**: Because this application is not signed or notarized using a paid Apple Developer Account, macOS Gatekeeper automatically quarantines downloaded binaries and flags them as damaged.
- **Solution**:
  1. Drag `Jarvis.app` from the mounted `.dmg` into your **Applications** folder.
  2. Open the **Terminal** app and run the following command (enter your Mac login password when prompted):
     ```bash
     sudo xattr -r -d com.apple.quarantine /Applications/Jarvis.app
     ```
  3. Re-open `Jarvis.app` to launch it normally.

### 2. Windows Installer warns about locked files during override installation

- **Reason**: The background `jarvis-daemon.exe` process from a previous installation is still running and locking native libraries (like `better_sqlite3.node`).
- **Solution**: The installer package has automated hooks to terminate active processes. If you still see the file locking prompt, open Task Manager and manually end all `jarvis-daemon.exe` processes, or run the following command in Command Prompt before retrying:
  ```cmd
  taskkill /f /im jarvis-daemon.exe
  ```

---

## Example Commands

Ask Jarvis:

```text
Create a workspace for building the packaged runtime supervisor.
```

```text
Break this goal into implementation tasks and assign suitable agents.
```

```text
Run the coding agent with Codex and keep changes isolated.
```

```text
Show me what this agent run changed and which checks passed.
```

```text
Approve this file write for the current task only.
```

```text
Show all pending approvals for this workspace.
```

```text
Connect my GitHub MCP server and list available tools.
```

---

## Tool Safety

CoreLayer classifies tools by risk level.

| Risk         | Behavior                   | Example               |
| ------------ | -------------------------- | --------------------- |
| **Low**      | Auto-execute               | Reading current tasks |
| **Medium**   | Execute with notice        | Creating a new task   |
| **High**     | Requires confirmation      | Deleting a project    |
| **Critical** | Explicit approval required | System-level commands |

All tool calls are written to audit logs with duration, risk level, and result status.

---

## MCP Integration

CoreLayer connects to MCP servers and registers their tools into the unified Tool Registry.

Supported connection types:

```text
stdio · HTTP · SSE
```

MCP tools are normalized into CoreLayer's internal format:

```text
mcp:{serverId}:{toolName}
```

This allows Jarvis to call external tools through the same permission, logging, and display pipeline as native tools.

---

## Model Routing

Different tasks need different models. CoreLayer routes requests across providers:

```text
Fast voice command       → low-latency model (MiMo, Groq)
Tool-heavy workflow      → tool-agent model
Private local request    → local model (Ollama)
Long reasoning task      → reasoning model (OpenRouter)
```

Providers can be added via the Control Center UI with preset catalogs or custom OpenAI-compatible endpoints.

---

## Storage Modes

CoreLayer has three storage modes in the UI/config layer:

| Mode             | Description                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Local SQLite** | Zero-config, offline-first, data stays on your machine.                                                            |
| **Supabase**     | Cloud sync mode backed by Supabase repositories.                                                                   |
| **PostgreSQL**   | Configuration and connection testing exist; repository support is experimental and currently falls back to SQLite. |

Switching storage modes is supported from settings, but PostgreSQL should be treated as a work in progress.

---

## Voice Pipeline

Jarvis supports a voice-native interaction flow:

```text
Wake word detection
  ↓
ASR transcription
  ↓
Streaming model response
  ↓
Sentence-level TTS queuing
  ↓
Barge-in interruption
  ↓
Follow-up listening
```

Voice profiles are configurable with different languages, models, and voice settings.

---

## Roadmap

### Implemented

- [x] Tauri desktop shell with local daemon supervision
- [x] React workspace UI, command palette, control center, and voice overlay
- [x] Unified JarvisClient with HTTP retry and SSE streaming
- [x] Model gateway for MiMo, Groq, OpenRouter, Ollama, and OpenAI-compatible providers
- [x] Tool registry for native tools, MCP tools, skills, and REST adapters
- [x] Voice pipeline with ASR, streaming response, TTS, and interruption
- [x] Local skills runtime and scheduled automation foundations
- [x] Local-first SQLite storage with Supabase repository support
- [x] Workspace, project, task graph, agent run, artifact, approval, and environment-session data model
- [x] Workspace UI with task graph, timeline, agents, runs, approvals, and artifacts
- [x] Coding runtime adapters for Claude Code, Codex, and OpenCode
- [x] Runtime protocol, execution environment, capability grant, pending action, and execution log foundations

### Current Focus

- [ ] Harden third-party executor permissions and approval projection
- [ ] Enforce workspace and execution environment boundaries before side effects
- [ ] Separate deliverable artifacts from logs, transcripts, permission prompts, and status output
- [ ] Add trajectory export for reconstructing an agent run from events, logs, approvals, and artifacts
- [ ] Make verified delivery the default completion path for coding tasks

### Next

- [ ] Mature the Agent OS workspace around project memory, decision records, and reusable workflows
- [ ] Expand executor governance beyond coding into research, writing, browser, messaging, and media workflows
- [ ] Move more host-level authority into Rust/Tauri Core: process supervision, app paths, secrets, permissions, updates, and audit logs
- [ ] Stabilize runtime protocols for future managed runtimes and plugin ecosystems
- [ ] Keep marketplace-style sharing behind stable permission, memory, runtime, and artifact contracts

---

## Design System

CoreLayer uses a dark, calm, futuristic visual language:

- deep navy / near-black backgrounds
- cyan AI core glow
- violet model routing accents
- amber permission / reactor highlights
- HUD-style rings and connected nodes
- professional product dashboard layout

Visual assets:

```text
public/assets/corelayer-hero.png    README hero banner
public/assets/coreling.png          Assistant mascot
public/assets/icon.png              Desktop app icon
public/assets/icons/                Feature module SVG icons
```

---

## Naming

The repository and product system are called **CoreLayer**.

The built-in assistant persona is called **Jarvis**.

```text
CoreLayer = the desktop AI control layer
Jarvis    = the assistant persona inside CoreLayer
Coreling  = the holographic AI core companion
```

---

## License

[MIT](LICENSE)

---

## Status

CoreLayer is currently experimental and built for personal use first.

The near-term wedge is a local-first control plane for coding executors such as Claude Code, Codex, and OpenCode.
The long-term goal is to become a local-first Agent OS for managing agents, tasks, workspaces, tools, permissions, memory, artifacts, and model runtimes.
