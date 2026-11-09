# Security Policy

## Reporting Security Issues

We take the security of our platform, customer data, and restaurant operations very seriously. If you believe you have discovered a security vulnerability in this project, please notify us responsibly.

**Please do NOT disclose vulnerabilities publicly or open public GitHub issues for security reports.**

### Contact
Send reports via email to:
- **Email:** `security@qrrestaurant.com` (or the repository security contacts)
- **PGP Key:** Available upon request

### What to Include in Your Report
To help us evaluate and address the issue quickly, please provide:
1. **Description:** Clear explanation of the potential vulnerability.
2. **Steps to Reproduce:** Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. **Affected Components:** The exact service, endpoints, packages, or files involved (e.g., `backend/src/routes/...`).
4. **Impact Assessment:** The potential severity and attack scenario (e.g., privilege escalation, unauthorized data access).
5. **Mitigation Suggestions:** Any recommended fix or remediation steps, if known.

---

## Response Timeline and SLAs

We commit to the following response timeline:
- **Initial Acknowledgment:** Within 24 hours of report receipt.
- **Triage & Severity Assessment:** Within 48 hours of report receipt.
- **Fix & Patch Timeline:**
  - **Critical (e.g., RCE, SQL Injection, Auth Bypass):** Within 24-48 hours.
  - **High (e.g., IDOR with data leakage, Privilege Escalation):** Within 5 business days.
  - **Medium (e.g., CSRF, Non-critical Rate Limiting):** Within 14 business days.
  - **Low (e.g., Informational disclosures without exploitability):** Next release cycle.
- **Disclosure Policy:** We request coordinated disclosure until patches are deployed to production and users/tenants are protected.

---

## Supported Versions

Only the latest release running on the `main` branch receives active security updates and patches:

| Version / Branch | Supported          |
| ---------------- | ------------------ |
| `main`           | :white_check_mark: |
| `staging`        | :white_check_mark: |
| legacy tags      | :x:                |

---

## Security Practices & Guardrails

- **Secret Zero Policy:** Never commit secrets, API keys, or JWT private keys into Git. Use environment variables managed via secure vaults (Render / AWS Secrets Manager).
- **Automated Scanning:** Every pull request runs CodeQL static analysis, Gitleaks secret scanning, and automated dependency audit (`npm audit`).
- **Network Boundaries:** Frontend strictly connects to backend via authenticated HTTP REST and WebSocket APIs (`/api/v1`). Direct database access is isolated strictly to backend microservices.
