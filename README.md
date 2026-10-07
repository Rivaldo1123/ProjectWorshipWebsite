# Project Worship website

Official public download website for Project Worship. The site explains the product, links directly to the published Windows installer in `Rivaldo1123/ProjectWorship-updates`, and provides installation, release, and support guidance.

## Local build

Requires Node.js 20 or newer; there are no package dependencies.

```powershell
node --test
node scripts/build.mjs
node scripts/verify-site.mjs
```

Serve `dist/` with any static HTTP server. The build checks GitHub Releases for the newest valid alpha and writes a verified release manifest. If GitHub is unavailable or returns an incomplete release, the checked-in last-known-good manifest is retained. The browser repeats the same validated read-only check when the page opens and otherwise keeps the build manifest.

## Release maintenance

1. Publish the application release only in `Rivaldo1123/ProjectWorship-updates`.
2. Run `node scripts/build.mjs` to refresh and validate website release data.
3. Run `node --test` and `node scripts/verify-site.mjs`.
4. Review any version-specific guidance, screenshots, and limitations before publishing the website.

Never copy an installer into this repository. Never add application source, credentials, activation codes, church workspaces, logs, or private user data.
