# Scoped threat model

Reviewed 2026-10-08. Scope: this repository’s frontend, build, release metadata ingestion, Worker, D1 reporting state, GitHub App boundary, Sites deployment, and public GitHub Issues. Desktop application, activation services, Admin Center, update publishing, databases, and installer production are outside scope and remain unmodified.

| Actor / failure | Trust boundary and risk | Controls | Residual risk |
| --- | --- | --- | --- |
| Anonymous visitor | Browser to public frontend/API; accidental disclosure | Exact public warning, review screen, unchecked consent, strict fields, no email/upload, obvious-secret block | Pattern checks cannot find every confidential fact |
| Malicious reporter / spammer | Untrusted JSON to Worker and public issue Markdown | 16 KiB bound, strict shape/types, same-origin browser check, HMAC network bucket, durable per-source/global limits, two leases, circuit breaker, fixed destination | Distributed attackers and shared networks can cause false positives or consume budget |
| Duplicate/retry race | Browser/instances to D1 to GitHub | Unique idempotency key and payload hash, pending reservation, ambiguous terminal state | GitHub has no end-to-end idempotency key; manual reconciliation is required after timeout |
| Malformed upstream release | GitHub Releases API to build | Timeout/size bound, text-only parsing, semantic Alpha order, strict repository/tag/asset URL, exact asset count, validated fallback, atomic HTML/JSON model | GitHub metadata agreement is not publisher identity or independent review |
| Revoked installer | Release policy to download UI | Explicit revoked/unsafe lists block automatic fallback from newest release | Human policy maintenance is required |
| Compromised reporting credential | Worker secret to GitHub | Dedicated App, one repository, Issues write only, short-lived installation token, server-only secret, kill switch | A stolen key could create issues until revoked |
| Compromised dependency/action | Build/CI | No runtime/package dependencies, committed source, pinned Actions, read-only workflow permissions, no `pull_request_target` | Hosted runner and platform supply chain remain trusted |
| Malicious pull request | Untrusted code to CI | No CI secrets, read-only permissions, bounded jobs, no privileged trigger, no issue-text execution | Maintainer review is still essential |
| Reporting-provider outage | Worker/D1/GitHub | Fail closed, bounded timeout, circuit breaker, truthful UI errors; static installer path independent | Reports can be unavailable while downloads remain healthy |
| Deployment/cache misconfiguration | Sites/CDN to visitors | CSP, anti-frame, no-sniff, no-referrer, permissions policy, HSTS without subdomain/preload, no-store API responses, immutable hashed asset representations | Provider behavior must be verified after every deployment |
| Prompt injection in reports | Public issue to maintainers/automation | Issue banner marks content untrusted; no workflow reads issue text into shell or privileged agent | Humans can still be socially engineered |

There is no authentication, customer database, private-report reader, webhook, file upload, URL fetcher, redirect endpoint, template interpreter, command execution, or report-driven automation. Those attack surfaces are not applicable rather than simulated.
