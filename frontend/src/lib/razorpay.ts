// This file is deprecated.
// The signature verification function has been moved directly to the server-only Route Handler
// (apps/web/src/app/api/webhook/razorpay/route.ts) to prevent Webpack from trying to bundle
// the Node.js 'crypto' module for client-side components, which causes runtime TypeErrors.
export {};
