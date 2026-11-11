# Minimi — Conversational AI Agent with Persistent Memory & Live Verification

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-cyan.svg)](https://reactjs.org/)
[![Node](https://img.shields.io/badge/Node-v26-green.svg)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-FTS5-orange.svg)](https://www.sqlite.org/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-%40google%2Fgenai-purple.svg)](https://ai.google.dev/)
[![Tavily](https://img.shields.io/badge/Tavily-Live%20Search-blueviolet.svg)](https://tavily.com/)

Minimi is a production-quality conversational AI agent engineered for the Minimi hiring challenge. It combines persistent long-term memory, temporal reasoning, live web search, and structured change-detection between historical conversations and current ground truth.

---

## 🌟 Key Features

### 1. Long-Term Conversational Memory
- **Persistent Storage**: Every message and conversation turn is stored in SQLite and survives application restarts.
- **Structured Fact Graph**: Extracts user preferences, budgets, prices, decisions, plans, and constraints into structured records with confidence scores and source type distinctions (explicit statement vs. reasonable inference).
- **Immutable Historical Audit Trail**: Older facts are **never overwritten**. When an updated fact arrives, the older fact's validity window is updated and linked via `supersedes_id`, maintaining a complete audit trail for historical queries.
- **Hybrid Retrieval**: Employs SQLite FTS5 full-text search, exact keyword matching, entity graph lookups, temporal filtering, and multi-factor relevance ranking.

### 2. Historical vs. Current Information Comparison
- When users ask *"Has this changed since we discussed it?"*, Minimi:
  1. Identifies the historical baseline fact and its recording date from memory.
  2. Executes targeted live web searches.
  3. Matches like-for-like attributes (currency, billing cadence, subscription tier, region).
  4. Classifies changes quantitatively into **Increased**, **Decreased**, **Unchanged**, **Added**, **Removed**, or **Modified**.
  5. Cites sources for current facts while referencing conversation dates for historical facts.

### 3. Dedicated Temporal Reasoning
- Understands relative temporal expressions: *"yesterday"*, *"last week"*, *"last month"*, *"previously"*, *"currently"*, and calendar-month expressions.
- Anchored to a configurable timezone (`APP_TIMEZONE`, default: `Asia/Kolkata`).
- Preserves distinct timestamps: message creation time, event occurrence date, and fact validity interval.

### 4. Exactly ONE External Agent Tool: `web_search`
- Exposes only `web_search` to Gemini.
- Memory retrieval, database lookups, summaries, and temporal calculations operate strictly as internal backend services.
- Search requests are executed server-side via Tavily Search API with query validation, deduplication, and timeouts.

### 5. Source Provenance & Clickable Citations
- All web claims feature numbered citations (`[1]`, `[2]`).
- Citations link directly to authentic URLs stored in the `sources` database table. Fake URLs and unverified sources are strictly prohibited.

### 6. Interactive Memory Vault
- A slide-out Memory Drawer in the UI allows users to inspect stored facts, active baselines, confidence levels, and version audit chains.

---

## 🏗️ Technology Stack

| Tier | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide React, React Markdown, Remark GFM |
| **Backend** | Node.js, Express.js, TypeScript, Zod, Luxon, UUID |
| **Database** | SQLite, better-sqlite3 with native `node:sqlite` fallback, SQLite FTS5 full-text index |
| **AI / Model** | Google Gemini API via official `@google/genai` SDK, native function calling |
| **Web Search** | Tavily Search API (REST server-side integration) |
| **Testing** | Vitest, Supertest, Playwright |

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18, v20, v22, or v26)
- npm (v9+)
- (Optional for live APIs) Google Gemini API Key and Tavily API Key

### 1. Installation
Clone the repository and install all dependencies:

```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure your API keys in `.env`:
```env
PORT=3000
NODE_ENV=development

# Google Gemini API Key (https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Tavily Search API Key (https://tavily.com)
TAVILY_API_KEY=your_tavily_api_key_here

# SQLite Database Location
DATABASE_PATH=./data/minimi.db

# Timezone (IANA timezone format)
APP_TIMEZONE=Asia/Kolkata

CLIENT_URL=http://localhost:5173
```

> **Note**: Automated unit and evaluation tests run 100% offline with zero paid API usage using deterministic mocking.

### 3. Running Development Servers
Start both the backend API and frontend Vite servers concurrently:

```bash
npm run dev
```

- **Frontend Chat UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)
- **API Health Endpoint**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 🧪 Testing

The repository contains comprehensive automated test suites covering all 15 required challenge scenarios:

```bash
# Run unit, integration, and evaluation suites (31 tests)
npm run test

# Run browser-based Playwright end-to-end tests
npm run test:e2e

# Run TypeScript typechecks
npm run typecheck

# Run production build
npm run build
```

See [docs/EVALUATION.md](docs/EVALUATION.md) for details on all 15 scenarios.

---

## 💬 Example Questions & Workflows

### Scenario 1: Long-Term Memory Recall
```text
User (Monday):
"I am planning to buy a laptop. My budget is ₹80,000, and I prefer ASUS."

User (Wednesday):
"Which brand did I prefer for my laptop?"

Agent:
"You preferred ASUS."

User:
"What was the budget I mentioned last week?"

Agent:
"Your previously mentioned budget was ₹80,000."
```

### Scenario 2: Historical vs. Current Comparison
```text
User (Past Turn):
"The subscription cost ₹499 per month."

User (Present Turn):
"Has the subscription price changed since we discussed it?"

Agent:
"The subscription price was previously ₹499 per month. The current listed price is ₹599 per month, representing a ₹100 per month increase. [1]

Sources:
[1] Official Pricing Page — https://example.com/pricing"
```

### Scenario 3: Honest Admission of Missing Information
```text
User:
"What was the car insurance amount I mentioned last month?"

Agent:
"I couldn't find a previous conversation where you mentioned that amount. Could you remind me?"
```

---

## 🔌 API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check, timezone, and database status |
| `GET` | `/api/conversations` | List conversation sessions |
| `POST` | `/api/conversations` | Create a new conversation session |
| `GET` | `/api/conversations/:id` | Get conversation with full message history and summary |
| `DELETE` | `/api/conversations/:id` | Delete conversation and cascade messages |
| `POST` | `/api/chat` | Send a chat message (returns reply, citations, and retrieval) |
| `POST` | `/api/chat/stream` | Server-Sent Events (SSE) streaming chat endpoint |
| `GET` | `/api/memories` | List stored memories (`?onlyActive=true` filter) |
| `GET` | `/api/memories/:id` | Get memory record with full version audit chain |
| `GET` | `/api/memories/search` | FTS5 full-text search across memories |
| `GET` | `/api/sources/:id` | Retrieve search source metadata and excerpt |

---

## 🛡️ Security & Reliability

- **Key Isolation**: `GEMINI_API_KEY` and `TAVILY_API_KEY` reside exclusively in server-side environment variables.
- **Prompt Injection Defense**: Webpage snippets from `web_search` are treated as untrusted data; external text cannot override system prompt instructions.
- **SQL Injection Prevention**: Parameterized prepared statements exclusively across all repositories.
- **Session Isolation**: Messages are scoped to distinct conversation sessions.
- **Fault-Tolerant Search**: Network errors or timeouts from Tavily trigger clean error reporting rather than hallucinated facts.

---

## 📖 Architecture & Design Documentation
For comprehensive architectural specifications, refer to [DESIGN.md](DESIGN.md).
