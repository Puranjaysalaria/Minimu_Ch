import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ConversationService } from '../conversations/conversationService.js';
import { getDatabase } from '../database/connection.js';

export const conversationRouter = Router();

const CreateConversationSchema = z.object({
  title: z.string().optional(),
});

function getService(): ConversationService {
  return new ConversationService(getDatabase());
}

// GET /api/conversations
conversationRouter.get('/', (req: Request, res: Response) => {
  const service = getService();
  const conversations = service.getAllConversations();
  res.json({ conversations });
});

// POST /api/conversations
conversationRouter.post('/', (req: Request, res: Response) => {
  const parsed = CreateConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.format() });
    return;
  }

  const service = getService();
  const conv = service.createConversation(parsed.data.title || 'New Conversation');
  res.status(201).json({ conversation: conv });
});

// GET /api/conversations/:id
conversationRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const service = getService();
  const conv = service.getConversation(id);
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const messages = service.getMessages(id);
  const summary = service.summaryRepo.getByConversationId(id);

  res.json({
    conversation: conv,
    messages,
    summary: summary ? summary.summary : null,
  });
});

// DELETE /api/conversations/:id
conversationRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const service = getService();
  const success = service.deleteConversation(id);
  if (!success) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json({ success: true, message: 'Conversation deleted successfully' });
});
