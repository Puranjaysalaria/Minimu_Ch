import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { ChatArea } from './components/ChatArea.js';
import { InputArea } from './components/InputArea.js';
import { MemoryDrawer } from './components/MemoryDrawer.js';
import { Conversation, Message } from './types/index.js';
import {
  fetchHealth,
  fetchConversations,
  fetchConversationDetails,
  createConversation,
  deleteConversation,
  sendMessage,
} from './services/api.js';

export const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isMemoryDrawerOpen, setIsMemoryDrawerOpen] = useState<boolean>(false);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    status: string;
    database: string;
    timezone: string;
    geminiConfigured: boolean;
    tavilyConfigured: boolean;
  } | null>(null);

  // Initial load
  useEffect(() => {
    loadHealth();
    loadConversations();
  }, []);

  const loadHealth = async () => {
    try {
      const data = await fetchHealth();
      setHealthInfo(data);
    } catch (err) {
      console.error('Health fetch failed:', err);
    }
  };

  const loadConversations = async () => {
    try {
      const list = await fetchConversations();
      setConversations(list);
      if (list.length > 0 && !activeConversationId) {
        selectConversation(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const selectConversation = async (id: string) => {
    setActiveConversationId(id);
    setError(null);
    try {
      const data = await fetchConversationDetails(id);
      setMessages(data.messages || []);
    } catch (err: any) {
      setError('Failed to load conversation history.');
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConversationId === id) {
        if (remaining.length > 0) {
          selectConversation(remaining[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleSendMessage = async (text: string) => {
    setError(null);
    setLastUserMessage(text);

    // Optimistic user message addition
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await sendMessage({
        conversationId: activeConversationId || undefined,
        message: text,
      });

      const assistantMsg: Message = {
        id: res.messageId,
        conversation_id: res.conversationId,
        role: 'assistant',
        content: res.reply,
        created_at: new Date().toISOString(),
        metadata: {
          citations: res.citations,
          toolCallsExecuted: res.toolCallsExecuted,
        },
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (!activeConversationId) {
        setActiveConversationId(res.conversationId);
      }

      // Refresh conversations list to update title & timestamp
      const updatedList = await fetchConversations();
      setConversations(updatedList);
    } catch (err: any) {
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans antialiased text-slate-100">
      {/* Left Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onOpenMemoryDrawer={() => setIsMemoryDrawerOpen(true)}
        healthInfo={healthInfo}
      />

      {/* Main Chat View */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/50">
        <ChatArea
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSelectPrompt={handleSendMessage}
          onRetry={lastUserMessage ? () => handleSendMessage(lastUserMessage) : undefined}
        />

        <InputArea
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </main>

      {/* Memory Vault Inspection Drawer */}
      <MemoryDrawer
        isOpen={isMemoryDrawerOpen}
        onClose={() => setIsMemoryDrawerOpen(false)}
      />
    </div>
  );
};

export default App;
