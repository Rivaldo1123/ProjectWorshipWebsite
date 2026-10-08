# OWASP verification coverage

This is a scoped verification map using OWASP ASVS 5.0.0 as a structure, not certification.

- Encoding and injection: user report data is length/type checked, rendered with `textContent`, and Markdown punctuation, HTML delimiters, links, and mentions are neutralized before GitHub. No SQL text contains user-controlled structure; D1 values are bound parameters. Tests cover XSS/Markdown/mention payloads and unknown routing fields.
- Browser security: same-origin assets, restrictive CSP without `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no-sniff, no-referrer, restrictive Permissions Policy, and HTTPS HSTS. No cookies or ambient authentication means CSRF tokens are not applicable; exact Origin checking remains a browser control, not API authentication.
- Access control: visitors can create only one fixed public issue operation. They cannot read private reports because no private-report store or endpoint exists, nor choose repository, labels, assignees, milestones, workflows, or tokens.
- Files and URLs: no uploads, user URL fetching, redirects, filesystem paths, SSRF surface, or downloadable installer proxy. Release URLs are exact HTTPS paths on the authoritative repository.
- API/resource controls: bounded body, field and total text sizes, two upstream leases, durable per-source/global budgets, upstream timeout, failure circuit, response/log minimization, and fail-closed configuration.
- Secrets: GitHub App material is server-side only. Static verification scans generated text artifacts; browser code receives no privileged token. CI has no reporting secrets.
- Idempotency: unique key/payload reservations, changed-payload conflict, duplicate replay, and terminal ambiguous state are tested. Exactly-once delivery is not claimed.
- Supply chain: no npm dependencies; lockfile is unnecessary. Actions are pinned to immutable commits and have read-only permissions. SBOM is committed.
- Not applicable: password/auth/session management, account recovery, authorization roles, private data lookup/IDOR, cookies, payments, database query UI, webhooks, email, file parsing/uploads, and server-side templates.

Manual keyboard, reflow, focus, and screen-reader spot checks supplement automation. Automated results do not establish full WCAG or ASVS conformity.
