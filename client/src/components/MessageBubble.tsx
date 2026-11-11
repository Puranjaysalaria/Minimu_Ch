import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Sparkles, Copy, Check, Database, Globe } from 'lucide-react';
import { Message, MessageMetadata, FormattedCitation } from '../types/index.js';
import { CitationCard } from './CitationCard.js';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  // Parse metadata if string
  let meta: MessageMetadata | null = null;
  if (message.metadata) {
    if (typeof message.metadata === 'string') {
      try {
        meta = JSON.parse(message.metadata);
      } catch {
        meta = null;
      }
    } else {
      meta = message.metadata;
    }
  }

  const citations: FormattedCitation[] = meta?.citations || [];
  const hadToolCalls = (meta?.toolCallsExecuted || 0) > 0;
  const hadMemoryRetrieval = (meta?.retrievalCount || 0) > 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 py-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-400 mt-1">
          <Sparkles className="w-4 h-4" />
        </div>
      )}

      <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Verification badges */}
        {!isUser && (hadToolCalls || hadMemoryRetrieval) && (
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {hadMemoryRetrieval && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800/50">
                <Database className="w-2.5 h-2.5" />
                Memory Grounded
              </span>
            )}
            {hadToolCalls && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-950/60 text-blue-300 border border-blue-800/50">
                <Globe className="w-2.5 h-2.5" />
                Live Web Verified
              </span>
            )}
          </div>
        )}

        <div
          className={`relative group rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-teal-600 text-white rounded-tr-none'
              : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}

          {/* Copy button */}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800/80 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-slate-200"
              title="Copy response"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Citations Preview Grid */}
        {citations.length > 0 && (
          <div className="mt-3 w-full">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">
              Referenced Web Sources ({citations.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {citations.map((c) => (
                <CitationCard key={c.id || c.index} citation={c} />
              ))}
            </div>
          </div>
        )}

        <span className="text-[10px] text-slate-500 mt-1 px-1">
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 mt-1">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};
