# MINIMI Architecture & Design Document

## 1. Overall Architecture

Minimi is a production-grade conversational AI agent featuring persistent long-term memory, temporal reasoning, live web search, and structured change-detection between historical memory and current ground truth.

```
                           +----------------------------------------+
                           |           React + Vite Frontend        |
                           |   (Chat UI, Memory Drawer, Citations)  |
                           +-------------------+--------------------+
                                               |
                                     HTTP / SSE (Streaming)
                                               |
                                               v
+-----------------------------------------------------------------------------------+
|                                Express.js Backend                                 |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | Conversation Service|   |  Memory Retrieval     |   |   Temporal Reasoning   |  |
|  | (Sessions, History)|   |  (FTS5, Graph, Hybrid)|   |   (Timezone, Resolvers)|  |
|  +--------------------+   +-----------+-----------+   +-----------+------------+  |
|                                       |                           |               |
|                                       v                           v               |
|  +-----------------------------------------------------------------------------+  |
|  |                          Agent Orchestrator                                 |  |
|  |   - Constructs System & Context Prompts (Facts, Summaries, Temporal Anchor) |  |
|  |   - Bounded Tool Execution Loop (Google Gemini @google/genai)               |  |
|  |   - Exactly 1 Agent Tool: web_search                                        |  |
|  +------------------------------------+----------------------------------------+  |
|                                       |                                           |
|                   +-------------------+-------------------+                       |
|                   |                                       |                       |
|                   v                                       v                       |
|  +--------------------------------+   +----------------------------------------+  |
|  |  Tavily Search API Client      |   |   Comparison & Citation Engine         |  |
|  |  (Live Web Search, Sanitizer)  |   |   (Like-for-like, Change Categorizer)  |  |
|  +--------------------------------+   +----------------------------------------+  |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |  Background Extraction & Summarizer (Post-turn memory extractor)            |  |
|  +------------------------------------+----------------------------------------+  |
|                                       |                                           |
+---------------------------------------|-------------------------------------------+
                                        v
+-----------------------------------------------------------------------------------+
|                        SQLite + SQLite FTS5 Database                              |
|   - conversations, messages, conversation_summaries                              |
|   - memories (immutable versioning, supersedes_id, timestamps)                    |
|   - entities, message_entities                                                    |
|   - sources (citation provenance & excerpts)                                      |
|   - memory_fts (FTS5 full-text index)                                             |
+-----------------------------------------------------------------------------------+
```

---

## 2. Why the Technology Stack Was Selected

- **Node.js + Express.js + TypeScript**: Provides end-to-end type safety, asynchronous non-blocking I/O for streaming responses (SSE), deterministic error handling, and robust middleware ecosystem.
- **SQLite + `better-sqlite3` + FTS5**: Zero-latency in-process storage. Eliminates external DB servers and Docker dependencies while providing full transactional integrity (ACID, WAL mode) and FTS5 full-text search.
- **Google Gemini API (`@google/genai`)**: The official, modern SDK supporting native function calling, streaming, schema enforcement, and rapid context processing.
- **Tavily Search API**: Search engine tailored for AI agents, returning clean markdown content, publication dates, and authoritative source URLs.
- **React + Vite + Tailwind CSS + Lucide React + React Markdown**: Ultra-fast bundle generation, component isolation, responsive desktop/mobile UI, and rich markdown rendering for code and citations.
- **Zod**: Runtime schema validation for API requests, tool inputs, and memory extraction outputs.
- **Vitest & Playwright**: Fast in-memory unit/integration test runner alongside headless browser E2E test automation.

---

## 3. Conversation Memory Architecture

Minimi separates conversation memory into two distinct tiers:
1. **Raw Chronological Log (`conversations`, `messages`)**: Every turn is persisted atomically with role, content, metadata, and timestamps. Old sessions can be reopened and continued at any time.
2. **Extracted Fact Graph (`memories`)**: Facts, preferences, constraints, prices, dates, and decisions are extracted and indexed independently of conversation boundaries.

### Rolling Summaries
When a conversation exceeds token or turn thresholds, older messages are summarized into `conversation_summaries`. Crucially, raw messages are **never discarded**; summaries serve as compact context injections for Gemini, while FTS5 and entity retrieval can still pinpoint the original raw messages.

---

## 4. Structured Memory Extraction

After each conversation turn, an extraction routine identifies factual assertions and structured records.

### Extracted Record Schema:
```typescript
interface MemoryRecord {
  id: string;
  conversation_id: string;
  message_id: string;
  subject: string;           // e.g. "user", "subscription", "laptop"
  predicate: string;         // e.g. "preferred_brand", "price_per_month", "budget"
  value: string;             // e.g. "ASUS", "499", "80000"
  category: "preference" | "budget" | "plan" | "decision" | "fact" | "correction";
  confidence: number;        // 0.0 to 1.0
  source_type: "explicit_statement" | "reasonable_inference" | "uncertain";
  valid_from: string;        // ISO timestamp
  valid_until?: string;      // ISO timestamp (set when superseded)
  recorded_at: string;       // ISO timestamp
  supersedes_id?: string;    // Links to older fact ID that this updates
}
```

### Explicit Statements vs. Inferences
- Facts directly uttered by the user ("My budget is ₹80,000") are marked `source_type: 'explicit_statement'` with high confidence (`0.95 - 1.0`).
- Contextual deductions are categorized as `reasonable_inference` with lower confidence (`0.6 - 0.8`) and are **never** presented to the user as confirmed explicit quotes.

---

## 5. Historical Fact Versioning & Immutability

Historical truth is strictly immutable.
When a user updates a fact:
- January: `"The subscription costs ₹499."` -> Creates `Record A` (`supersedes_id: null`).
- March: `"The subscription now costs ₹599."` -> Creates `Record B` (`supersedes_id: Record A.id`).
- `Record A` is **not deleted**. Its `valid_until` is updated to March, maintaining the audit trail.
- Queries regarding "What was the price in January?" or "What price did we discuss last time?" resolve `Record A`.
- Queries regarding current baseline resolve the active unexpired leaf (`Record B`).

---

## 6. Temporal Reasoning Engine

A dedicated temporal resolver handles relative time expressions:
- `"yesterday"`, `"last week"`, `"last month"`, `"last year"`
- `"previously"`, `"at that time"`, `"currently"`, `"as of [date]"`
- `"since our last discussion"`, `"before [event]"`, `"after [event]"`

### Timezone & Anchoring
- Configuration: `APP_TIMEZONE` (defaults to `Asia/Kolkata`).
- Every query is anchored against the conversation's real-time clock.
- Distinct timestamps tracked:
  1. `message_created_at`: Physical time the message was posted.
  2. `event_occurred_at`: When the described event occurred.
  3. `fact_valid_from` & `fact_valid_until`: Effective temporal validity.

---

## 7. Retrieval Strategy (Hybrid Pipeline)

Minimi implements a multi-stage retrieval pipeline without external vector databases:
1. **Temporal Filtering**: Filters candidate facts by resolved timeframe.
2. **Entity & Keyword Lookup**: Matches extracted entities and canonical terms.
3. **SQLite FTS5 Full-Text Search**: Queries `memory_fts` and `messages` using BM25 ranking.
4. **Structured Fact Querying**: Filters active and superseded facts matching subject/predicate.
5. **Memory Ranker**: Combines recency, confidence, text overlap, and session relevance into a normalized composite score.
6. **Context Budgeting**: Injects only the top relevant memories into the prompt with provenance metadata.

---

## 8. Gemini Agent Orchestration

- Uses Google's official `@google/genai` SDK.
- The model (`GEMINI_MODEL`, e.g., `gemini-2.5-flash`) receives:
  - System Prompt (strict operating rules, temporal clock, citation mandates).
  - Relevant Retrievable Memories (with message IDs and dates).
  - Conversation History (or rolling summary + recent turns).
  - User's incoming turn.
- The agent decides whether to answer from memory, request web search, or ask for clarification.

---

## 9. Function-Calling Lifecycle

There is **exactly one** external tool declared to Gemini: `web_search`.
Internal subsystems (memory retrieval, database queries, summaries, temporal resolution) are executed application-side before or during prompt assembly.

### Bounded Execution Loop:
1. Initial call: `ai.models.generateContent({ contents, config: { tools: [webSearchDeclaration] } })`.
2. Inspect `response.functionCalls`.
3. If no tool calls: stream or return the final text.
4. If `web_search` is requested:
   - Validate arguments with Zod (`query`, optional `topic`, optional `time_range`).
   - Execute `tavilySearch`.
   - Record search evidence in `sources` table.
   - Send `functionResponse` back in the contents history.
5. Bounded loop (maximum 3 iterations) prevents runaway recursion.

---

## 10. Tavily Search Integration

- Direct server-side HTTP integration via `POST https://api.tavily.com/search`.
- Configurable search depth (`basic` or `advanced`), result count limits, deduplication by canonical URL.
- Resilient timeouts (default 8s), error isolation, and graceful fallback: if search fails, the agent reports search unavailability rather than inventing facts.

---

## 11. Historical vs. Current Comparison Engine

When a comparison query is triggered (e.g. "Has the price changed since we discussed it?"):
1. **Historical Grounding**: Identifies the historical fact (e.g., `₹499/month` on 2026-01-10).
2. **Target Formulation**: Formulates a targeted search for the exact subject and metric.
3. **Evidence Extraction**: Normalizes billing period, currency, edition/tier, and region.
4. **Change Classification**:
   - `increased`: New value > Old value
   - `decreased`: New value < Old value
   - `unchanged`: New value == Old value
   - `modified`: Non-numeric feature or policy updated
   - `added` / `removed`: Feature availability changed
   - `cannot_determine`: Conflicting or incomplete web evidence
5. **Transparent Reporting**: Clearly outputs both baseline and current values with dates and citations.

---

## 12. Source Provenance and Citations

- Web facts are cited inline using bracketed numbers: `[1]`, `[2]`.
- Every citation is backed by an entry in `sources` storing:
  - URL, Title, Domain, Snippet, Retrieval timestamp, Publication timestamp (if provided).
- Frontend renders interactive, clickable badges linking to authentic sources.
- Fake URLs, hallucinatory citations, and unsourced external claims are explicitly prohibited by system instructions and tested.

---

## 13. Security Decisions & Guardrails

- **Key Isolation**: `GEMINI_API_KEY` and `TAVILY_API_KEY` reside exclusively in server-side environment variables.
- **Prompt Injection Defense**: Web search snippets are framed inside `<untrusted_web_evidence>` containers with strict instructions that webpage text cannot override system behavior.
- **SQL Injection Prevention**: Parameterized queries and prepared statements exclusively via `better-sqlite3`.
- **CORS & Rate Limiting**: Scoped to `CLIENT_URL` with express rate limiters and payload size caps.
- **Session Isolation**: Each conversation is strictly isolated; facts can be scoped to user sessions.

---

## 14. Failure Handling & Resilience

- **Tavily Timeout / Error**: Returns a clean tool failure message to Gemini; Gemini explains that web verification failed while keeping historical recall intact.
- **Missing Memory**: Never guesses or fabricates; admits transparently that no record exists.
- **Model Outages**: Safe HTTP error responses returned to frontend without crashing Node process.
- **Database Corruption Prevention**: SQLite WAL mode enabled with foreign keys enforced.

---

## 15. Known Limitations

- High-frequency live financial tick data is subject to Tavily search indexing latency.
- Deep nested tables on JavaScript-rendered single-page apps may require Tavily extract endpoints if basic search snippets lack fine granularity.

---

## 16. Future Improvements

- Multi-modal memory attachments (PDFs, screenshots).
- User verification dashboard for manual memory edits/deletions.
- Multi-user authentication and role-based access control.
