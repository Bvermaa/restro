'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Send, X, Store, User, Loader2, Circle } from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';

interface Contact {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurant?: Array<{ id: string; name: string; logo: string | null }>;
  unreadCount: number;
  lastMessage?: { message: string; createdAt: string; senderId: string } | null;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

interface AdminOwnerChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: { id: string; name: string } | null;
}

export function AdminOwnerChatModal({ isOpen, onClose, targetUser: initialTarget }: AdminOwnerChatModalProps) {
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch chat contacts
  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['chat-contacts'],
    queryFn: async () => {
      const res = await api.get('/chat/contacts');
      return res.data.data.contacts as Contact[];
    },
    enabled: isOpen,
    refetchInterval: 5000,
  });

  // Set default contact
  useEffect(() => {
    if (contactsData && contactsData.length > 0) {
      if (initialTarget) {
        const found = contactsData.find((c) => c.id === initialTarget.id);
        if (found) setSelectedContact(found);
        else setSelectedContact(contactsData[0]);
      } else if (!selectedContact) {
        setSelectedContact(contactsData[0]);
      }
    }
  }, [contactsData, initialTarget]);

  // Fetch messages with selected contact
  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['chat-messages', selectedContact?.id],
    queryFn: async () => {
      if (!selectedContact) return [];
      const res = await api.get(`/chat/messages/${selectedContact.id}`);
      return res.data.data.messages as Message[];
    },
    enabled: isOpen && !!selectedContact,
    refetchInterval: 3000,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (messageText: string) => {
      if (!selectedContact) return;
      await api.post('/chat/messages', {
        receiverId: selectedContact.id,
        message: messageText,
      });
    },
    onSuccess: () => {
      setInputMessage('');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', selectedContact?.id] });
      queryClient.invalidateQueries({ queryKey: ['chat-contacts'] });
    },
    onError: () => toast.error('Failed to send message'),
  });

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || sendMutation.isPending) return;
    sendMutation.mutate(inputMessage.trim());
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-card border border-border rounded-3xl max-w-4xl w-full h-[600px] shadow-2xl flex overflow-hidden relative text-foreground"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Left Sidebar: Contacts */}
          <div className="w-80 border-r border-border flex flex-col bg-muted/20">
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-center gap-2 font-display font-bold text-sm text-foreground">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span>1-to-1 Live Support Chat</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {currentUser?.role === 'SUPER_ADMIN' ? 'Direct owner communications' : 'Chat with Platform Admin'}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingContacts ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading contacts...
                </div>
              ) : contactsData?.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No contacts available</div>
              ) : (
                contactsData?.map((contact) => {
                  const isSelected = selectedContact?.id === contact.id;
                  const restName = contact.restaurant && contact.restaurant[0]?.name;

                  return (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className={`w-full text-left p-3 rounded-2xl transition-all flex items-center gap-3 border ${
                        isSelected
                          ? 'bg-primary/10 border-primary/30 shadow-sm'
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <div className="relative w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary flex-shrink-0">
                        {contact.name.charAt(0).toUpperCase()}
                        {contact.unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white rounded-full text-[10px] font-black flex items-center justify-center animate-bounce">
                            {contact.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-xs text-foreground truncate">{contact.name}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {restName ? `🏪 ${restName}` : contact.role}
                        </p>
                        {contact.lastMessage && (
                          <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
                            {contact.lastMessage.senderId === currentUser?.id ? 'You: ' : ''}{contact.lastMessage.message}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Window: Active Message Thread */}
          <div className="flex-1 flex flex-col bg-card">
            {selectedContact ? (
              <>
                {/* Active Contact Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                      {selectedContact.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{selectedContact.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedContact.restaurant && selectedContact.restaurant[0]?.name
                          ? `Owner of ${selectedContact.restaurant[0].name}`
                          : selectedContact.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Messages Body */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-muted/5">
                  {loadingMessages ? (
                    <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading message history...
                    </div>
                  ) : messagesData?.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                      No previous messages. Start the conversation below! 👋
                    </div>
                  ) : (
                    messagesData?.map((msg) => {
                      const isMe = msg.senderId === currentUser?.id;

                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs space-y-1 shadow-sm ${
                              isMe
                                ? 'bg-primary text-white rounded-br-none'
                                : 'bg-muted border border-border text-foreground rounded-bl-none'
                            }`}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                            <span className={`text-[9px] block text-right opacity-70 ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Form */}
                <form onSubmit={handleSend} className="p-3 border-t border-border flex items-center gap-2 bg-card">
                  <input
                    type="text"
                    placeholder="Type your message..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-muted border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim() || sendMutation.isPending}
                    className="px-4 py-2.5 bg-primary hover:bg-primary/95 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-sm font-semibold">Select a contact to start chatting</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
