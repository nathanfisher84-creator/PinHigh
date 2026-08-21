# Deploying to Vercel

The app is ready to deploy — the Vercel-specific work is done (see "What was
changed" below). What remains needs your Vercel account, which I can't sign
into on your behalf.

## The fastest route — two commands

From `pinhigh/`:

```bash
npx vercel login
```

```bash
npx vercel --yes
```

The first opens a browser to authenticate. The second uploads, builds and
prints a URL you can open from any computer. Add `--prod` when you want the
stable production URL rather than a preview one.

Vercel auto-detects Next.js, so there is nothing to configure.

## The better long-term route — connect a repo

The project is already a git repository with one commit. Push it to GitHub and
Vercel will redeploy on every push:

```bash
git remote add origin https://github.com/<you>/pinhigh.git
```

```bash
git push -u origin main
```

Then either import it at [vercel.com/new](https://vercel.com/new), or tell me
the repo name and I'll link and deploy it from here.

---

## Read this before you share the URL

**Quote requests and stock uploads will not be kept.**

The app stores everything in a SQLite file. Vercel's filesystem is read-only
except for `/tmp`, and `/tmp` belongs to a single serverless instance and is
wiped when that instance recycles. So on Vercel:

- **Browsing works perfectly.** Every instance re-seeds the catalogue from the
  bundled stock file on cold start — 71 articles, 311 SKUs, real stock figures.
- **Writes do not survive.** A submitted quote request gets a reference and
  renders its confirmation, but it lands in one instance's temporary database
  and the sales team will never see it.

The site says so itself: a red banner appears at the top of every page on any
deployment without a real database. Letting a buyer believe an enquiry had
landed when it hadn't is the exact failure the quote model exists to prevent
(§7.1), so it is declared rather than hidden.

**To fix it**, point the app at Postgres. `supabase/migrations/0001_init.sql`
has the full schema with the RLS policies §11 requires, and
`src/lib/db/index.ts` is the single seam — everything above it speaks domain
types and never sees SQL. Set `NEXT_PUBLIC_SUPABASE_URL` and the banner
disappears on its own.

## The admin panel is locked until you set credentials

With no `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the environment, `/admin` redirects
to a login that rejects everything and explains why. That is the safe default
for a public URL, and it is why nothing was set for you.

To open it, add these in **Vercel → Project → Settings → Environment
Variables**, then redeploy:

| Variable | Notes |
|---|---|
| `ADMIN_EMAIL` | Who signs in |
| `ADMIN_PASSWORD` | Use a strong one — this URL is public |
| `ADMIN_SESSION_SECRET` | 32+ random characters. Without it, every redeploy signs you out |

Do **not** reuse the values in `.env.local` — those are local development
throwaways, and `.env.local` is gitignored so they were never deployed.

Remember this is still the placeholder auth described in the README: one shared
account, no MFA. Spec §2 wants invite-only Supabase Auth with MFA before the
site is genuinely public.

`.env.example` lists every other variable and what each one costs you if it is
missing.

---

## What was changed to make Vercel work

| Change | Why |
|---|---|
| `engines.node: "24.x"` in `package.json` | The store uses `node:sqlite`, which needs a flag on Node 22 and none on 24 |
| Database path → `/tmp/pinhigh` when `VERCEL` is set | The bundle is read-only; `/tmp` is the only writable path |
| `outputFileTracingIncludes` for `seed/**` | The seed file is opened via a runtime path that file tracing misses — without it the deployed catalogue boots empty |
| `src/lib/runtime.ts` | Detects the ephemeral store, and resolves the site's own URL from `VERCEL_URL` |
| Canonical URLs and sitemap use the deployment URL | Otherwise a preview publishes a sitemap pointing at pinhighuae.com, which is wrong while the real site still lives there |
| Preview deployments are `noindex` | A preview must not compete with the live site in search results |
| `EphemeralNotice` banner | Says plainly that writes are not kept |

All 80 tests still pass and the production build is clean with `VERCEL=1` set.
