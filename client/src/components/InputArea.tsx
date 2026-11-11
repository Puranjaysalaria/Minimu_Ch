import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface InputAreaProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, isLoading, disabled = false }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || disabled) return;
    onSendMessage(trimmed);
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-md px-4 py-3 sm:px-6">
      <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-inner focus-within:border-teal-500/60 focus-within:ring-1 focus-within:ring-teal-500/30 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question, state a fact, or ask about historical changes... (Shift+Enter for newline)"
          rows={1}
          disabled={isLoading || disabled}
          className="flex-1 max-h-40 bg-transparent text-slate-100 placeholder-slate-500 text-sm p-2 resize-none focus:outline-none"
        />

        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading || disabled}
          aria-label="Send message"
          className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:hover:bg-teal-600 text-white font-medium transition-all shrink-0 shadow-sm"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      <div className="max-w-4xl mx-auto flex items-center justify-between text-[11px] text-slate-500 mt-2 px-2">
        <span>Minimi Grounded AI — Immutable Memory & Real-Time Tavily Verification</span>
        <span className="hidden sm:inline">Press Enter ↵ to send</span>
      </div>
    </div>
  );
};
