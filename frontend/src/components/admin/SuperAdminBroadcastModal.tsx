'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Mail, Send, X, Users, Store, Loader2, CheckCircle2 } from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';

interface SuperAdminBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SuperAdminBroadcastModal({ isOpen, onClose }: SuperAdminBroadcastModalProps) {
  const [activeTab, setActiveTab] = useState<'notification' | 'email'>('notification');
  const [targetRole, setTargetRole] = useState<'ALL_OWNERS' | 'ALL_CUSTOMERS' | 'EVERYONE'>('ALL_OWNERS');
  
  // Notification form
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  // Email form
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const handleSendNotification = async () => {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.error('Please enter both title and message for notification broadcast');
      return;
    }
    setSendingNotif(true);
    try {
      const res = await api.post('/admin/broadcast-notification', {
        title: notifTitle,
        message: notifMessage,
        targetRole,
      });
      toast.success(res.data.message || 'Broadcast notification sent successfully!');
      setNotifTitle('');
      setNotifMessage('');
      onClose();
    } catch {
      toast.error('Failed to send broadcast notification');
    } finally {
      setSendingNotif(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailContent.trim()) {
      toast.error('Please enter subject and message content for broadcast email');
      return;
    }
    setSendingEmail(true);
    try {
      const res = await api.post('/admin/broadcast-email', {
        subject: emailSubject,
        message: emailContent,
        targetRole,
      });
      toast.success(res.data.message || 'Broadcast emails sent successfully!');
      setEmailSubject('');
      setEmailContent('');
      onClose();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to send broadcast email. Please check SMTP settings.';
      toast.error(errMsg);
    } finally {
      setSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-card border border-border rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 relative text-foreground overflow-hidden"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg flex-shrink-0">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-foreground">📢 Super Admin Broadcast System</h2>
              <p className="text-xs text-muted-foreground">Send mass updates to restaurant owners and customers</p>
            </div>
          </div>

          {/* Target Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Audience:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetRole('ALL_OWNERS')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                  targetRole === 'ALL_OWNERS'
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                <Store className="w-3.5 h-3.5" /> All Owners
              </button>
              <button
                type="button"
                onClick={() => setTargetRole('ALL_CUSTOMERS')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                  targetRole === 'ALL_CUSTOMERS'
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> All Customers
              </button>
              <button
                type="button"
                onClick={() => setTargetRole('EVERYONE')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                  targetRole === 'EVERYONE'
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                🌐 Everyone
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('notification')}
              className={`pb-2 text-xs font-bold border-b-2 px-4 transition-colors flex items-center gap-1.5 ${
                activeTab === 'notification'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" /> Dashboard Notification
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`pb-2 text-xs font-bold border-b-2 px-4 transition-colors flex items-center gap-1.5 ${
                activeTab === 'email'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Mail className="w-3.5 h-3.5" /> Broadcast Email
            </button>
          </div>

          {/* Tab 1: Dashboard Notification */}
          {activeTab === 'notification' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notification Title</label>
                <input
                  type="text"
                  placeholder="e.g. System Maintenance Notice / New Feature Alert"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notification Message Body</label>
                <textarea
                  rows={4}
                  placeholder="Write the announcement message here..."
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium resize-none"
                />
              </div>

              <button
                onClick={handleSendNotification}
                disabled={sendingNotif}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {sendingNotif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendingNotif ? 'Sending Broadcast...' : 'Dispatch Dashboard Broadcast'}
              </button>
            </div>
          )}

          {/* Tab 2: Email Broadcast */}
          {activeTab === 'email' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Configured to send from: <strong>ssharma636076@gmail.com</strong></span>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Email Subject Line</label>
                <input
                  type="text"
                  placeholder="e.g. Important Platform Announcement from Super Admin"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Email Message (HTML / Plain text)</label>
                <textarea
                  rows={4}
                  placeholder="Dear Restaurant Owner, We are pleased to announce..."
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium resize-none"
                />
              </div>

              <button
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sendingEmail ? 'Sending Emails via SMTP...' : 'Send Mass Broadcast Email'}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
