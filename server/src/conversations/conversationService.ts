import { IDatabase } from '../database/connection.js';
import { ConversationRepository, Conversation } from '../database/repositories/conversationRepo.js';
import { MessageRepository, Message } from '../database/repositories/messageRepo.js';
import { MemoryRepository, MemoryRecord } from '../database/repositories/memoryRepo.js';
import { SummaryRepository } from '../database/repositories/summaryRepo.js';
import { EntityRepository } from '../database/repositories/entityRepo.js';
import { MemoryExtractor } from '../memory/memoryExtractor.js';
import { ConversationSummarizer } from '../memory/summarizer.js';

export class ConversationService {
  public conversationRepo: ConversationRepository;
  public messageRepo: MessageRepository;
  public memoryRepo: MemoryRepository;
  public summaryRepo: SummaryRepository;
  public entityRepo: EntityRepository;
  public extractor: MemoryExtractor;
  public summarizer: ConversationSummarizer;

  constructor(db: IDatabase) {
    this.conversationRepo = new ConversationRepository(db);
    this.messageRepo = new MessageRepository(db);
    this.memoryRepo = new MemoryRepository(db);
    this.summaryRepo = new SummaryRepository(db);
    this.entityRepo = new EntityRepository(db);
    this.extractor = new MemoryExtractor(this.memoryRepo);
    this.summarizer = new ConversationSummarizer(this.summaryRepo);
  }

  createConversation(title?: string, customId?: string): Conversation {
    return this.conversationRepo.create(title, customId);
  }

  getConversation(id: string): Conversation | null {
    return this.conversationRepo.getById(id);
  }

  getAllConversations(): Conversation[] {
    return this.conversationRepo.getAll();
  }

  deleteConversation(id: string): boolean {
    return this.conversationRepo.delete(id);
  }

  getMessages(conversationId: string): Message[] {
    return this.messageRepo.getByConversationId(conversationId);
  }

  addMessage(params: {
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown> | null;
    customId?: string;
    createdAt?: string;
  }): { message: Message; extractedMemories: MemoryRecord[] } {
    const message = this.messageRepo.create({
      conversation_id: params.conversationId,
      role: params.role,
      content: params.content,
      metadata: params.metadata,
      customId: params.customId,
      created_at: params.createdAt,
    });

    let extractedMemories: MemoryRecord[] = [];

    // Extract facts from user statements or factual assistant confirmations
    if (params.role === 'user' || params.role === 'assistant') {
      extractedMemories = this.extractor.processAndSave(
        params.content,
        params.conversationId,
        message.id,
        params.createdAt
      );
    }

    return { message, extractedMemories };
  }
}
