# Deployment and rollback

The production site uses the existing ChatGPT Sites project `appgprj_6ac6c8a8f57c81919daa42a8e44e58fa` at `https://project-worship.valdoenterprise.chatgpt.site/`. `.openai/hosting.json` selects a Worker entry point at `dist/server/index.js` and a D1 binding named `DB`. SQL migrations in `drizzle/` are applied by the hosting deployment.

## Release procedure

1. Confirm the repository is clean and synchronized; preserve unrelated work.
2. Run `node --test`, `node scripts/build.mjs`, and `node scripts/verify-site.mjs`.
3. Inspect the generated release record and no-JavaScript HTML. For a newly accepted installer, also run `node scripts/verify-installer.mjs` and update the reviewed fallback/signing records.
4. Commit and push a small reviewed commit to the protected/default branch using the normal authorized flow.
5. Package `dist/` with `.openai/hosting.json` and `drizzle/`, save a Sites version associated with the exact Git commit, and deploy it through the existing Sites project.
6. Verify the live revision, download destination, images, 404, reporting status, and effective response headers. A reporting outage must not affect static downloads.

## Rollback

Select and redeploy a previously healthy Sites version; do not rewrite Git history or delete the newer version. The pre-hardening rollback target is version 1, version id `appgprj_6ac6c8a8f57c81919daa42a8e44e58fa~appgver_df596af1f1188191a02eff78dbba1af2`, commit `ccbffc3701a7087a98def500b9b47532bbb88573`. If reporting caused the incident, set `REPORTING_ENABLED=false` first; downloads continue to work.

Production and local testing must use separate D1 state and credentials. Never use production secrets in pull-request jobs, screenshots, artifacts, URLs, browser variables, or public logs.
