# Backend Workspace (`@qr-restaurant/server`)

Production-grade Express.js & TypeScript API server providing REST endpoints, WebSocket event channels, Prisma ORM database management, and asynchronous background jobs.

---

## 🏗️ Architecture & Conventions

- **Framework**: Express.js with TypeScript and Winston logging.
- **Database & ORM**: PostgreSQL with Prisma ORM located in `backend/prisma/`.
- **Cache & WebSockets**: Redis for session caching/rate limiting, Socket.io for live kitchen and waiter events.
- **Strict Boundary**: Backend code NEVER imports from `frontend/`. This is enforced via ESLint `no-restricted-imports`.
- **Shared Contracts**: DTOs, interfaces, and role definitions are imported from `@qr-restaurant/shared`.

---

## 📂 Directory Layout

```
backend/
├── prisma/
│   ├── schema.prisma       # Database schema and relations
│   ├── seed.ts             # Initial database seed script
│   └── migrations/         # Prisma migration history
├── src/
│   ├── config/             # DB, Redis, Cloudinary, OAuth configs
│   ├── controllers/        # Express route controllers
│   ├── jobs/               # Background cron jobs (subscriptions, reminders)
│   ├── middlewares/        # Auth, RBAC, Rate-Limiting, Error Handling
│   ├── routes/             # REST route declarations (/api/v1)
│   ├── services/           # Business logic, AI, Payments, Mailer
│   ├── sockets/            # Socket.io handlers and room managers
│   ├── utils/              # Token helpers, response formatters
│   └── index.ts            # Server entry point
├── .env.example            # Environment template for backend service
├── .eslintrc.json          # ESLint configuration with boundary rules
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### 1. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Ensure `DATABASE_URL` points to an active PostgreSQL instance and `REDIS_URL` points to Redis.

### 2. Database Migrations
```bash
# Generate Prisma Client
npm run prisma:generate --workspace=@qr-restaurant/server

# Run database migrations
npm run prisma:migrate --workspace=@qr-restaurant/server

# Seed database with initial roles and super admin
npx ts-node src/prisma/seed.ts
```

### 3. Available Scripts (from workspace root)
```bash
# Start backend in development mode (hot reloading on port 4000)
npm run dev --workspace=@qr-restaurant/server

# Build for production
npm run build --workspace=@qr-restaurant/server

# Type check TypeScript without emitting files
npm run type-check --workspace=@qr-restaurant/server

# Lint with ESLint
npm run lint --workspace=@qr-restaurant/server
```
