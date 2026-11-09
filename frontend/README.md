# Frontend Workspace (`@qr-restaurant/web`)

Modern Next.js 15 (App Router) web application powering the customer QR menu, kitchen display system (KDS), restaurant owner dashboard, and super admin platform.

---

## 🏗️ Architecture & Conventions

- **Framework**: Next.js 15 with React 19 and Tailwind CSS.
- **Centralized API Client**: All HTTP API requests and WebSocket configurations go through `src/services/api/index.ts`. No components or hooks make ad-hoc fetch/axios calls directly to endpoints.
- **Strict Boundary**: Frontend imports NEVER cross into `backend/`. This is enforced via ESLint `no-restricted-imports`.
- **Shared Types**: DTOs and contracts are imported from `@qr-restaurant/shared`.
- **State Management**: TanStack React Query v5 for server state; Zustand for local client state (cart, auth, table session).

---

## 📂 Directory Layout

```
frontend/
├── public/                 # Static branding, notification sounds, icons
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── (auth)/         # Sign in, registration, forgot password
│   │   ├── [slug]/         # Customer QR digital menu & table ordering
│   │   ├── admin/          # Platform Super Admin portal
│   │   ├── kitchen/        # Live Kitchen Display Screen (KDS)
│   │   ├── owner/          # Restaurant Owner dashboard & analytics
│   │   ├── waiter/         # Waiter mobile call/service management
│   │   └── ...
│   ├── components/         # Modular UI component library
│   ├── hooks/              # Custom React hooks (socket listeners, query hooks)
│   ├── services/
│   │   └── api/            # Centralized API client & socket instance
│   ├── store/              # Zustand state stores (auth, cart)
│   ├── types/              # Local frontend types
│   └── lib/                # Client utility functions & backward compatibility
├── .env.example            # Environment variables template
├── .eslintrc.json          # ESLint configuration with boundary rules
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### 1. Environment Configuration
Copy `.env.example` to `.env.local` or `.env`:
```bash
cp .env.example .env.local
```

Key environment variables:
- `NEXT_PUBLIC_API_URL`: Backend API URL (e.g. `http://localhost:4000/api/v1`)
- `NEXT_PUBLIC_SOCKET_URL`: Backend Socket.io URL (e.g. `http://localhost:4000`)
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`: Client Razorpay checkout key

### 2. Available Scripts (from workspace root)
```bash
# Start development server on port 3000
npm run dev --workspace=@qr-restaurant/web

# Build for production
npm run build --workspace=@qr-restaurant/web

# Type check TypeScript without emitting files
npm run type-check --workspace=@qr-restaurant/web

# Lint with ESLint
npm run lint --workspace=@qr-restaurant/web
```
