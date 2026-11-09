'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuthStore, getInMemoryAccessToken } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api, { getSocketUrl, registerSocket } from '@/services/api';
import { io, Socket } from 'socket.io-client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isBootstrapping } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isBootstrapping) {
      if (!isAuthenticated || !user) {
        router.push('/login');
      } else if (user.role !== 'SUPER_ADMIN') {
        router.push('/');
      }
    }
  }, [mounted, isBootstrapping, user, isAuthenticated, router]);

  // Socket.io connection for Super Admin real-time updates
  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;

    const token = getInMemoryAccessToken();
    const socket: Socket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      withCredentials: true,
      auth: { token: token ? `Bearer ${token}` : undefined },
    });
    const unregister = registerSocket(socket);
    socketRef.current = socket;

    socket.emit('join:user', user.id);
    socket.emit('join:admin');

    socket.on('admin:new_restaurant', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-restaurants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    });

    socket.on('admin:new_subscription', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    });

    socket.on('notification:new', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat-contacts'] });
    });

    socket.on('order:new', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['admin-analytics'] });
    });

    return () => {
      unregister();
      socket.disconnect();
    };
  }, [user, queryClient]);

  if (!mounted || !user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
