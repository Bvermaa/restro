'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Camera, AlertCircle, ArrowRight, Store, ShieldCheck, LogOut, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ThemeToggle } from '@/components/ThemeToggle';
import { toast } from 'sonner';

export default function ScanQrPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [inputSlug, setInputSlug] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerContainerId = 'qr-reader-container';

  const handleProcessQrResult = (scannedText: string) => {
    if (!scannedText) return;
    try {
      let targetPath = scannedText.trim();
      
      // If it's a full URL (e.g. http://localhost:3001/r/upstates?table=5)
      if (targetPath.includes('/r/')) {
        const parts = targetPath.split('/r/');
        targetPath = `/r/${parts[1]}`;
      } else if (!targetPath.startsWith('/')) {
        // Plain slug entered
        targetPath = `/r/${targetPath}`;
      }
      
      toast.success('QR Code detected! Redirecting to menu...');
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
      router.push(targetPath);
    } catch (err) {
      toast.error('Invalid QR code format. Please scan a valid table QR code.');
    }
  };

  const startScanner = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
      }

      const html5Qrcode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5Qrcode;

      await html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleProcessQrResult(decodedText);
        },
        () => {
          // ignore scan errors per frame
        }
      );
      setIsScanning(true);
    } catch (err: any) {
      console.error('Camera scanner error:', err);
      toast.error('Camera access permission denied or camera unavailable.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        // ignore cleanup error
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).then(() => {
          scannerRef.current?.clear().catch(() => {});
        });
      }
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSlug.trim()) {
      toast.error('Please enter a restaurant code or QR link.');
      return;
    }
    handleProcessQrResult(inputSlug);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-between p-4 sm:p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="w-full max-w-xl flex items-center justify-between relative z-10 py-2">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-lg text-foreground">EZ- Restaurant</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user && (
            <button
              onClick={() => {
                logout();
                toast.success('Logged out successfully');
                router.push('/login');
              }}
              className="p-2 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground text-xs flex items-center gap-1.5 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Notice Container */}
      <main className="w-full max-w-lg my-auto relative z-10 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Mandatory QR Notice Card */}
          <div className="bg-card border-2 border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-bl-full pointer-events-none" />
            
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 text-orange-500 mx-auto flex items-center justify-center border border-orange-500/30 shadow-inner">
                <QrCode className="w-8 h-8 animate-pulse" />
              </div>

              {/* Primary User Notice */}
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs font-semibold text-amber-500 mb-3">
                  <AlertCircle className="w-3.5 h-3.5" />
                  QR Scan Required
                </span>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground leading-snug">
                  First you have to scan our system linked QR code then you will see the menu
                </h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-2 leading-relaxed">
                  Customer ordering is table-specific. Scan the official QR code located on your dining table or room card to access the menu.
                </p>
              </div>

              {/* Interactive Camera Scanner Area */}
              <div className="pt-2">
                <div className="bg-muted/50 border border-border rounded-2xl p-4 min-h-[220px] flex flex-col items-center justify-center relative overflow-hidden">
                  <div
                    id={scannerContainerId}
                    className={`w-full max-w-[280px] rounded-xl overflow-hidden ${!isScanning ? 'hidden' : 'block'}`}
                  />

                  {!isScanning && (
                    <div className="text-center space-y-3 py-4">
                      <Camera className="w-12 h-12 text-muted-foreground mx-auto stroke-1" />
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                        Allow camera access to scan your table's QR code directly from your device.
                      </p>
                      <button
                        type="button"
                        onClick={startScanner}
                        className="px-5 py-2.5 rounded-xl text-white font-medium bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md shadow-orange-500/20 transition-all text-xs inline-flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Open Camera Scanner
                      </button>
                    </div>
                  )}

                  {isScanning && (
                    <div className="mt-3 flex items-center justify-between w-full text-xs">
                      <span className="text-orange-400 font-medium flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Scanning QR code...
                      </span>
                      <button
                        type="button"
                        onClick={stopScanner}
                        className="text-muted-foreground hover:text-foreground underline"
                      >
                        Close Camera
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual URL / Slug Input Fallback */}
              <div className="pt-2">
                <div className="relative flex items-center my-3">
                  <div className="flex-grow border-t border-border" />
                  <span className="flex-shrink mx-3 text-xs text-muted-foreground uppercase font-semibold tracking-wider">Or Enter Restaurant Code</span>
                  <div className="flex-grow border-t border-border" />
                </div>

                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. upstates or full QR link"
                    value={inputSlug}
                    onChange={(e) => setInputSlug(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-muted border border-border rounded-xl text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl text-xs sm:text-sm hover:from-orange-600 hover:to-amber-600 transition-all flex items-center gap-1 shadow-md shadow-orange-500/20"
                  >
                    Open <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* User Account Bar */}
          {user && (
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-orange-400" />
                <span>Signed in as <strong>{user.name}</strong> ({user.email})</span>
              </div>
              {user.role === 'SUPER_ADMIN' && (
                <Link href="/admin/dashboard" className="text-orange-400 font-semibold hover:underline">
                  Admin Dashboard →
                </Link>
              )}
              {user.role === 'RESTAURANT_OWNER' && (
                <Link href="/owner/dashboard" className="text-orange-400 font-semibold hover:underline">
                  Owner Dashboard →
                </Link>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-xl text-center text-xs text-muted-foreground py-2 relative z-10">
        © EZ- Restaurant SaaS • System-linked table ordering platform
      </footer>
    </div>
  );
}
