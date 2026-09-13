# Pin High UAE — handover

This document is for the business owner and for whoever looks after the site
next. It says what the site is, what the business must own, how to run it
without a developer, and exactly what to do in the situations that used to
mean "call the developer".

The day-to-day manual lives **inside the admin panel: Admin → Help**. This
document covers what that page cannot: accounts, hosting, and the break-glass
procedures.

---

## 1. What it is

A B2B catalogue and quote-request platform. Buyers browse live stock, build a
size run, place their logo on the product, and send a **request for a quote**.
Nothing is charged online; the sales team prices each request and replies.
The admin panel manages stock, requests, notifications, the home page, and
who can sign in.

- Public site: the project's Vercel URL now; `pinhighuae.com` once attached.
- Admin panel: `/admin` on the same address.
- Code: GitHub, `nathanfisher84-creator/PinHigh`.

## 2. Accounts the business must own

The site depends on four services. Each should be registered to a business
email address, with the owner holding the login, so that changing developer
never means losing access.

| Service | What it holds | Where |
|---|---|---|
| **Vercel** | Hosting, deployments, environment variables | vercel.com — project `pinhigh` |
| **Supabase** | The database (every quote, every stock figure) and file storage (photos, buyers' logos) | supabase.com |
| **GitHub** | The code | github.com/nathanfisher84-creator/PinHigh |
| **Gmail** | The account quote emails send from (the app password is entered in the panel) | google.com |

Later: the domain registrar for pinhighuae.com.

**Action at handover:** confirm each of the four is owned by a business
account, and that at least two people know where the logins are kept.

## 3. Signing in, and never being locked out

Every person has their own email, password and authenticator app; there is no
shared login. Owners manage people under **Admin → Users**; everyone manages
their own password and authenticator under **Admin → Security**.

The two rules that keep the business in control:

1. **Always have two owners.** An owner can reset a colleague's lost
   authenticator and issue password resets. If the only owner loses their
   phone and recovery codes, the business is locked out until a developer
   intervenes (procedure in §6).
2. **Keep the recovery codes** shown when an authenticator is set up. Eight
   codes; each signs you in once without the phone.

Recovering on your own — no developer needed:

| Situation | What to do |
|---|---|
| Forgot password | Sign-in page → *Forgotten your password?* → link by email (1 hour, one use). |
| Lost / new phone | Sign in with a recovery code → Security → *Replace the authenticator*. |
| Lost phone **and** codes | Another owner → Users → *Reset authenticator* on your account. |
| Email isn't sending, so no reset link arrives | Another owner → Users → *Send password reset* → the link is shown on screen to pass on. |
| Someone leaves | Owner → Users → *Remove access*. Immediate. |

## 4. What the admin panel controls (no developer)

Email sending account, who receives quote requests, admin accounts, the
home-page flyer and background photos, the announcement banner, contact
details, the promised response time, product visibility and photos, stock
uploads and rollbacks, every quote request. All described in Admin → Help.

The dashboard's **System status** card reports each connection in plain
words. Green is fine. Anything marked *Needs your developer* is a hosting
setting (§5).

## 5. What a developer is needed for

- Anything on the status card marked *Needs your developer* — these are
  environment variables in Vercel (see `DEPLOY.md` for the full table).
- Attaching pinhighuae.com (`DEPLOY.md`, "Attaching pinhighuae.com").
- The locked-out-owner procedure below.
- New features, new brands' stock-file formats, changes to what is shown.

## 6. Break-glass procedures (developer)

All of these are run in **Supabase → SQL Editor** against the production
project. They are the only reasons to touch the database directly. Replace the
email address in each.

**The only owner has lost phone and recovery codes**

```sql
update admin_users
   set mfa_enabled = 0, totp_secret = null, recovery_codes = null, totp_last_counter = null
 where email = 'owner@example.com';
```

They sign in with their password and are taken straight to Security to set
the authenticator up again.

**The only owner has forgotten their password and email cannot send**

Set `ADMIN_EMAIL` to their address and `ADMIN_PASSWORD` to a temporary
password in Vercel, then:

```sql
update admin_users set password_hash = null where email = 'owner@example.com';
```

Redeploy. The temporary password now works for that account only, until they
choose their own under Security (then remove the two variables again).

**Every owner has been removed or demoted**

```sql
update admin_users set is_active = 1, role = 'owner' where email = 'owner@example.com';
```

**No admin account exists at all** (empty table, e.g. a fresh database)

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in Vercel and redeploy; the first
sign-in creates the owner account from them.

**`ADMIN_SESSION_SECRET` was changed or lost**

Consequences, all recoverable: everyone is signed out; the Gmail app password
must be re-entered under Settings; every account's authenticator must be set
up again — recovery codes still work for the sign-in that gets them there.
Prefer never rotating it.

## 7. Deploying and rolling back

Push to `main` on GitHub and Vercel deploys it. To undo a bad deploy: Vercel →
Deployments → previous deployment → *Instant Rollback*. Details in
`DEPLOY.md`.

## 8. Data and backups

- Supabase keeps daily backups on paid plans (Settings → Database → Backups).
  Confirm the plan and retention at handover.
- Quote requests can be exported at any time: Admin → Quote requests → export
  (CSV), or per request as Excel.
- Buyers' logo files are in the private `artwork` bucket in Supabase Storage;
  product photos in the public `product-images` bucket.
- Retention written into the privacy page: quote requests 5 years (FTA
  record-keeping), logo files deleted on request.

## 9. Known limits, stated plainly

- **WhatsApp notifications to staff** are written but have never been
  connected to Meta; recipients on that channel show as *skipped*. Email is
  the system of record. The "message us on WhatsApp" button for buyers is a
  plain link and works.
- **No generated PDFs**: the confirmation page and admin quote view print
  cleanly from the browser; emails carry a CSV.
- **adidas product copy** is empty ("Details on request") because adidas.ae
  blocks retrieval; the mapping to fill is `src/lib/domain/adidas-copy.ts`.
- **No error-tracking service**: production errors are in Vercel's logs. The
  status card covers configuration, not runtime exceptions.
- The terms and privacy pages were written against UAE PDPL but are not legal
  advice; have them reviewed.

## 10. For the next developer

Next.js 15 (App Router) on Node 24, TypeScript, Tailwind. Postgres via `pg`
(Supabase in production, embedded PGlite locally — no setup). No ORM: the
single seam is `src/lib/db/`, schema in `schema.ts`, boot migrations in
`core.ts`. Admin auth is the app's own (`src/lib/admin-auth.ts`,
`src/lib/totp.ts`); sessions in `src/lib/auth.ts`.

```bash
npm ci
npm run dev        # http://localhost:3400, embedded database, no env needed
npm test           # node:test, ~200 tests, runs against the embedded database
npm run typecheck
npm run build
```

Start with `README.md` (architecture and the decisions behind it) and
`.env.example` (every variable and what each costs you if missing).
