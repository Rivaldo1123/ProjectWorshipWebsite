# Security and advisory review

Checked 2026-10-08. Assessed stack: dependency-free HTML/CSS/JavaScript; Node.js 24.19.0 build/test runtime; Cloudflare-compatible Worker Web APIs; D1; GitHub REST API; pinned `actions/checkout` and `actions/setup-node`. There are no direct or transitive npm packages.

Sources consulted: GitHub Advisory Database, OSV, NVD, CISA Known Exploited Vulnerabilities catalog release 2026.10.04, Node.js security notices, OWASP ASVS 5.0.0, OWASP WSTG 4.2/current development material, and OWASP CSP guidance.

## Advisory disposition

Node’s June 2026 advisory fixed CVE-2026-48618, CVE-2026-48933, CVE-2026-48615, CVE-2026-48619, CVE-2026-48928, CVE-2026-48930 / GHSA-g779-8rvr-37xx, CVE-2026-48934, CVE-2026-48937, and CVE-2026-48617 in the 24.x line by 24.17.0. The locally assessed 24.19.0 runtime is later and not in the affected range. NVD scores CVE-2026-48930 at 9.8 while the vendor/OSV assessment is medium; the version-range conclusion, not the name match alone, makes it non-applicable here. None of these identifiers appeared in the checked CISA KEV catalog.

No applicable Critical or High package advisory was found because the project has no package dependencies. The Worker runtime is provider-managed and its exact production engine build is not exposed by this repository; provider patching remains a hosting trust dependency. GitHub Actions and hosted runner images are build/CI exposure, not browser runtime dependencies; pins and least privilege mitigate replacement risk.

## Security findings

- Fixed, High: future releases could inherit stale notes/signing claims. Release rendering is now one atomic validated object with explicit unavailable states and no browser-side field mixing.
- Fixed, Medium: oversized or malformed release/API input had incomplete bounds. Build and reporting paths now have time, byte, shape, type, URL, count, and text limits.
- Fixed, Medium: screenshot actual-size alignment hid the left edge. Actual-size mode is start-aligned with two-axis overflow; fit mode remains readable and keyboard controls restore focus.
- Mitigated, High: anonymous issue creation can be abused. D1 budgets, keyed network buckets, leases, idempotency, timeout handling, and circuit breaking are implemented; production remains disabled until a least-privilege GitHub App is installed.
- Blocked: confidential vulnerability reporting. No verified private destination exists, so the website rejects that workflow and does not publish `SECURITY.md` or `security.txt` with an invented contact.

An empty scanner result is not treated as proof of safety. Manual architecture review and negative tests cover DOM/stored/reflected XSS, Markdown/HTML injection, mentions and remote images, routing control, origin/content type/method handling, body exhaustion, forwarding-header spoofing, duplicate races, GitHub error classes, token absence, circuit behavior, static secret exposure, path traversal, cache policy, and download/reporting separation. Production-invasive testing and third-party scanning were not performed.
