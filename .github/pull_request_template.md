## Description

<!-- Provide a concise summary of the changes and motivation for this PR. -->

## PR Type

Please check the type of change this PR introduces:
- [ ] `frontend`: Frontend UI / UX / client services change (`frontend/`)
- [ ] `backend`: Backend API / controllers / database schema change (`backend/`)
- [ ] `both`: Coordinated full-stack change spanning frontend, backend, or shared packages
- [ ] `shared`: Types or schema changes in `packages/shared/`
- [ ] `infra`: Docker, CI/CD workflows, or build tooling
- [ ] `hotfix`: Urgent production fix
- [ ] `docs`: Documentation updates only

## Changes Made

- <!-- Bullet points summarizing key changes -->

## Verification & Testing Checklist

- [ ] Workspace builds pass locally (`npm run build`)
- [ ] TypeScript type checks pass (`npm run type-check`)
- [ ] Unit / Integration tests pass (`npm run test`)
- [ ] Lint checks pass (`npm run lint`)
- [ ] No cross-boundary imports (frontend does NOT import backend; backend does NOT import frontend)
- [ ] API routes and centralized client (`@/services/api`) remain synchronized with shared types

## Security Checklist

- [ ] **No Secrets**: No hardcoded API keys, JWT secrets, database credentials, or real `.env` values are committed.
- [ ] **Authorization & RBAC**: Every new/modified endpoint has explicit authentication and role checks (`authenticate`, `requireRole`, tenant verification).
- [ ] **Input Validation**: All query parameters, route parameters, and request bodies are validated using Zod schemas.
- [ ] **Tenant Isolation**: Restaurant-specific resources verify tenant restaurant ID from authenticated user context, preventing IDOR.
- [ ] **Data Sanitization**: Sensitive database fields (passwords, salts, webhook secrets) are omitted from API responses.
- [ ] **Dependency Audit**: No new high or critical vulnerabilities introduced (`npm audit`).

## Related Issues
Closes #
