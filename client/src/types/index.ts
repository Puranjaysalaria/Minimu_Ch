export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface FormattedCitation {
  index: number;
  id: string;
  title: string;
  url: string;
  domain: string;
  excerpt: string;
  publishedAt?: string | null;
  retrievedAt: string;
}

export interface MessageMetadata {
  citations?: FormattedCitation[];
  retrievalCount?: number;
  temporalFilter?: string | null;
  toolCallsExecuted?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: string | null | MessageMetadata;
}

export interface MemoryRecord {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  category: 'preference' | 'budget' | 'plan' | 'decision' | 'fact' | 'correction';
  confidence: number;
  source_type: 'explicit_statement' | 'reasonable_inference' | 'uncertain';
  source_message_id?: string | null;
  source_conversation_id?: string | null;
  valid_from: string;
  valid_until?: string | null;
  recorded_at: string;
  supersedes_id?: string | null;
}
