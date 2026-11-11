import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AgentOrchestrator } from '../agent/orchestrator.js';
import { ConversationService } from '../conversations/conversationService.js';
import { MemoryRetriever } from '../memory/memoryRetriever.js';
import { CitationService } from '../citations/citationService.js';
import { SourceRepository } from '../database/repositories/sourceRepo.js';
import { defaultTemporalResolver } from '../memory/temporalResolver.js';
import { getDatabase } from '../database/connection.js';

export const chatRouter = Router();

const ChatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1, 'Message cannot be empty'),
  referenceDate: z.string().optional(),
});

function getOrchestrator(): AgentOrchestrator {
  const db = getDatabase();
  const convService = new ConversationService(db);
  const sourceRepo = new SourceRepository(db);
  const citationService = new CitationService(sourceRepo);
  const retriever = new MemoryRetriever(
    convService.memoryRepo,
    convService.messageRepo,
    convService.entityRepo,
    defaultTemporalResolver
  );

  return new AgentOrchestrator(convService, retriever, citationService);
}

// POST /api/chat (Standard JSON REST endpoint)
chatRouter.post('/', async (req: Request, res: Response) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  const { message, referenceDate } = parsed.data;
  const db = getDatabase();
  const convService = new ConversationService(db);

  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    // Generate title from first few words of user prompt
    const snippet = message.slice(0, 35).trim();
    const conv = convService.createConversation(snippet || 'New Conversation');
    conversationId = conv.id;
  } else {
    const existing = convService.getConversation(conversationId);
    if (!existing) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
  }

  try {
    const orchestrator = getOrchestrator();
    const result = await orchestrator.run({
      conversationId,
      userMessage: message,
      referenceDate,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      error: 'An internal error occurred while processing the request.',
      details: err.message,
    });
  }
});

// POST /api/chat/stream (Server-Sent Events streaming)
chatRouter.post('/stream', async (req: Request, res: Response) => {
  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  const { message, referenceDate } = parsed.data;
  const db = getDatabase();
  const convService = new ConversationService(db);

  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    const snippet = message.slice(0, 35).trim();
    const conv = convService.createConversation(snippet || 'New Conversation');
    conversationId = conv.id;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, data: Record<string, unknown>) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('status', { status: 'Retrieving memory & temporal grounding...' });

    const orchestrator = getOrchestrator();
    const result = await orchestrator.run({
      conversationId,
      userMessage: message,
      referenceDate,
    });

    if (result.citations.length > 0) {
      sendEvent('citations', { citations: result.citations });
    }

    sendEvent('done', {
      conversationId: result.conversationId,
      messageId: result.messageId,
      reply: result.reply,
      citations: result.citations,
      retrieval: result.retrieval,
    });

    res.end();
  } catch (err: any) {
    sendEvent('error', { error: err.message || 'Stream processing failed' });
    res.end();
  }
});
