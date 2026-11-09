'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import api from '@/services/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAccessToken, setUser } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      toast.error('Authentication failed: No token provided');
      router.push('/login');
      return;
    }

    async function fetchUser() {
      try {
        // Temporarily store the token in the zustand state so the Axios request interceptor attaches it
        setAccessToken(token as string);
        
        // Fetch current user details
        const response = await api.get('/auth/me');
        const user = response.data.data.user;
        
        // Formally sign in the user
        setUser(user, token as string);

        toast.success(`Welcome, ${user.name}! 👋`);

        if (user.role === 'SUPER_ADMIN') {
          router.push('/admin/dashboard');
        } else if (user.role === 'RESTAURANT_OWNER') {
          router.push('/owner/dashboard');
        } else {
          router.push('/scan-qr');
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        toast.error('Failed to retrieve user profile after login.');
        router.push('/login');
      }
    }

    fetchUser();
  }, [searchParams, router, setAccessToken, setUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Completing sign in, please wait...</p>
      </div>
    </div>
  );
}
