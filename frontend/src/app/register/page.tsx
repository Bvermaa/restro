import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import RegisterClient from './RegisterClient';

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <p className="text-slate-400 text-sm">Loading...</p>
          </div>
        </div>
      }
    >
      <RegisterClient />
    </Suspense>
  );
}
