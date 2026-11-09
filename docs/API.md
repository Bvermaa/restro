# API Reference Documentation

This document describes the REST API and WebSocket events provided by the backend service (`http://localhost:4000/api/v1`).

---

## 1. Authentication & Security

Authentication is built on short-lived in-memory JWT Access Tokens coupled with rotated, cryptographically random Refresh Tokens via HttpOnly cookies:

- **Access Token**: JWT containing user identity and role. Expires in **15 minutes** (`JWT_ACCESS_EXPIRES_IN=15m`). Stored strictly **in-memory** in the frontend client (never in `localStorage` or `sessionStorage`).
- **Refresh Token**: 64-byte random string (`crypto.randomBytes(64).toString('base64url')`), valid for 30 days. Stored on the server exclusively as a **SHA-256 hash** in the `refresh_tokens` table.
- **Cookie Specification**:
  - Name: `rt`
  - Path: `/api/v1/auth`
  - Attributes: `HttpOnly`, `SameSite=Lax`, `Secure` (in production), `Max-Age=30 days`
  - The refresh token is transmitted **exclusively** via the `rt` cookie and never in request or response JSON bodies.
- **Rotation & Replay Detection**:
  - Each `POST /auth/refresh` call revokes the incoming token and issues a new refresh token within the same cryptographic family (`familyId`).
  - If a previously revoked refresh token is presented (replay attack), the server **immediately revokes the entire token family**, invalidating all sessions across all devices for that user.

---

## 2. Authentication Endpoints (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register a new account. Issues `rt` cookie and returns in-memory access token. |
| `POST` | `/auth/login` | Public | Authenticate credentials. Issues `rt` cookie and returns in-memory access token. |
| `POST` | `/auth/refresh` | Public (Cookie) | Rotates refresh token in `rt` cookie and returns new 15m access token. |
| `POST` | `/auth/logout` | Public (Cookie) | Revokes active token family and clears the `rt` cookie. |
| `POST` | `/auth/logout-all` | Authenticated | Revokes **all** refresh tokens and active sessions for the user across all devices. |
| `POST` | `/auth/forgot-password` | Public | Request password reset email. |
| `POST` | `/auth/reset-password` | Public | Reset password using one-time token; invalidates all existing user refresh tokens. |
| `GET` | `/auth/me` | Authenticated | Fetch current authenticated user profile using Bearer access token. |
| `GET` | `/auth/google` | Public | Initiate Google OAuth 2.0 flow. |
| `GET` | `/auth/google/callback` | Public | Google OAuth callback handler; issues `rt` cookie and redirects with access token. |
| `POST` | `/auth/google/onetap` | Public | Google OneTap authentication; issues `rt` cookie and returns access token. |

---

## 3. Public Customer & Menu Endpoints (`/api/v1/menu`)

Customer-facing endpoints for QR-code diners.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/menu/:slug` | Public | Fetch restaurant info, categories, and active menu items. |
| `GET` | `/menu/:slug/items/:itemId` | Public | Get detailed item information with modifiers/addons. |
| `POST` | `/menu/:slug/call-waiter` | Public | Request waiter assistance for a specific table. |
| `GET` | `/menu/loyalty-settings` | Public | Retrieve public loyalty reward settings. |

---

## 4. Order Management (`/api/v1/orders`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/orders` | Public / Customer | Create a new table order with items and instructions. |
| `GET` | `/orders` | Customer | Fetch current customer order status and history. |
| `GET` | `/orders/:orderId` | Customer / Staff | Fetch specific order details. |
| `PATCH` | `/orders/:orderId/status` | Staff / Owner | Update order lifecycle status (`CONFIRMED`, `PREPARING`, `READY`, `SERVED`, `COMPLETED`, `CANCELLED`). |
| `POST` | `/orders/:orderId/cancel` | Customer / Staff | Cancel an order prior to kitchen preparation. |

---

## 5. Payments & Billing (`/api/v1/payments`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/payments/create-order` | Customer / Owner | Initialize Razorpay order for table bill or subscription. |
| `POST` | `/payments/verify` | Customer / Owner | Verify Razorpay payment signature and mark order paid. |
| `POST` | `/payments/webhook` | Razorpay (Signature) | Process asynchronous Razorpay payment webhook events. |

---

## 6. Restaurant Management (`/api/v1/restaurants`)

Endpoints reserved for Restaurant Owners and authorized staff.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/restaurants/my-restaurant` | Owner / Staff | Fetch authenticated owner's restaurant profile. |
| `PUT` | `/restaurants/my-restaurant` | Owner | Update restaurant details, timings, and settings. |
| `GET` | `/restaurants/:id/tables` | Owner / Staff | List dining tables and their active QR codes. |
| `POST` | `/restaurants/:id/tables` | Owner | Create new table and generate persistent QR code. |
| `GET` | `/restaurants/:id/categories` | Owner / Staff | List menu categories. |
| `POST` | `/restaurants/:id/categories` | Owner | Create new menu category. |
| `GET` | `/restaurants/:id/items` | Owner / Staff | List menu items with stock status. |
| `POST` | `/restaurants/:id/items` | Owner | Create new menu item (supports image upload). |
| `PUT` | `/restaurants/:id/items/:itemId` | Owner | Update menu item details, pricing, and availability. |
| `DELETE` | `/restaurants/:id/items/:itemId` | Owner | Delete or soft-delete menu item. |
| `GET` | `/restaurants/:id/staff` | Owner | List restaurant staff and roles. |
| `POST` | `/restaurants/:id/staff` | Owner | Invite / create staff member. |

---

## 7. Platform Admin Endpoints (`/api/v1/admin`)

Endpoints restricted strictly to users with role `SUPER_ADMIN`.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/admin/analytics` | `SUPER_ADMIN` | System-wide metrics (GMV, active tenants, order counts). |
| `GET` | `/admin/restaurants` | `SUPER_ADMIN` | List all registered tenant restaurants with approval status. |
| `PATCH` | `/admin/restaurants/:id/status` | `SUPER_ADMIN` | Approve, suspend, or reject a restaurant tenant. |
| `GET` | `/admin/subscriptions` | `SUPER_ADMIN` | List and inspect SaaS subscription plans and billings. |
| `GET` | `/admin/users` | `SUPER_ADMIN` | List platform users with role filters. |

---

## 8. WebSocket Events (`Socket.io`)

The server exposes real-time bi-directional communication via Socket.io at the root host (`ws://localhost:4000`).

### Connection Handshake
Clients connect and join rooms based on restaurant ID and role:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: { token: 'Bearer <jwt_token>' }
});
```

### Server-to-Client Events
- `order:created`: Emitted to restaurant kitchen and owner rooms when a new order is placed.
- `order:status_updated`: Emitted when an order transitions state (e.g., preparing -> served).
- `waiter:called`: Emitted when a customer clicks "Call Waiter" from their digital menu.
- `table:status_changed`: Emitted when table occupancy status changes.

### Client-to-Server Events
- `join:restaurant`: Join restaurant-specific room `restaurant:<restaurantId>`.
- `join:table`: Join table-specific room `table:<tableId>`.
- `leave:restaurant`: Leave room.
