# Reporting operations

## Architecture and owner setup

Anonymous visitors submit JSON to the same-origin `/api/report`. The Worker validates a fixed schema, blocks obvious secret patterns, applies keyed network-bucket and global budgets in D1, reserves one of two leases, and creates only a new issue in `Rivaldo1123/ProjectWorshipWebsite`. User input cannot select a repository, labels, assignees, milestones, endpoint, or credentials. Attachments are intentionally absent.

Create a dedicated GitHub App, install it only on `ProjectWorshipWebsite`, and grant Metadata read plus Issues write—the minimum GitHub requires to create an issue. Add its values to the Sites server-side secret store as `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY`. Generate an independent random value of at least 32 bytes for `REPORTING_RATE_LIMIT_SECRET`. After verifying staging, set `REPORTING_ENABLED=true`. Never paste secret values into an issue, commit, chat transcript, client environment, or build artifact.

No dedicated GitHub App is currently configured. Production therefore keeps the kill switch off. A personal access token, application-release credential, or unrelated integration credential is not an acceptable substitute.

## Limits and retention

- Request: POST, JSON UTF-8, 16 KiB maximum, flat known-property object only.
- Text: title 8–120 characters; version 1–60; environment 2–160; steps 10–3000; expected/actual 4–1500; optional context 0–1500; 7500 characters total.
- Budget: three submissions per pseudonymous `/24` IPv4 or `/64` IPv6 bucket per ten minutes, 25 globally per day, two concurrent GitHub submissions.
- Upstream: eight-second timeout; three recent failures open a five-minute circuit breaker.
- State: idempotency records and keyed network buckets are retained for no more than seven days by expiry/cleanup. Raw IPs, cookies, authorization headers, full user-agent strings, and report bodies are not deliberately stored in D1 or copied to public issues. The hosting provider processes ordinary request metadata and may retain raw network address and user-agent values in provider logs for its provider-controlled retention period; the website does not expose those logs publicly and cannot configure their precise retention here.

The network bucket is HMAC-protected with a server secret. `CF-Connecting-IP` is trusted only because it is hosting-derived; visitor-supplied forwarding headers are ignored. This is abuse reduction, not identity.

## Idempotency and ambiguous outcomes

The browser creates a random key for one reviewed payload. D1 uniquely reserves both the key and payload hash before GitHub is called. Duplicate clicks return the original confirmed issue or a pending response. Reusing a key with changed content is rejected. A timeout after the GitHub request is marked `ambiguous` and is never automatically retried; reconcile the correlation id against recent issues before changing its status. These controls reduce duplicates but do not claim distributed exactly-once delivery.

## Kill switch, rotation, and incidents

Set `REPORTING_ENABLED=false` to stop submissions without affecting downloads. Revoke a compromised GitHub App key in GitHub, rotate the Sites secret, and rotate `REPORTING_RATE_LIMIT_SECRET` if that key is exposed. Rotation invalidates prior pseudonymous buckets but not public issues. Review recent public issues and D1 correlation records; never publish the leaked value during incident handling.

For accidental public disclosure, restrict or redact the GitHub issue using repository-owner controls as soon as possible, remembering notifications and indexes may retain copies. A verified confidential security-report route is not configured, so vulnerability details must not be entered into this website. Enable GitHub private vulnerability reporting or provide a genuinely controlled private inbox before adding `SECURITY.md` or `security.txt` contact claims.
