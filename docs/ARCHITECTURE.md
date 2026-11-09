# Architecture Overview

This document details the architectural boundaries, dependency flows, and separation of concerns in the QR Restaurant Monorepo.

---

## 1. Monorepo Structural Boundaries

The repository is organized into strictly isolated workspaces orchestrated via Turborepo:

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Workspace (frontend)"]
        UI["Next.js App Router (UI / Pages / Components)"]
        State["Client State (Zustand Stores)"]
        ApiClient["Centralized API Client (src/services/api/index.ts)"]
        UI --> State
        State --> ApiClient
    end

    subgraph SharedLayer["Shared Contracts (packages/shared)"]
        Types["TypeScript Interfaces & Types"]
        Validation["Zod Schemas & Constants"]
    end

    subgraph ServerLayer["Backend Workspace (backend)"]
        API["Express API Server (src/app.ts)"]
        MW["Middleware (Auth, RBAC, Rate-Limit, ErrorHandler)"]
        Controllers["Controllers & Business Logic"]
        Prisma["Prisma ORM (backend/prisma)"]
        API --> MW
        MW --> Controllers
        Controllers --> Prisma
    end

    subgraph StorageLayer["Data & Persistence"]
        DB[("PostgreSQL 16")]
        Cache[("Redis (Sessions & Rate Limiting)")]
        Prisma --> DB
        MW --> Cache
    end

    %% Architectural Boundaries
    ApiClient -- "HTTP / REST & WebSocket (/api/v1)" --> API
    UI -. "Imports Types Only" .-> Types
    Controllers -. "Imports Types & Schemas" .-> Types
```

---

## 2. Hard Isolation Rules

1. **Strict No-Cross-Imports**:
   - `frontend/` MUST NEVER import from `backend/`
   - `backend/` MUST NEVER import from `frontend/`
   - Enforced by ESLint rule `no-restricted-imports` and TypeScript path resolution.
2. **Centralized Communication Gate**:
   - The frontend communicates with the backend exclusively through HTTP REST calls and WebSocket events originating from `frontend/src/services/api/index.ts`.
3. **Shared Contracts**:
   - Data transfer object (DTO) interfaces, role enums, and order status definitions reside in `packages/shared`.
   - `packages/shared` compiles before frontend and backend via Turbo pipeline dependency (`^build`).
4. **Database Encapsulation**:
   - The Prisma Client and schema are private to `backend/`. The frontend never has direct access to the database or Prisma schemas.

---

## 3. Request Lifecycle & Single-Flight Refresh Token Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser
    participant Store as Auth Store (In-Memory)
    participant Client as Axios API Client
    participant Proxy as Next.js Proxy (/api/v1)
    participant AuthAPI as Express Auth Router
    participant API as Express Protected API
    participant DB as PostgreSQL (Prisma)

    %% 1. Initial Login
    User->>Client: Submit Login Credentials
    Client->>Proxy: POST /api/v1/auth/login { email, password }
    Proxy->>AuthAPI: Forward POST /auth/login
    AuthAPI->>DB: Validate User & Password Hash
    AuthAPI->>DB: Create RefreshToken (SHA-256 hash, familyId)
    AuthAPI-->>Client: 200 OK + Set-Cookie "rt" (HttpOnly, path=/api/v1/auth) + Body { accessToken: "jwt_1" }
    Client->>Store: Store accessToken ("jwt_1") in-memory only

    %% 2. Normal Request & 401
    Note over User,DB: ... 15 Minutes Pass (Access Token "jwt_1" Expires) ...
    User->>Client: Trigger API Call (e.g. GET /owner/orders)
    Client->>Proxy: GET /api/v1/owner/orders [Header: Authorization Bearer jwt_1]
    Proxy->>API: Forward GET /owner/orders [Bearer jwt_1]
    API->>API: Verify JWT (fails: TokenExpiredError)
    API-->>Proxy: 401 Unauthorized { code: "TOKEN_EXPIRED" }
    Proxy-->>Client: 401 Unauthorized

    %% 3. Single-Flight Refresh
    Note over Client,AuthAPI: Interceptor captures 401: creates single-flight refresh promise
    Client->>Proxy: POST /api/v1/auth/refresh [Cookie: rt=token_v1]
    Proxy->>AuthAPI: Forward POST /auth/refresh [Cookie: rt=token_v1]
    AuthAPI->>DB: Verify SHA-256(token_v1) & check revokedAt is NULL
    AuthAPI->>DB: Transaction: revoke token_v1 & issue token_v2 in same familyId
    AuthAPI-->>Proxy: 200 OK + Set-Cookie "rt=token_v2" + Body { accessToken: "jwt_2" }
    Proxy-->>Client: 200 OK + Set-Cookie "rt=token_v2" + Body { accessToken: "jwt_2" }
    Client->>Store: Update in-memory accessToken ("jwt_2")
    Client->>Client: Reconnect active Socket.io client with "jwt_2"

    %% 4. Automatic Retry
    Note over Client,API: Interceptor retries original failed request with new access token
    Client->>Proxy: GET /api/v1/owner/orders [Header: Authorization Bearer jwt_2]
    Proxy->>API: Forward GET /owner/orders [Bearer jwt_2]
    API->>API: Verify JWT (valid)
    API->>DB: Query owner orders
    DB-->>API: Orders data
    API-->>Proxy: 200 OK + { data: orders }
    Proxy-->>Client: 200 OK
    Client-->>User: Seamless Render (Zero Flashing, Zero Logout)
```

---

## 4. Real-time Kitchen & Waiter Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Diner as Customer at Table 4
    participant DinerApp as Customer Mobile Web
    participant Server as Socket.io Server (backend)
    participant KitchenApp as Kitchen Display System (KDS)
    participant WaiterApp as Waiter Mobile App

    DinerApp->>Server: POST /menu/rest-123/call-waiter { table: 4 }
    Server->>Server: Validate table session & restaurant
    Server->>WaiterApp: Emit "waiter:called" { tableNumber: 4, timestamp }
    WaiterApp-->>Diner: Waiter arrives at table

    Diner->>DinerApp: Confirms Cart Order
    DinerApp->>Server: POST /api/v1/orders
    Server->>Server: Commit order to PostgreSQL
    Server->>KitchenApp: Emit "order:created" { orderId, items, table: 4 }
    KitchenApp->>KitchenApp: Play sound alert & render new KDS ticket
```

---

## 5. Deployment Topology

- **Web Service (Frontend)**: Deployed as a containerized Next.js service or Static Web App via `docker/Dockerfile.frontend`.
- **API Service (Backend)**: Deployed as an Express container via `docker/Dockerfile.backend` with horizontal scaling capability.
- **Database**: Managed PostgreSQL instance with SSL connections enforced (`sslmode=require`).
- **Cache**: Managed Redis cluster for rate limiting and socket session synchronization.
