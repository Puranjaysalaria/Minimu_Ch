import { Message } from '../database/repositories/messageRepo.js';
import { SummaryRepository, ConversationSummary } from '../database/repositories/summaryRepo.js';

export class ConversationSummarizer {
  constructor(private summaryRepo: SummaryRepository) {}

  /**
   * Generates or updates rolling summary if message count exceeds threshold
   */
  async updateSummaryIfNeeded(
    conversationId: string,
    messages: Message[],
    threshold = 8
  ): Promise<ConversationSummary | null> {
    if (messages.length <= threshold) {
      return this.summaryRepo.getByConversationId(conversationId);
    }

    // Older messages to summarize (everything except last 4 messages)
    const messagesToSummarize = messages.slice(0, messages.length - 4);
    const existing = this.summaryRepo.getByConversationId(conversationId);

    // Simple robust incremental summarizer
    const points: string[] = [];
    if (existing && existing.summary) {
      points.push(existing.summary);
    }

    const newExchanges = messagesToSummarize.map(m => `[${m.role.toUpperCase()} on ${m.created_at.slice(0, 10)}]: ${m.content.slice(0, 150)}`);
    const combinedSummary = `Rolling summary of earlier conversation turns:\n` +
      `- Exchanges covered: ${messagesToSummarize.length} messages.\n` +
      `- Key points:\n  * ` +
      newExchanges.slice(-4).join('\n  * ');

    return this.summaryRepo.saveSummary(conversationId, combinedSummary);
  }

  getSummary(conversationId: string): ConversationSummary | null {
    return this.summaryRepo.getByConversationId(conversationId);
  }
}
