# Protecting https://foxrex.co/studio/ with Cloudflare Access

Status: **prepared, not applied** — it needs the Cloudflare dashboard and must not change DNS from this repository.

## Why

`/studio/` is static and publicly downloadable from GitHub Pages. It contains no secrets and cannot publish on its own (every privileged action needs the operator's local worker and its token), but hiding the admin UI behind identity is defence in depth. **The worker token remains required after Access is enabled.**

## Operator steps (Cloudflare dashboard)

1. **Proxy the site through Cloudflare** — only after GitHub Pages shows a valid HTTPS certificate for `foxrex.co`: set the `foxrex.co` and `www` records to *Proxied* (orange cloud) and **SSL/TLS → Full** (not Flexible, which loops with GitHub Pages' HTTPS). Keep *Enforce HTTPS* on in GitHub Pages.
2. **Zero Trust → Access → Applications → Add → Self-hosted**
   - Application domain: `foxrex.co`, path `studio/*`; add a second destination `foxrex.co` path `foxrex-studio.html`.
   - Session duration: 8–24 h.
3. **Policy**: *Allow* → Include → *Emails* → the FOXREX operators (or an email domain / identity provider group). No "Everyone" rule.
4. Identity: One-time PIN is enough to start; add Google/Microsoft SSO later.
5. Test in a private window: `https://foxrex.co/studio/` must show the Cloudflare login; `https://foxrex.co/` and `/ar/` must stay public.

## Application side (already compatible)

- Studio uses only relative paths under `/studio/` and `../styles`, `../assets`, `../ar/…` for previews; those public assets stay outside the Access path, so previews keep working.
- The worker runs on `127.0.0.1` on the operator's machine and is not behind Cloudflare. Its protections are unchanged: bearer token, exact `ALLOWED_ORIGIN` (`https://foxrex.co`, never `*`), loopback bind, JSON-only writes, named operator on every write.
- If the worker is ever hosted behind Cloudflare, add an Access application for it too and validate the `Cf-Access-Jwt-Assertion` header server-side in addition to the token.
