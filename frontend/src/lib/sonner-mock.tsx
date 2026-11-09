'use client';

import React from 'react';

// Completely neutralized mock for sonner
export const toast: any = Object.assign(
  (_message?: any, _data?: any) => '',
  {
    success: (_message?: any, _data?: any) => '',
    info: (_message?: any, _data?: any) => '',
    warning: (_message?: any, _data?: any) => '',
    error: (_message?: any, _data?: any) => '',
    custom: (_jsx?: any, _data?: any) => '',
    message: (_message?: any, _data?: any) => '',
    promise: <T,>(promise: Promise<T> | (() => Promise<T>), _data?: any) => {
      const p = typeof promise === 'function' ? promise() : promise;
      return { unwrap: () => p };
    },
    dismiss: (_id?: any) => '',
    loading: (_message?: any, _data?: any) => '',
    getHistory: () => [],
    getToasts: () => [],
  }
);

export const Toaster = React.forwardRef<HTMLElement, any>(() => null);
Toaster.displayName = 'Toaster';

export function useSonner() {
  return { toasts: [] };
}

export type Action = any;
export type ExternalToast = any;
export type ToastClassnames = any;
export type ToastT = any;
export type ToastToDismiss = any;
export type ToasterProps = any;

export default toast;
