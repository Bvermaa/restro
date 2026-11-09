# Operational Runbook

This guide covers operational workflows, local environment setup, database migrations, deployments, rollbacks, and incident response procedures.

---

## 1. Local Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker & Docker Compose (for local PostgreSQL and Redis)

### Initial Setup Steps
```bash
# 1. Clone repository and install dependencies across all workspaces
npm install

# 2. Configure environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start PostgreSQL and Redis containers
docker-compose up -d postgres redis

# 4. Generate Prisma Client and apply migrations
npm run prisma:generate --workspace=@qr-restaurant/server
npm run prisma:migrate --workspace=@qr-restaurant/server

# 5. (Optional) Seed development database
cd backend && npx ts-node src/prisma/seed.ts

# 6. Start the full-stack development environment
npm run dev
```

The frontend will run at `http://localhost:3000` and the API server at `http://localhost:4000`.

---

## 2. Database Migrations Workflow

### Creating a New Migration
Never edit existing applied migration files. To introduce schema changes:
```bash
cd backend

# Create and apply migration locally
npx prisma migrate dev --name <descriptive_migration_name>

# Regenerate client types
npx prisma generate
```

### Applying Migrations in Staging / Production
Prisma migrations run automatically during deployment container startup or via CI pipeline:
```bash
cd backend
npx prisma migrate deploy
```

---

## 3. Deployment Procedure

### Automated Deployment via CI/CD
- **Staging**: Merging a pull request into `staging` triggers `.github/workflows/deploy.yml` targeting the staging environment.
- **Production**: Merging a pull request into `main` triggers deployment to production subject to environment approval.

### Manual / CLI Deployment via Docker
To build and test production Docker containers locally:
```bash
# Build Backend container
docker build -f docker/Dockerfile.backend -t qr-backend:latest .

# Build Frontend container
docker build -f docker/Dockerfile.frontend -t qr-frontend:latest .

# Run full stack via Docker Compose
docker-compose -f docker-compose.yml up --build
```

---

## 4. Rollback Runbook

### Immediate Service Rollback
If a critical defect is identified post-deployment:
1. **GitHub Rollback**:
   ```bash
   git checkout main
   git revert -m 1 <merge_commit_sha>
   git push origin main
   ```
2. **Container Rollback**:
   In your hosting dashboard (e.g. Render / Cloud Console), select the previous green deployment image and trigger "Rollback to this revision".

### Database Migration Rollback
If a database migration caused issues:
1. Revert the application code first to avoid incompatibility.
2. If down migrations are required, write a corrective migration:
   ```bash
   cd backend
   npx prisma migrate dev --name revert_<issue_name>
   ```

---

## 5. Incident Response Guide

### Incident 1: API High Latency or Connection Exhaustion
**Symptoms:** 504 Gateway Timeout, connection pool errors in logs (`Timed out fetching a new connection from the pool`).

**Action Items:**
1. Check active database connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```
2. Verify Redis connectivity and responsiveness (`redis-cli ping`).
3. Scale up backend replica count or increase Prisma connection pool limit in `DATABASE_URL`:
   `?connection_limit=30&pool_timeout=20`.

### Incident 2: Detected Secret Leak
**Action Items:**
1. Revoke the compromised secret immediately in the corresponding third-party provider (e.g., Razorpay Dashboard, Cloudinary, SendGrid, Google Cloud Console).
2. Issue and configure a new secret in Render/AWS Secrets Manager.
3. Restart backend service instances to load the new credentials.
4. Review access logs during the vulnerability window.
5. If secrets were committed to Git, rewrite history using `git-filter-repo` or BFG Repo-Cleaner before forcing push.
