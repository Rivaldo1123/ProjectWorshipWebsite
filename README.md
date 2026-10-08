# Project Worship website

Official public download and support website for Project Worship. The site explains the product, links directly to the published Windows installer in `Rivaldo1123/ProjectWorship-updates`, and provides release, installation, upgrade, privacy, and issue-reporting guidance.

## Stack and local checks

The frontend is dependency-free HTML, CSS, and JavaScript. A Cloudflare-compatible Worker serves the generated site and the same-origin reporting API; D1 provides short-lived distributed rate-limit and idempotency state. Node.js 24 LTS is the tested build runtime. No installer is stored in this repository.

```powershell
node --test
node scripts/build.mjs
node scripts/verify-site.mjs
node scripts/serve-worker.mjs
```

Open `http://127.0.0.1:4173`. A local server keeps reporting disabled unless a deliberately isolated test environment is supplied.

## Release data

The build requests the public Releases API with a 12-second timeout and 2 MB response limit, excludes drafts and stable releases under the Alpha policy, orders parsed versions numerically, and accepts exactly one expected installer with a strict GitHub URL, positive size, and SHA-256 digest. `site/data/release-fallback.json` is the last-known-good record. Failed refreshes update only the attempt time and outcome; they do not rewrite its successful verification time.

Static HTML and `data/release.json` are rendered from the same validated object. The browser does not independently mix in live GitHub fields. Before accepting a new release, run `node scripts/verify-installer.mjs`, review signing evidence and notes, then update the fallback and version-keyed signing record. Revoked or unsafe tags belong in `site/data/release-policy.json`; the selector will not fall back from the newest tag when it is listed there.

## Reporting status

The reporting API is fail-closed. Deployment without the dedicated GitHub App secrets leaves the form usable for preparation/review but disables final on-site submission. Do not substitute a personal access token. See [reporting operations](docs/REPORTING-OPERATIONS.md), [deployment](docs/DEPLOYMENT.md), and the [threat model](docs/THREAT-MODEL.md).

## Evidence and security

- [Screenshot provenance](docs/screenshots-provenance.json)
- [Security and advisory review](docs/SECURITY-REVIEW.md)
- [ASVS coverage](docs/ASVS-COVERAGE.md)
- [SPDX SBOM](sbom.spdx.json)

Never add application source, activation data, credentials, church workspaces, private logs, user data, or installer binaries to this repository.
