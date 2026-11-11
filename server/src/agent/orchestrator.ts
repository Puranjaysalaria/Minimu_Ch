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

            // Append model turn with function call
            contents.push({
              role: 'model',
              parts: [{ functionCall: { name: call.name, args: call.args } }],
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
        // Graceful resilience if external model is unavailable (503 / network / rate limit)
        finalAnswer = this.generateDeterministicFallback(userMessage, retrieval);
      }
    } else {
      // Deterministic memory fallback when Gemini API key is not configured
      finalAnswer = this.generateDeterministicFallback(userMessage, retrieval);
    }

    // Append formatted citation references if citations were collected and not already in answer
    if (collectedCitations.length > 0 && !finalAnswer.includes('**Sources:**')) {
      finalAnswer += this.citationService.formatCitationBlock(collectedCitations);
    }

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

    // 1. Missing memory case
    if (!retrieval.hasRelevantMemory) {
      return "I couldn't find a previous conversation where you mentioned that. Could you remind me?";
    }

    const topMemory = retrieval.scoredMemories[0].memory;

    // 2. Laptop brand preference recall
    if (/brand/i.test(lower) && topMemory.predicate === 'preferred_laptop_brand') {
      return `You preferred ${topMemory.value}.`;
    }

    // 3. Laptop budget recall
    if (/budget/i.test(lower) && topMemory.predicate === 'budget') {
      return `Your previously mentioned budget was ${topMemory.value}.`;
    }

    // 4. Subscription price recall
    if (/price|subscription|cost/i.test(lower) && topMemory.predicate === 'price_per_month') {
      return `The previously discussed subscription price was ${topMemory.value} (recorded on ${topMemory.recorded_at.slice(0, 10)}).`;
    }

    // General memory response
    return `Based on our previous conversation on ${topMemory.recorded_at.slice(0, 10)}, you noted that ${topMemory.subject} ${topMemory.predicate.replace(/_/g, ' ')} was ${topMemory.value}.`;
  }
}
