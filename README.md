<p align="center">
  <img src="./public/assets/corelayer-hero.png" alt="CoreLayer — powered by Jarvis" width="100%" />
</p>

<br />

<p align="center">
  <img src="./public/assets/icon.png" alt="CoreLayer Icon" width="96" height="96" />
</p>

<h1 align="center">CoreLayer — powered by Jarvis</h1>

<p align="center">
  <strong>A desktop AI control layer for your personal apps.</strong>
</p>

<p align="center">
  Jarvis is the built-in assistant persona that helps you control tasks, tools, models, MCP apps, and voice workflows.
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

## What is CoreLayer?

**CoreLayer** is a desktop AI command layer for personal apps.

It is not another AI chat window.
It is a local-first desktop control center that connects your tasks, tools, models, MCP apps, voice workflows, and personal data into one AI-operable interface.

The built-in assistant persona is called **Jarvis**.

Jarvis can help you:

- ask about today's tasks and priorities
- manage your reading list and track progress
- capture daily reviews with automated summaries
- control connected personal apps through MCP
- call tools safely through permission policies
- route requests across different AI models
- interact through voice with streaming TTS
- connect to external MCP servers

---

## Why CoreLayer?

Most AI assistants are either:

- general-purpose chatbots with no tool awareness
- single-app copilots locked to one ecosystem
- cloud-first automation tools that own your data
- plugin-heavy dashboards with no safety model

CoreLayer is different.

It is designed around a simple idea:

> Your personal apps should remain independent, but Jarvis should be able to understand, call, and coordinate them safely.

CoreLayer is the control layer between you, your tools, your models, and your personal app ecosystem.

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
      <h3>Unified Tool Calling</h3>
      <p>Register, route, execute, and display tools from native modules, MCP, skills, and REST adapters.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./public/assets/icons/guard.svg" width="32" />
      <h3>Permission Guard</h3>
      <p>Classify risky actions, pause for confirmation, and keep audit logs for every tool call.</p>
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
      <p>Manage models, apps, tools, permissions, voice profiles, daemon health, and logs.</p>
    </td>
  </tr>
</table>

---

## Architecture

```text
User
 │
Voice / Text / Shortcut
 │
CoreLayer Desktop App (Tauri 2.0)
 │
├── Tauri Shell
│   ├── Floating Jarvis Window
│   ├── Command Palette
│   └── Control Center UI
│
├── JarvisClient (Frontend)
│   ├── HTTP Client with Retry
│   ├── SSE Streaming Parser
│   ├── ASR / TTS Client
│   └── Zustand State Stores
│
├── Node.js Daemon (Hono)
│   ├── AI Orchestrator
│   ├── Model Gateway
│   ├── Tool Registry
│   ├── Permission Guard
│   ├── MCP Client Manager
│   └── Audit Logger
│
├── Tool Sources
│   ├── Native Tools (Todo, Reading, Review)
│   ├── MCP Tools
│   ├── Skills
│   └── REST Adapters
│
└── Data Layer
    ├── SQLite (local-first)
    ├── Supabase (cloud sync)
    └── PostgreSQL (general)
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

| Layer | Tech |
|---|---|
| Desktop | Tauri 2 |
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui |
| State | Zustand |
| Daemon | Node.js, Hono |
| Database | SQLite, Drizzle ORM |
| AI SDK | Vercel AI SDK |
| Models | MiMo, Groq, OpenRouter, Ollama, OpenAI-compatible |
| Voice | Web Speech API, Groq Whisper, MiMo TTS |
| Protocol | MCP (Model Context Protocol) |
| Package Manager | pnpm workspaces |

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
├── daemon/                      # Node.js backend
│   └── src/
│       ├── api/                 # Hono REST endpoints
│       ├── orchestrator/        # AI orchestrator & prompt builder
│       ├── tools/               # Native tools
│       │   ├── todo/            # Task management
│       │   ├── reading/         # Reading list
│       │   └── review/          # Daily/weekly reviews
│       ├── voice/               # ASR & TTS
│       ├── config/              # Env & storage config
│       └── db/
│           ├── sqlite/          # SQLite repositories
│           └── supabase/        # Cloud repositories
│
├── packages/                    # Shared packages
│   ├── types/                   # Shared TypeScript types
│   ├── model-gateway/           # Multi-provider model routing
│   ├── mcp-client/              # MCP server connections
│   ├── tool-registry/           # Unified tool registration
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

- Node.js 20+
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

Create `.env` in the project root:

```env
AI_PROVIDER=mimo

MIMO_API_KEY=your_mimo_key
MIMO_MODEL=mimo-v2.5

GROQ_API_KEY=your_groq_key
OPENROUTER_API_KEY=your_openrouter_key

SQLITE_DB_PATH=./daemon/data/corelayer.db
DAEMON_PORT=3001
```

### Run daemon

```bash
pnpm --filter daemon dev
```

### Run desktop app

```bash
pnpm --filter frontend tauri dev
```

This starts the Hono daemon and Tauri desktop window concurrently.

---

## Example Commands

Ask Jarvis:

```text
What should I focus on today?
```

```text
Show me my current tasks sorted by priority.
```

```text
Add this article to my reading list.
```

```text
Summarize my weekly progress.
```

```text
Connect to my GitHub MCP server.
```

```text
Use the fast model for this voice command.
```

```text
What tools are currently enabled?
```

---

## Tool Safety

CoreLayer classifies tools by risk level.

| Risk | Behavior | Example |
|---|---|---|
| **Low** | Auto-execute | Reading current tasks |
| **Medium** | Execute with notice | Creating a new task |
| **High** | Requires confirmation | Deleting a project |
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

CoreLayer supports three storage modes, hot-swappable at runtime:

| Mode | Description |
|---|---|
| **Local SQLite** | Zero-config, offline-first, data stays on your machine. |
| **Supabase** | One-click multi-device cloud sync. |
| **PostgreSQL** | Compatible with AWS RDS, Neon, Aiven, or self-hosted. |

Switch databases in real-time without restarting the app.

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

### Phase 1 — Core Desktop Layer

- [x] Tauri desktop shell
- [x] Local daemon with Hono
- [x] Unified JarvisClient
- [x] Streaming chat with tool calling
- [x] Tool Registry
- [x] Permission Guard
- [x] Tool call audit logs
- [x] Model routing gateway
- [x] Voice profile manager
- [x] Smart Todo, Reading, Review tools

### Phase 2 — Control Center

- [x] Settings as a full Control Center
- [x] Model profile management UI
- [x] MCP connection manager UI
- [x] Tool registry explorer
- [x] Permission matrix UI
- [x] Voice test console
- [x] Daemon health dashboard

### Phase 3 — Personal App Ecosystem

- [x] Veridia MCP integration (REST adapter)
- [x] TaskFlow integration (native repo adapter)
- [x] FlexiLog integration (REST adapter)

### Phase 4 — Skills and Automation

- [x] Local skills runtime
- [x] Workflow skills
- [x] Scheduled reviews
- [x] Plugin marketplace experiments

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

The long-term goal is to become an MCP-first, local-first desktop AI control layer for personal apps.
