# Deploying

The site runs on Vercel, connected to this GitHub repository. **Every push to
`main` deploys to production automatically**; other branches get a preview
URL. There is nothing to run by hand.

- Production: the project's `*.vercel.app` domain until pinhighuae.com is
  attached (see below).
- Rollback: Vercel → Deployments → pick the previous one → *Instant Rollback*.
- Logs: Vercel → Deployments → the deployment → *Logs* (runtime) or
  *Building* (build).

## What production needs

Set under Vercel → Project → Settings → Environment Variables. Redeploy after
changing any of them.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | **yes** | Supabase → Connect → *Transaction pooler* URI (port 6543) with the password filled in. Without it nothing written survives a restart, and the site says so on every page. |
| `SUPABASE_URL` | **yes** | Supabase → Settings → API → *Project URL*. Must start with `https://` — a key pasted here is ignored, loudly, and uploads fall back to temporary disk. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase → Settings → API → `service_role`. Server-side only. |
| `ADMIN_SESSION_SECRET` | **yes** | Any 32+ random characters. Sessions, the stored Gmail password and every authenticator secret are keyed to it — set once, never rotate casually. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first boot only | On an empty `admin_users` table the email becomes the owner account and the password works until they choose their own. Ignored afterwards; safe to remove. |
| `NEXT_PUBLIC_SITE_URL` | when the domain is live | `https://pinhighuae.com`. Turns on indexing, canonical URLs and the sitemap for that host. Leave unset on the `*.vercel.app` address (which stays `noindex`). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | optional | Shared rate limiting across serverless instances. Without them limits are per instance. |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | optional | Cloudflare bot check on the quote form. Without them the honeypot and rate limit still apply. |
| `RESEND_API_KEY`, `ORDER_FROM_EMAIL` | optional | Send from the site's own domain once DNS is in hand. Otherwise the owner's Gmail (entered in the admin panel) is used. |

Everything else — email sending, who is notified, who can sign in, the home
page — is managed inside the admin panel, not here. The dashboard's **System
status** card shows which of the above are in place without exposing values.

## Attaching pinhighuae.com (when the time comes)

1. Vercel → Project → Settings → Domains → add `pinhighuae.com` and `www`.
2. At the registrar, add only the records Vercel shows (an `A`/`ALIAS` for the
   apex, a `CNAME` for `www`). **Do not touch `MX`, `SPF`, `DKIM` or any `TXT`
   record** — those are the business's email.
3. Set `NEXT_PUBLIC_SITE_URL=https://pinhighuae.com` and redeploy.
4. Check `/robots.txt` and `/sitemap.xml` on the new domain, and that the
   `*.vercel.app` address still says `noindex`.

Lower the DNS TTL a couple of days beforehand and cut over midweek in the
morning, UAE time. The old Shopify redirect map is in `src/lib/redirects.ts`.

## Platform notes

- `engines.node: 24.x`; the build runs `scripts/db-setup.ts` then `next build`.
- Request bodies are capped at 4.5 MB by Vercel. Bulk image packs go in
  batches, or straight to Supabase Storage.
- The database schema is applied by the application at boot, inside a
  transaction under an advisory lock, so a redeploy is a migration.
- `.env.example` lists every variable with what each one costs you if missing.
