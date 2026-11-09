'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Bot, User, Loader2, Search, Sparkles, Utensils } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/auth.store';

export interface SuggestedItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  isVeg?: boolean;
  isVegan?: boolean;
  image?: string | null;
  description?: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestedItems?: SuggestedItem[];
}

interface AIChatbotProps {
  restaurantId: string;
  restaurantName: string;
  themeColor: string;
  onClose: () => void;
  onSearchDish?: (query: string) => void;
  onSelectCategory?: (category: string) => void;
}

function renderFormattedMessage(content: string) {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-1" />;
        }
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={lineIdx} className="leading-relaxed">
            {parts.map((part, partIdx) => {
              if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                const boldText = part.slice(2, -2);
                return (
                  <strong key={partIdx} className="font-bold text-foreground">
                    {boldText}
                  </strong>
                );
              }
              return <span key={partIdx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function AIChatbot({
  restaurantId,
  restaurantName,
  themeColor,
  onClose,
  onSearchDish,
  onSelectCategory,
}: AIChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I'm your AI assistant for ${restaurantName}. 🍽️ I can help you find food by budget, dietary preference (Veg/Non-Veg), or category. What would you like to eat today?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();

  const sessionId = useRef(
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendQuery = async (queryText: string) => {
    if (!queryText.trim() || isLoading) return;

    const userMessage = queryText.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const { data } = await api.post('/ai/chat', {
        restaurantId,
        message: userMessage,
        sessionId: sessionId.current,
      });

      const reply = data.data.reply as string;
      const suggestedItems = (data.data.suggestedItems as SuggestedItem[]) || [];

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply,
          suggestedItems,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I'm having trouble retrieving menu suggestions right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    "🔥 Best sellers?",
    "🥗 Veg under ₹200?",
    "🍗 Spicy Chicken?",
    "🍰 Desserts & Drinks",
    "💰 Budget meals",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 left-3 sm:left-auto sm:w-96 z-50 flex flex-col max-w-[calc(100vw-1.5rem)]"
      style={{ maxHeight: '75vh' }}
    >
      <div className="bg-card border-2 border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden text-foreground">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-border/60"
          style={{ background: `linear-gradient(135deg, ${themeColor}, #F48C06)` }}
        >
          <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-extrabold text-sm truncate">AI Food Assistant</p>
            <p className="text-white/80 text-xs truncate">{restaurantName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Messages list */}
        <div
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 scrollbar-thin"
          style={{ minHeight: '220px', maxHeight: '52vh' }}
        >
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === 'assistant' ? 'bg-primary/10 border border-primary/20' : 'bg-muted'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <Bot className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>

              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-white rounded-tr-none font-medium'
                    : 'bg-muted/90 text-foreground border border-border/60 rounded-tl-none'
                }`}
                style={msg.role === 'user' ? { backgroundColor: themeColor } : {}}
              >
                {renderFormattedMessage(msg.content)}

                {/* Render Suggested Items Cards inside message bubble */}
                {msg.suggestedItems && msg.suggestedItems.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" /> Recommended Dishes:
                    </p>
                    <div className="space-y-1.5">
                      {msg.suggestedItems.map((item) => (
                        <div
                          key={item.id}
                          className="bg-card hover:bg-muted p-2 rounded-xl border border-border flex items-center justify-between gap-2 transition-all"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center shrink-0 ${
                                item.isVeg ? 'border-emerald-600' : 'border-red-600'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  item.isVeg ? 'bg-emerald-600' : 'bg-red-600'
                                }`}
                              />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-xs text-foreground truncate">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground font-semibold">
                                {item.category ? `${item.category} • ` : ''}₹{item.price}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (onSearchDish) {
                                onSearchDish(item.name);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold text-white shrink-0 shadow-xs hover:opacity-90 active:scale-95 transition-all flex items-center gap-1"
                            style={{ backgroundColor: themeColor }}
                          >
                            <Search className="w-3 h-3" /> Search
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-muted/90 border border-border/60 rounded-2xl rounded-tl-none px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                    />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">Searching menu...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="px-3 py-2 bg-muted/40 border-t border-border/40 flex gap-1.5 overflow-x-auto no-scrollbar">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSendQuery(prompt)}
              className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-card border border-border hover:bg-muted text-foreground transition-all active:scale-95"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2 p-2.5 border-t border-border bg-card">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendQuery(input);
            }}
            placeholder="Search dishes, prices or ask suggestions..."
            className="flex-1 bg-muted rounded-xl px-3.5 py-2.5 text-xs sm:text-sm border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground font-medium"
          />
          <button
            onClick={() => handleSendQuery(input)}
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0 shadow-md"
            style={{ backgroundColor: themeColor }}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
