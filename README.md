# SETU — Agentic AI Workstation

> **Local-first, LAN-accessible AI automation tool.**  
> Stateful voice + text agent that lives on your machine and controls it.

---

## Overview

Setu is a personal AI assistant built to run entirely on your own hardware. It
listens for voice commands (or accepts typed text via a web UI), reasons over
them with a 3-layer LLM fallback pipeline, executes OS-level actions through a
tool registry, and speaks its response back via neural TTS — all over a
WebSocket connection, with zero cloud dependency for the core runtime.

---

## Architecture

```
Browser / Mobile Client (React + Vite)
        │  WebSocket (Django Channels / Daphne)
        ▼
┌─────────────────────────────────────────────────┐
│               Django Backend                    │
│                                                 │
│  AgentStreamConsumer (consumers.py)             │
│       │                                         │
│       ├─► STTPipeline (faster-whisper)          │
│       │       VAD → logprob gate → text         │
│       │                                         │
│       └─► process_agent_command (pipeline.py)   │
│               │                                 │
│               ├─► Tier 0: FastResponseRouter    │
│               │       regex/keyword → instant   │
│               │       TTS cache hit → 0-lat.    │
│               │                                 │
│               └─► Tier 2: SetuAgent (LangGraph) │
│                       Layer 1: Gemini Flash     │
│                       Layer 2: Gemma-4-31B      │
│                       Layer 3: Llama-3.1-8B     │
│                                                 │
│  TTSEngine (Kokoro) ─► base64 WAV ─► WS push    │
│  MongoDB (conversations, reminders, cmd logs)   │
└─────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Component | Technology |
|---|---|
| Web server | Django 6 + Daphne (ASGI) |
| Real-time transport | Django Channels 4 (WebSockets) |
| Agent framework | LangGraph `create_react_agent` + `MemorySaver` |
| Speech-to-Text | `faster-whisper` (`large-v3-turbo`, int8, CPU) |
| Text-to-Speech | Kokoro 0.7 (`af_heart`, `hf_alpha`, `am_echo`, `hm_omega`) |
| Database | MongoDB via MongoEngine |
| Browser automation | Playwright (Browser Sub-Agent) |
| Retry logic | Tenacity (2 attempts, exponential back-off) |

### Frontend
| Component | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| State | Zustand 5 |
| Routing | React Router v7 |
| 3-D / visuals | Three.js + React Three Fiber + Postprocessing |
| Animation | Framer Motion + GSAP |
| Data fetching | TanStack Query v5 |
| Styling | Tailwind CSS v4 (utility layer) |

---

## 3-Layer LLM Fallback Pipeline

The agent tries each layer in sequence, falling back only on failure or timeout.
All three layers share the same tool registry and LangGraph conversation memory.

```
Layer 1 (Primary)   — Google Gemini  (gemini-3.1-flash-lite)     10 s timeout
Layer 2 (Fallback)  — OpenRouter     (google/gemma-4-31b-it:free)  6 s timeout
Layer 3 (Tertiary)  — NVIDIA NIM     (meta/llama-3.1-8b-instruct)  5 s timeout
```

- An **in-memory LLM response cache** (`langchain InMemoryCache`) gives
  zero-latency replies for identical repeated queries.
- A **Plan-and-Execute Router** (Layer 0) runs before the agent to produce a
  minimal execution path, reducing unnecessary tool calls.
- A **checkpoint healing** pass runs before every turn to repair dangling
  tool-call states from cancelled or errored turns.

---

## STT — Speech-to-Text

Model: **faster-whisper** `large-v3-turbo` (int8 quantised, CPU).

| Parameter | Value |
|---|---|
| Silero VAD threshold | **0.35** |
| Min speech duration | **200 ms** |
| Min silence duration | 400 ms |
| Logprob confidence gate | **−1.50** (env `STT_MIN_LOGPROB`) |
| Beam size | 5 |
| Temperature schedule | 0.0 → 0.2 → 0.4 (fallback on uncertainty) |
| Bilingual priming | English + Hindi/Hinglish initial prompt |
| Wake-word correction | 45+ phonetic mishear variants normalised to "setu" |

Low-confidence transcriptions (`avg_logprob < −1.50`) are silently discarded
and the user hears *"Sorry, I didn't catch that."*

---

## TTS — Text-to-Speech

Engine: **Kokoro** (neural, local, no cloud).

- Audio is generated sentence-by-sentence and streamed to the client as
  **base64-encoded WAV chunks** over the WebSocket — the user hears the first
  sentence while subsequent ones are still generating.
- A **TTSCache** pre-warms common Tier 0 greeting responses at server boot
  in a background thread, eliminating the 1–2 s first-generation cost for
  those phrases.
- Voices are selected per user preference (gender + language):
  - English: `af_heart` (F) / `am_echo` (M)
  - Hindi: `hf_alpha` (F) / `hm_omega` (M)

---

## Agent Tools (13 registered)

| # | Tool | Description |
|---|---|---|
| 1 | `get_current_time` | Current date, time, day |
| 2 | `get_system_info` | CPU, RAM, disk, battery, OS |
| 3 | `check_os_permissions` | Verify desktop automation rights |
| 4 | `gather_information` | Internal LLM knowledge / research |
| 5 | `set_reminder` | Natural-language reminder → MongoDB |
| 6 | `open_application` | Launch apps, URLs, or drive paths |
| 7 | `close_application` | Kill running processes |
| 8 | `run_shell_command` | Execute shell / PowerShell (safety-gated) |
| 9 | `control_volume` | Mute / unmute / set % via native WASAPI |
| 10 | `read_file` | Read file contents |
| 11 | `write_file` | Create or overwrite a file |
| 12 | `search_files` | Glob search across a directory |
| 13 | `list_directory` | List files and folders |
| *(+)* | `delegate_browser_task` | Playwright sub-agent for web automation |

> **Note:** `web_search` (DuckDuckGo) is defined but marked deprecated in code;
> `gather_information` is the preferred search path.

---

## Response Tiers

| Tier | Trigger | Latency |
|---|---|---|
| **Tier 0** — Fast Router | Greetings, farewells, thanks, "how are you" — matched by pre-compiled regex | < 0.3 s |
| **Tier 2** — LLM Agent | All other commands — routed through LangGraph + tool execution | ~2–8 s |

*(Tier 1 — Intent Classifier — is scaffolded in the pipeline but not yet active.)*

---

## Security & Permissions

- **3-level permission system**: Level 1 (always allowed) → Level 2 (user
  opt-in via onboarding) → interactive runtime prompt for sensitive paths.
- **Safety layer** (`safety.py`): blocks destructive shell patterns, restricts
  filesystem access to whitelisted paths, sanitises output.
- **WebSocket auth**: JWT-authenticated connections; conversation ownership
  is verified on connect (4001 / 4003 close codes on failure).
- **Mobile resilience**: cancellation is not triggered on mobile disconnect
  (flaky networks / screen lock); only desktop disconnects cancel in-flight tasks.

---

## Real-time Features

- **Streaming responses**: agent tokens are pushed to the client as they are
  generated (`stream_mode="messages"`).
- **Cancellation**: user can interrupt mid-stream; a threading Event propagates
  cancellation through the tool execution chain.
- **Multi-device**: a single conversation group supports simultaneous desktop +
  mobile connections; commands from either device fan out to both.
- **Device detection**: server-side UA parsing identifies iPhone / iPad /
  Samsung / Pixel for labelled device-status events.

---

## Project Structure

```
SETU/
├── backend/
│   ├── core/
│   │   ├── agent/          # LLM pipeline, tools, fast router, TTS cache, state
│   │   ├── ai/             # STTPipeline (faster-whisper) + TTSEngine (Kokoro)
│   │   ├── conversations/  # MongoDB conversation + message models
│   │   ├── reminders/      # Reminder model + scheduler
│   │   ├── users/          # User model + preferences
│   │   └── websockets/     # Django Channels consumer, middleware, routing
│   ├── setu/               # Django project config (settings, ASGI, URLs)
│   ├── listener.py         # Standalone local voice loop (no browser needed)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/     # UI components (NeuralMesh 3-D, etc.)
    │   ├── features/       # Feature-scoped React modules
    │   ├── hooks/          # Custom hooks (WebSocket, audio recorder, etc.)
    │   ├── pages/          # Route-level pages (Dashboard, Login, etc.)
    │   ├── store/          # Zustand global state
    │   └── utils/
    └── package.json
```

---

## Quick Start

### Prerequisites
- Python 3.11+, Node 20+
- MongoDB running locally
- API keys: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`

### Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # fill in your keys
python manage.py migrate
daphne -b 0.0.0.0 -p 8000 setu.asgi:application
```

### Frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### Local Voice Loop (no browser)
```bash
cd backend
python listener.py
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Google Gemini API key (Layer 1 LLM) |
| `OPENROUTER_API_KEY` | — | OpenRouter key (Layer 2 — Gemma-4-31B) |
| `NVIDIA_API_KEY` | — | NVIDIA NIM key (Layer 3 — Llama-3.1-8B) |
| `STT_MIN_LOGPROB` | `-1.50` | Confidence gate for STT transcriptions |
| `WHISPER_MODEL_SIZE` | `large-v3-turbo` | Override faster-whisper model size |
| `SETU_USER_NAME` | `User` | Display name used in local listener mode |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |

---

## Key Metrics (as implemented in code)

| Metric | Value | Source |
|---|---|---|
| LLM cache latency | ~0 ms (in-memory hit) | `langchain InMemoryCache` |
| Tier 0 response latency | < 0.3 s | `fast_responses.py` |
| TTS cache hit latency | ~0 ms | `tts_cache.py` |
| VAD threshold | 0.35 | `stt.py:66` |
| Min speech duration | 200 ms | `stt.py:67` |
| STT confidence gate | −1.50 logprob | `consumers.py:219`, `listener.py:80` |
| Layer 1 LLM timeout | 10 s | `llm_agent.py:191` |
| Layer 2 LLM timeout | 6 s | `llm_agent.py:205` |
| Layer 3 LLM timeout | 5 s | NVIDIA monkey-patch, `llm_agent.py:81` |
| Agent memory bound | 50 checkpoints | `BoundedMemorySaver` |
| Tool count (registered) | 13 + browser sub-agent | `tools.py:1037` |
