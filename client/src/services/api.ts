import { Conversation, Message, MemoryRecord, FormattedCitation } from '../types/index.js';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{
  status: string;
  database: string;
  timezone: string;
  geminiConfigured: boolean;
  tavilyConfigured: boolean;
}> {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/conversations`);
  const data = await res.json();
  return data.conversations || [];
}

export async function createConversation(title?: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  return data.conversation;
}

export async function fetchConversationDetails(id: string): Promise<{
  conversation: Conversation;
  messages: Message[];
  summary: string | null;
}> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  return res.json();
}

export async function deleteConversation(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function sendMessage(params: {
  conversationId?: string;
  message: string;
  referenceDate?: string;
}): Promise<{
  reply: string;
  conversationId: string;
  messageId: string;
  citations: FormattedCitation[];
  toolCallsExecuted: number;
}> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || errorData.details || `Error ${res.status}`);
  }

  return res.json();
}

export async function fetchMemories(onlyActive = false): Promise<MemoryRecord[]> {
  const res = await fetch(`${API_BASE}/memories?onlyActive=${onlyActive}`);
  const data = await res.json();
  return data.memories || [];
}

export async function searchMemories(query: string): Promise<MemoryRecord[]> {
  const res = await fetch(`${API_BASE}/memories/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.results || [];
}

export async function fetchMemoryDetails(id: string): Promise<{
  memory: MemoryRecord;
  auditHistory: MemoryRecord[];
}> {
  const res = await fetch(`${API_BASE}/memories/${id}`);
  return res.json();
}
