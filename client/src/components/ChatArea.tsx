import React, { useRef, useEffect } from 'react';
import { Sparkles, Bot, AlertCircle, ArrowRight } from 'lucide-react';
import { Message } from '../types/index.js';
import { MessageBubble } from './MessageBubble.js';

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  onSelectPrompt: (text: string) => void;
  onRetry?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  error,
  onSelectPrompt,
  onRetry,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const examplePrompts = [
    {
      title: 'Store Laptop Preference',
      prompt: 'I am planning to buy a laptop. My budget is ₹80,000, and I prefer ASUS.',
      badge: 'Memory Store',
    },
    {
      title: 'Historical Brand Recall',
      prompt: 'Which brand did I prefer for my laptop?',
      badge: 'Memory Recall',
    },
    {
      title: 'Store Subscription Price',
      prompt: 'The subscription cost ₹499 per month.',
      badge: 'Price Baseline',
    },
    {
      title: 'Compare Historical vs Current',
      prompt: 'Has the subscription price changed since we discussed it?',
      badge: 'Web Verification',
    },
  ];

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-4">
      {messages.length === 0 ? (
        <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 mx-auto flex items-center justify-center shadow-lg shadow-teal-500/5">
            <Bot className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Welcome to Minimi
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Your conversational AI agent with persistent long-term memory, temporal reasoning, and
              real-time web change verification.
            </p>
          </div>

          {/* Example prompt cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-4">
            {examplePrompts.map((item, idx) => (
              <button
                key={idx}
                onClick={() => onSelectPrompt(item.prompt)}
                className="group p-3.5 rounded-xl border border-slate-800 bg-slate-900/70 hover:bg-slate-800/80 hover:border-teal-500/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-slate-700">
                      {item.badge}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h3 className="text-xs font-semibold text-slate-200 group-hover:text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    "{item.prompt}"
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-1">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 py-4 items-center text-slate-400 text-xs">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-400 animate-pulse">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" />
                </div>
                <span className="text-slate-400 font-medium">Minimi is reasoning & verifying...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-3 my-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 text-rose-100 font-medium shrink-0 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
