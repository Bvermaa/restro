'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/services/api';
import { toast } from 'sonner';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function VerifyEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email address...');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link: Token is missing.');
      return;
    }

    async function verify() {
      try {
        const response = await api.post('/auth/verify-email', { token });
        setStatus('success');
        setMessage(response.data.message || 'Email verified successfully! You can now log in.');
        toast.success('Email verified successfully! 🎉');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } catch (err: any) {
        setStatus('error');
        const errMsg = err.response?.data?.error || err.response?.data?.message || 'Verification failed. The token may be invalid or expired.';
        setMessage(errMsg);
        toast.error(errMsg);
      }
    }

    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl relative z-10">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Verifying Email</h1>
            <p className="text-slate-400 text-sm">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Verification Success</h1>
            <p className="text-slate-300 text-sm mb-6">{message}</p>
            <p className="text-xs text-slate-500 mb-6">Redirecting you to login page in 3 seconds...</p>
            <Link href="/login" className="w-full py-3 rounded-xl text-white font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/20 text-sm block">
              Go to Sign In
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center">
            <XCircle className="w-16 h-16 text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Verification Failed</h1>
            <p className="text-slate-300 text-sm mb-6">{message}</p>
            <Link href="/login" className="w-full py-3 rounded-xl text-white font-semibold bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm block">
              Back to Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
