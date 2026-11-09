# 🍽️ EZ-Restro — Enterprise QR Restaurant Management & SaaS Platform

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey?style=for-the-badge&logo=express)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Cache%20%26%20RateLimit-DC382D?style=for-the-badge&logo=redis)](https://redis.io/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Real--Time-010101?style=for-the-badge&logo=socket.io)](https://socket.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=for-the-badge&logo=turborepo)](https://turbo.build/)

> A cutting-edge, multi-tenant QR code dining and restaurant operations ecosystem. Streamlines customer ordering, contactless payments, live Kitchen Display Systems (KDS), waiter dispatch, AI-powered menu recommendations, and deep financial analytics in a single unified SaaS solution.

---

## 🌟 Executive Summary

**EZ-Restro** transforms traditional dine-in, takeaway, and room delivery workflows into seamless digital experiences. Customers scan contactless QR codes placed at tables to browse interactive, multi-lingual digital menus, customize orders, and pay instantly via UPI, Cards, or Wallet. 

Simultaneously, kitchen staff receive instant real-time kitchen tickets with sound alerts, managers monitor live floor activity, and franchise owners analyze revenue metrics, margins, and customer retention from an intuitive control center.

---

## 🚀 Key Highlights & Core Capabilities

### 📱 1. Contactless QR Dining & Self-Ordering
- **Dynamic Table Placards:** Generate high-resolution printable table QR codes and room placards with custom branding.
- **Interactive Digital Menu:** Rich visual cards, dietary tags (Veg, Non-Veg, Vegan, Gluten-Free), dish badges (`Best Seller`, `Popular`, `Trending`), customizable variants, and add-on modifier groups.
- **Instant Guest Ordering:** No app download required. Customers order right from their mobile browser with optional instant guest checkout or member sign-in.
- **Multi-Order Support:** Add items iteratively to an active dining session before final billing.

### 👨‍🍳 2. Real-Time Kitchen Display System (KDS) & Waiter Dispatch
- **Live WebSocket Pipeline:** Kitchen staff and waiters receive immediate audio and visual alerts when an order is placed or updated.
- **Stage Progression Flow:** Seamless transition across `PENDING` ➔ `CONFIRMED` ➔ `PREPARING` ➔ `BAKING` ➔ `READY` ➔ `DELIVERED`.
- **Waiter Call & Service Requests:** Diners can request water, call the waiter, or request the bill directly from their phone screen.

### 💳 3. Flexible Multi-Mode Payment Engine
- **Direct UPI & QR Intent:** Direct UPI QR dynamic generation for zero-commission instant settlement.
- **Razorpay Integration:** Full payment gateway checkout supporting credit/debit cards, net banking, and wallets.
- **Offline & Traditional:** Support for Cash on Delivery (COD) and "Pay to Waiter" with bill clearance confirmation.
- **Customer Digital Wallet & Loyalty:** Built-in wallet recharge, cashback incentives, and loyalty points redemption engine.

### 🤖 4. AI-Powered Dining & Management Intelligence
- **Google Gemini 1.5 Flash:** Smart automated coupon generation, menu item description writing, and sales demand forecasting.
- **Groq Llama 3 Fast Inference:** Sub-second AI dining assistant chatbot answering guest questions regarding allergens, wine pairings, and dish recommendations.

### 🏢 5. Multi-Tenant Architecture & Super Admin Control
- **Franchise / Multi-Branch Management:** Individual restaurant slugs, custom brand colors, custom tax/GST rates, and operating hour schedules.
- **Tiered SaaS Subscriptions:** Super Admin subscription plans, feature gating, trial periods, and automated expiration jobs.
- **Granular RBAC:** Role-Based Access Control spanning `SUPER_ADMIN`, `RESTAURANT_OWNER`, `KITCHEN`, and `CUSTOMER`.

---

## 🛠️ Technology Stack

| Layer | Technologies & Tools |
| :--- | :--- |
| **Monorepo Architecture** | Turborepo, NPM Workspaces, TypeScript 5.6+ |
| **Frontend Web App** | Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons, Radix UI Primitives, Framer Motion |
| **State & Data Fetching** | TanStack React Query v5, Zustand, React Hook Form, Zod Validation |
| **Backend API Server** | Node.js, Express.js 4.21, TypeScript, Winston Logger |
| **Database & ORM** | PostgreSQL 16, Prisma ORM 5.22 |
| **Caching & Real-Time** | Redis (ioredis), Socket.io v4 (WebSockets) |
| **Authentication & Security** | JWT (Access & Refresh tokens with HTTP-only cookies), Google OAuth 2.0, Helmet, CORS, Rate Limiting (Redis store) |
| **Media & File Storage** | Cloudinary SDK (Direct image compression & cloud storage) |
| **Payments & Billing** | Razorpay SDK, Webhooks, Direct UPI, PDF Invoice Generation |
| **AI & Automation** | Google Generative AI (`gemini-1.5-flash`), Groq SDK (`llama3-8b-8192`) |
| **DevOps & Containerization** | Docker, Docker Compose, Multi-stage Dockerfiles |

---

## 📂 Project Architecture

```
Restaurant-Management/
├── .github/                        # CI/CD Workflows, CODEOWNERS, Dependabot, PR templates
│   ├── CODEOWNERS                  # Team ownership boundaries
│   ├── pull_request_template.md    # PR checklists and guidelines
│   ├── dependabot.yml              # Automated dependency update configuration
│   └── workflows/
│       ├── frontend-ci.yml         # Frontend build, lint, type-check, audit
│       ├── backend-ci.yml          # Backend build, test, Postgres service, audit
│       ├── security-scan.yml       # Gitleaks + CodeQL static analysis
│       └── deploy.yml              # Path-filtered staging & production deployment
├── frontend/                       # Next.js 15 Frontend Web Application
│   ├── public/                     # Static assets, sounds, icons
│   ├── src/
│   │   ├── app/                    # App Router (Public, Menu, Kitchen, Owner, Admin)
│   │   ├── components/             # Reusable UI component library (Radix + Tailwind)
│   │   ├── hooks/                  # Custom React hooks (Socket, Cart, Auth, Queries)
│   │   ├── services/api/           # Centralized API client (Axios & Socket.io)
│   │   ├── store/                  # Zustand global state stores
│   │   └── lib/                    # Helpers and backward-compatibility exports
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── backend/                        # Express.js REST API & WebSocket Server
│   ├── prisma/                     # Database Schema & Migration files
│   │   ├── schema.prisma           # Prisma data models & relations
│   │   ├── seed.ts                 # Initial DB seed data (Admin, Roles, Demo)
│   │   └── migrations/             # Versioned SQL migration files
│   ├── src/
│   │   ├── config/                 # DB, Redis, Cloudinary, OAuth configurations
│   │   ├── controllers/            # Request controllers (Auth, Order, Menu, Admin)
│   │   ├── jobs/                   # Background scheduled jobs (Subscriptions, cleanups)
│   │   ├── middlewares/            # Auth guard, RBAC, error handling, rate limits
│   │   ├── routes/                 # Express API route declarations
│   │   ├── services/               # Business logic, AI, Payments, Mailer, Sockets
│   │   ├── sockets/                # Socket.io event rooms and dispatchers
│   │   ├── utils/                  # Token utils, PDF generation, formatters
│   │   └── index.ts                # Server entrypoint
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── packages/
│   └── shared/                     # Shared TypeScript types, Zod schemas & DTOs
├── docker/                         # Production multi-stage Dockerfiles
│   ├── Dockerfile.frontend         # Next.js frontend production container
│   └── Dockerfile.backend          # Express backend production container
├── docs/                           # Architecture, API & Runbook documentation
│   ├── API.md                      # REST endpoints and WebSocket events
│   ├── ARCHITECTURE.md             # System architecture & Mermaid diagrams
│   └── RUNBOOK.md                  # Operations, migrations, deploy & rollbacks
├── .editorconfig                   # Unified cross-editor styling rules
├── .gitignore
├── docker-compose.yml              # Local containerized infrastructure (Postgres, Redis)
├── render.yaml                     # Render Blueprint deployment definition
├── SECURITY.md                     # Security policy & responsible disclosure SLA
├── turbo.json                      # Turborepo task pipeline configuration
└── package.json                    # Workspace root scripts and dependencies
```

---

## ⚙️ Quick Start & Installation

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js**: v20.0.0 or higher
- **NPM**: v10.0.0 or higher
- **PostgreSQL**: v14+ (or run via Docker)
- **Redis**: v6+ (or run via Docker)

---

### 2. Clone Repository

```bash
git clone https://github.com/Shivasharma12/QR-Restro.git
cd QR-Restro
```

---

### 3. Install Dependencies

Using NPM at the repository root to install all workspace packages:

```bash
npm install
```

---

### 4. Configure Environment Variables

Create `.env` file in the root directory (and apps where required) by copying the example:

```bash
cp .env.example .env
```

Open `.env` and configure your credentials:

```ini
# Database (PostgreSQL)
DATABASE_URL="postgresql://postgres:password@localhost:5432/qr_restaurant_db?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Authentication
JWT_ACCESS_SECRET="your-super-secret-access-key-min-64-chars-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-min-64-chars-change-in-production"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server & Client URLs
PORT=4000
NODE_ENV="development"
CLIENT_URL="http://localhost:3000"
API_URL="http://localhost:4000"

# Cloudinary (Image Uploads)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Razorpay (Payments)
RAZORPAY_KEY_ID="rzp_test_xxxxxx"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_xxxxxx"
RAZORPAY_KEY_SECRET="your-secret"
RAZORPAY_WEBHOOK_SECRET="your-webhook-secret"

# AI Integrations
GROQ_API_KEY="gsk_xxxxxx"
GROQ_MODEL="llama3-8b-8192"
GEMINI_API_KEY="AIzaSyxxxxxx"
GEMINI_MODEL="gemini-1.5-flash"

# Mailer (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

---

### 5. Setup Database & Seed Initial Data

Run Prisma migrations and populate baseline records:

```bash
# Generate Prisma Client
npm run db:generate

# Push database schema to PostgreSQL
npm run db:push

# Seed database with Super Admin & Demo Restaurant
npm run db:seed
```

Default seeded Super Admin credentials:
- **Email:** `admin@qrrestaurant.com`
- **Password:** `Admin@123456`

---

### 6. Run the Application in Development

Launch both frontend and backend concurrently via Turborepo:

```bash
npm run dev
```

- **Frontend Application:** [http://localhost:3000](http://localhost:3000) (or `3001` depending on port availability)
- **Backend API Server:** [http://localhost:4000](http://localhost:4000)
- **Swagger Interactive API Docs:** [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

---

## 🐳 Docker Deployment

You can spin up the entire infrastructure (PostgreSQL, Redis, API Server, and Web) using Docker Compose:

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down
```

---

## 🔒 Security & Best Practices

- **Role-Based Protection:** Enforced at both API route middleware and Next.js client layout levels.
- **Session Protection:** High-entropy JWT tokens with HTTP-only cookie rotation to prevent XSS and CSRF attacks.
- **DDoS & Abuse Mitigation:** Distributed Redis rate limiters for general APIs and strict rules on authentication routes.
- **Data Validation:** Strict end-to-end type safety using Zod schemas shared across frontend and backend.
- **Sanitized Headers:** HTTP headers hardened with Helmet security suite.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📬 Contact & Support

Project Author & Maintainer:

- **Name:** Shiva Sharma
- **Email:** [shivasharmamoz123123@gmail.com](mailto:shivasharmamoz123123@gmail.com)
- **GitHub:** [@Shivasharma12](https://github.com/Shivasharma12)
- **Repository:** [Shivasharma12/QR-Restro](https://github.com/Shivasharma12/QR-Restro)

---

<p align="center">
  Made with ❤️ by Shiva Sharma • EZ-Restro Platform
</p>
