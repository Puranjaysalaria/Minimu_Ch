import { GeminiClient, ModelContent } from '../ai/geminiClient.js';
import { MemoryRetriever, RetrievalResult } from '../memory/memoryRetriever.js';
import { ConversationService } from '../conversations/conversationService.js';
import { CitationService, FormattedCitation } from '../citations/citationService.js';
import { ToolExecutor } from './toolExecutor.js';
import { agentTools } from './toolRegistry.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { defaultTemporalResolver } from '../memory/temporalResolver.js';
import { config } from '../config/index.js';

export interface OrchestratorRunParams {
  conversationId: string;
  userMessage: string;
  referenceDate?: string;
  onChunk?: (token: string) => void;
}

export interface OrchestratorRunResult {
  reply: string;
  conversationId: string;
  messageId: string;
  citations: FormattedCitation[];
  retrieval: RetrievalResult;
  toolCallsExecuted: number;
}

export class AgentOrchestrator {
  private geminiClient = new GeminiClient();
  private toolExecutor: ToolExecutor;

  constructor(
    private conversationService: ConversationService,
    private memoryRetriever: MemoryRetriever,
    private citationService: CitationService
  ) {
    this.toolExecutor = new ToolExecutor(this.citationService);
  }

  async run(params: {
    conversationId: string;
    userMessage: string;
    referenceDate?: string;
  }): Promise<OrchestratorRunResult> {
    const { conversationId, userMessage, referenceDate } = params;

    // 1. Persist user message immediately to ensure it's never lost
    const { message: userRecord } = this.conversationService.addMessage({
      conversationId,
      role: 'user',
      content: userMessage,
      createdAt: referenceDate,
    });

    // 2. Memory Retrieval Pipeline (internal service)
    const retrieval = this.memoryRetriever.retrieve(userMessage, referenceDate);

    // 3. Get existing conversation history
    const allHistory = this.conversationService.getMessages(conversationId);
    // Recent conversation turns (excluding the turn we just added)
    const previousMessages = allHistory.slice(0, allHistory.length - 1);

    // Check for rolling summary
    const summaryRecord = this.conversationService.summaryRepo.getByConversationId(conversationId);

    // 4. Construct System Instruction
    const currentClock = defaultTemporalResolver.formatContextAnchor(referenceDate);
    const systemPrompt = buildSystemPrompt({
      currentTimestamp: currentClock,
      appTimezone: config.appTimezone,
    });

    // 5. Assemble Context Contents for Gemini
    const contents: ModelContent[] = [];

    // Inject Summary if present
    if (summaryRecord) {
      contents.push({
        role: 'user',
        parts: [{ text: `[CONVERSATION BACKGROUND SUMMARY]:\n${summaryRecord.summary}` }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will maintain continuity with this background context.' }],
      });
    }

    // Inject recent messages (up to last 6 messages)
    const recentTurns = previousMessages.slice(-6);
    for (const msg of recentTurns) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }

    // Current turn prompt with memory context injection
    const userPromptWithMemory = `${retrieval.contextString}\nUser Query: ${userMessage}`;
    contents.push({
      role: 'user',
      parts: [{ text: userPromptWithMemory }],
    });

    const collectedCitations: FormattedCitation[] = [];
    let toolCallsCount = 0;
    const MAX_TOOL_ITERATIONS = 3;
    let finalAnswer = '';

    // If Gemini is available, run bounded tool calling loop
    if (this.geminiClient.isAvailable()) {
      let loopCount = 0;
      try {
        while (loopCount < MAX_TOOL_ITERATIONS) {
          loopCount++;

          const response = await this.geminiClient.generate({
            systemInstruction: systemPrompt,
            contents,
            tools: agentTools,
          });

          // If tool was called
          if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            toolCallsCount++;

            // Append model turn with exact model parts (preserving thoughtSignature)
            contents.push({
              role: 'model',
              parts: response.rawParts && response.rawParts.length > 0
                ? response.rawParts
                : [{ functionCall: { name: call.name, args: call.args } }],
            });

            // Execute tool (web_search)
            const execution = await this.toolExecutor.execute(call.name, call.args);
            if (execution.citations.length > 0) {
              collectedCitations.push(...execution.citations);
            }

            // Append function response turn
            contents.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: call.name,
                    response: execution.output,
                  },
                },
              ],
            });
          } else {
            // Model returned final text answer
            finalAnswer = response.text || '';
            break;
          }
        }
      } catch (err: any) {
        console.error('Gemini generate error:', err);
        // Graceful resilience if external model is unavailable (503 / network / rate limit)
        finalAnswer = this.generateDeterministicFallback(userMessage, retrieval);
      }
    } else {
      // Deterministic memory fallback when Gemini API key is not configured
      finalAnswer = this.generateDeterministicFallback(userMessage, retrieval);
    }

    // Safety net: if model turns exhausted or returned empty text, generate deterministic memory answer
    if (!finalAnswer.trim()) {
      finalAnswer = this.generateDeterministicFallback(userMessage, retrieval);
    }

    // Append formatted citation references if citations were collected and not already in answer
    if (collectedCitations.length > 0 && !finalAnswer.includes('**Sources:**')) {
      finalAnswer += this.citationService.formatCitationBlock(collectedCitations);
    }

    // Strip any leaked internal raw UUIDs or database IDs from the assistant output
    finalAnswer = finalAnswer
      .replace(/\[[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\]/g, '')
      .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '')
      .replace(/Fact\s*ID:\s*[^\n\r]+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // 6. Persist assistant reply with metadata
    const { message: assistantRecord } = this.conversationService.addMessage({
      conversationId,
      role: 'assistant',
      content: finalAnswer,
      metadata: {
        citations: collectedCitations,
        retrievalCount: retrieval.scoredMemories.length,
        temporalFilter: retrieval.temporal.term || null,
        toolCallsExecuted: toolCallsCount,
      },
    });

    // 7. Trigger rolling summary check asynchronously
    const updatedMessages = this.conversationService.getMessages(conversationId);
    this.conversationService.summarizer.updateSummaryIfNeeded(conversationId, updatedMessages).catch(() => {});

    return {
      reply: finalAnswer,
      conversationId,
      messageId: assistantRecord.id,
      citations: collectedCitations,
      retrieval,
      toolCallsExecuted: toolCallsCount,
    };
  }

  /**
   * Deterministic answer generator when no LLM key is configured (for local testing without paid keys)
   */
  private generateDeterministicFallback(query: string, retrieval: RetrievalResult): string {
    const lower = query.toLowerCase();

    // 0. Explicit format request: Tabular format
    if (/tabl(?:e|ar)/i.test(lower) && retrieval.hasRelevantMemory) {
      const activeRows = retrieval.scoredMemories
        .filter(sm => !sm.memory.valid_until)
        .map(sm => {
          const m = sm.memory;
          const recDate = new Date(m.recorded_at);
          const dateStr = recDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = recDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const label = m.predicate.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `| **${label}** | ${m.value} | ${dateStr} at ${timeStr} | Active |`;
        });

      if (activeRows.length > 0) {
        return `Based on your previous conversations, here is your recorded profile in tabular format:\n\n| Attribute | Value | Recorded Date | Status |\n| :--- | :--- | :--- | :--- |\n${activeRows.join('\n')}`;
      }
    }

    // 0b. Acknowledge user statements/updates directly rather than reciting previous values
    if (/(?:changed\s+my\s+mind|now\s+my\s+budget|my\s+budget\s+is\s+[\d₹$]|i\s+left|now\s+work\s+at|i\s+work\s+at\s+[a-zA-Z]|i\s+live\s+in\s+[a-zA-Z]|i'm\s+planning\s+to)/i.test(lower)) {
      if (/budget/i.test(lower)) {
        const activeBudget = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'budget' && !sm.memory.valid_until);
        return `Got it! I've updated your laptop budget to ${activeBudget ? activeBudget.memory.value : 'your specified amount'}.`;
      }
      if (/work|company/i.test(lower)) {
        const comp = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'company' && !sm.memory.valid_until);
        return `Got it! I've noted that you work at ${comp ? comp.memory.value : 'your new company'}.`;
      }
      return 'Got it! I have recorded your updated information in persistent memory.';
    }

    // 1. Scoped query: Where do I work / Which company
    if (/where.*(?:do\s+i\s+)?work|which\s+company|who\s+do\s+i\s+work\s+for|my\s+employer/i.test(lower)) {
      const comp = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'company' && !sm.memory.valid_until);
      if (comp) {
        return `You work at ${comp.memory.value}.`;
      }
    }

    // 1b. Scoped query: Where do I live
    if (/where.*(?:do\s+i\s+)?live|my\s+location|which\s+city/i.test(lower)) {
      const loc = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'location' && !sm.memory.valid_until);
      if (loc) {
        return `You live in ${loc.memory.value}.`;
      }
    }

    // 1c. Scoped query: What processor
    if (/what\s+processor|which\s+processor|cpu/i.test(lower)) {
      const proc = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'processor' && !sm.memory.valid_until);
      if (proc) {
        return `You specified an ${proc.memory.value} processor.`;
      }
      return "Based on our conversation history, you haven't mentioned a specific processor for your laptop yet.";
    }

    // 1d. Scoped query: About the specs / what specs
    if (/about\s+(?:the\s+)?specs|what\s+specs/i.test(lower)) {
      const gpu = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'gpu_specs' && !sm.memory.valid_until);
      const proc = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'processor' && !sm.memory.valid_until);
      if (gpu || proc) {
        const parts = [];
        if (gpu) parts.push(`GPU: ${gpu.memory.value}`);
        if (proc) parts.push(`Processor: ${proc.memory.value}`);
        return `Here are the specifications you have specified so far:\n- ${parts.join('\n- ')}`;
      }
      return "Based on our conversation history, you haven't mentioned specific technical specifications (like GPU or processor) yet.";
    }

    // 1e. Hardware specs directive (e.g. "i want now some specific specs RTX 50 60 or above")
    if (/rtx|gtx|gpu|graphics/i.test(lower) && /(?:want|need|prefer|now)/i.test(lower)) {
      const gpu = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'gpu_specs' && !sm.memory.valid_until);
      return `Noted! I have recorded your preference for an ${gpu ? gpu.memory.value : 'RTX 5060 or above'} GPU in persistent memory.`;
    }

    // 1f. Missing memory case
    if (!retrieval.hasRelevantMemory) {
      return "I couldn't find a previous conversation where you mentioned that. Could you remind me?";
    }

    const topMemory = retrieval.scoredMemories[0].memory;

    // 2. Laptop brand preference recall (specific query)
    if (/brand/i.test(lower) && !/need|plan|budget|price|all|what are/i.test(lower) && topMemory.predicate === 'preferred_laptop_brand') {
      return `You preferred ${topMemory.value}.`;
    }

    // 3. Laptop budget recall (specific query)
    if (/budget/i.test(lower) && !/need|plan|brand|price|all|what are/i.test(lower)) {
      const isPastBudget = /previous|before|was\s+my|earlier/i.test(lower);
      if (isPastBudget) {
        const older = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'budget' && sm.memory.valid_until);
        if (older) {
          return `Your previously mentioned budget was ${older.memory.value}.`;
        }
      }
      const activeBudget = retrieval.scoredMemories.find(sm => sm.memory.predicate === 'budget' && !sm.memory.valid_until);
      if (activeBudget) {
        return `Your current laptop budget is ${activeBudget.memory.value}.`;
      }
      return `Your previously mentioned budget was ${topMemory.value}.`;
    }

    // 4. Subscription price recall (specific query)
    if (/subscription/i.test(lower) && topMemory.predicate === 'price_per_month') {
      return `The previously discussed subscription price was ${topMemory.value} (recorded on ${topMemory.recorded_at.slice(0, 10)}).`;
    }

    // 4b. Bookmarked source recall (specific query)
    if (/bookmark|saved?\s*(?:source|link)|source\s*link/i.test(lower) && topMemory.predicate === 'bookmarked_source') {
      return `You previously bookmarked the source: **${topMemory.value}** (recorded on ${topMemory.recorded_at.slice(0, 10)}).`;
    }

    // 5. Broad needs, plans, and preferences recall with timestamps (only when asked)
    if (/need|plan|require|prefer|discussed|conservations|conversations|what did|what are|time|when|remember|history|my specs/i.test(lower)) {
      const bulletPoints = retrieval.scoredMemories
        .filter(item => !item.memory.valid_until || /previous|past|history|earlier/i.test(lower))
        .map(item => {
          const m = item.memory;
          const recDate = new Date(m.recorded_at);
          const dateStr = recDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = recDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const label = m.predicate.replace(/_/g, ' ');
          return `• **${m.subject} ${label}**: ${m.value} *(Recorded on ${dateStr} at ${timeStr})*`;
        });

      return `Based on your previous conversations, here is what you shared regarding your needs and preferences:\n\n${bulletPoints.join('\n')}`;
    }

    // General memory response
    return `Based on our previous conversation on ${topMemory.recorded_at.slice(0, 10)}, you noted that ${topMemory.subject} ${topMemory.predicate.replace(/_/g, ' ')} was ${topMemory.value}.`;
  }
}
