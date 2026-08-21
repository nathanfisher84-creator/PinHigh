# Pin High UAE — corporate catalogue and quote platform

A corporate catalogue for a Dubai distributor of golf apparel, footwear and
equipment. Buyers browse by brand, see availability by size, build a size run,
optionally attach their logo, and submit it as a **quote request**. No payment
is taken and no price is final until a human confirms it.

Built to `pinhigh-catalogue-spec.md`. Section references throughout the code
(`§4.2`, `§6.3`) point back at it.

```bash
npm install
npm run dev     # http://localhost:3400
npm test        # 80 tests
```

The catalogue seeds itself on first run from `seed/pinhigh-stock-template.xlsx`
— 71 articles, 311 SKUs, 13 brands — by running that file through the real
importer. No configuration is needed to see the whole thing working.

---

## What's built

Spec §12 sequences the work in nine phases and says to ship 1–5 first. Those
are done, plus most of 6.

| Phase | Status |
|---|---|
| 1 · Foundation — scaffold, schema, design tokens, layout, admin auth | Built |
| 2 · Catalogue — listing, filters, search, product page, size grid, basket | Built |
| 3 · Import — parse, column mapping, diff preview, commit, history, rollback | Built |
| 4 · Images — pipeline and management UI | **Partial** — see below |
| 5 · Quote requests — submission, validation, persistence, email, admin | Built |
| 6 · Branding — per-line toggle, placements, logo upload, admin surfacing | Built |
| 7 · WhatsApp — Cloud API, template, test tooling, retry | Code complete, unverified |
| 8 · Polish — accessibility, performance, SEO, copy | Partial |
| 9 · Cutover | Redirect map built; the rest is process |

### Known gaps

These are deliberate stopping points, not oversights.

**Images (§5) are plumbed but not complete.** Products render the branded
placeholder §5 requires, alt text is auto-generated, and the admin lists which
products lack images. What is not built: the upload UI, the WebP/multi-width
processing pipeline, and the bulk-zip matcher that pairs `41001_1.jpg` to an
article number. That last one is the piece worth doing first — §5 is right that
it saves the owner hours and works directly with supplier image packs.

**WhatsApp (§7.3) cannot be verified without a Meta account.** The integration
is written — template parameters, the URL button, retry with backoff, the test
button, the `wa.me` fallback — and its parameter-building is unit tested. It has
never spoken to Meta. Until the environment is configured, recipients are
recorded as `skipped`, which is deliberately distinct from `failed` so the
dashboard's failure panel stays meaningful.

**PDF attachments (§7.2, §7.3) are a print stylesheet, not a generated file.**
The confirmation page and the admin quote view print cleanly to PDF from the
browser, and the notification email carries a CSV of the lines. A server-side
PDF renderer was not worth the dependency for this milestone.

**Auth is a placeholder.** See "Before cutover".

---

## How it's put together

Single Next.js app (App Router, TypeScript, Tailwind v4). No microservices —
§2 is explicit that the complexity isn't warranted and it makes the owner's
future developer's life harder.

```
src/
  app/                    routes; server actions live in app/actions and app/admin
  components/
    order/SizeGrid.tsx    the signature interaction (§6.3)
    order/ColourwayPanel  colour switcher; guarantees runs survive a swatch click
    admin/StockImport     upload → diff → mode → commit (§4.2)
  lib/
    db/                   core (connection, queries) · schema · seed · index (seam)
    domain/               types, size ordering
    import/               columns (fuzzy matching) · parse (validation) · commit (diff, write, rollback)
    xlsx/read.ts          zero-dependency XLSX + CSV reader
    repo/                 catalogue and quote queries
    notify/               email, whatsapp, csv
    cart/store.ts         localStorage basket, keyed by SKU
    redirects.ts          the Shopify redirect map (§14.3)
supabase/migrations/      Postgres schema + RLS (the §2 target)
tests/                    80 tests, node:test, no test framework dependency
```

### Two decisions that depart from the spec

**Storage is SQLite, not Supabase.** §2 specifies Supabase Postgres and that is
still the target — `supabase/migrations/0001_init.sql` carries the same schema
with the RLS policies §11 requires. But provisioning a Supabase project needs
credentials that don't exist yet, and a catalogue nobody can run is not
reviewable. The application talks to `src/lib/db/index.ts` in domain types and
never sees SQL, so swapping means reimplementing the query helpers in
`db/core.ts` against `@supabase/supabase-js`. Nothing in the components,
actions or importer changes.

**The XLSX reader is hand-written, not SheetJS.** §2 names SheetJS. Its npm
distribution is pinned at 0.18.5 and carries CVE-2023-30533 (prototype
pollution) and CVE-2024-22363 (ReDoS); the fixed builds are published only to
SheetJS's own CDN, which is an awkward supply-chain dependency for a codebase
the owner's next developer has to keep running. The importer only ever needs to
*read* a sheet, so `lib/xlsx/read.ts` does that on Node builtins — zip via
`node:zlib`, then the shared-string and cell parsing. It is tested against the
real template and produces byte-identical results to a reference parse. If you
would rather have SheetJS, it drops into the same interface.

---

## Two things worth knowing about the data

**Article number is the primary identity.** One article number is one product
in one colour with its own size run. It is stored as TEXT and never parsed for
meaning, so leading zeros survive and the client can change the format without
breaking anything.

**`style_group` is presentation only.** When several products share one, the
listing collapses them into a single card with colour swatches and the product
page shows a colour switcher. When it is blank the product stands alone.
Nothing about ordering, stock or SKUs depends on it, and a null `style_group`
never degrades any function — there is a test for exactly that.

---

## The importer

This is the feature the business depends on daily (§4), so it is the most
defensive code in the project.

- **Fuzzy header matching.** Lowercase, strip punctuation, then match against
  canonical names and a long alias list. `Art. No`, `Qty`, `Trade Price` and
  `Product Type` all resolve. Unrecognised columns are ignored silently — the
  owner keeps working notes on the sheet.
- **The template says `Corporate Price` where spec §4.1 says `Wholesale Price`.**
  Both map to the same field. (The spec also calls the template
  `fairline-stock-template.xlsx`; the supplied file is
  `pinhigh-stock-template.xlsx`. Naming only.)
- **A required column that cannot be matched** opens a manual mapper, and the
  mapping is saved so the owner does it once rather than every month.
- **Validation reports, it does not silently fix.** An article described two
  ways is an error naming both values and both row numbers, and the first
  occurrence wins. A duplicated article+size has its quantities summed with a
  warning. A style group mixing genders warns and does not block.
- **Nothing is written until the owner has seen the diff**, and the panel with
  the most visual weight is the one listing SKUs *absent* from the file,
  because that is the only part of an import that can quietly destroy value.
- **Nothing is ever deleted.** Absent SKUs go to zero and stay; full replace
  additionally hides them, and requires typing `REPLACE`. Quote history keeps
  working either way.
- **Rollback for 30 days**, one click, restoring from a snapshot taken inside
  the same transaction as the write.

---

## The size grid

§0 calls this "the screen that matters most". A row of quantity inputs, a row
of live availability, and a depth bar whose height maps to stock so a buyer
reads the health of a whole run before reading a single number.

- Typing above available clamps and explains inline. Never a modal — a buyer
  keying six sizes cannot be interrupted six times.
- Left/right arrows and Enter walk the run; up/down step the quantity by the
  case pack. Tab order follows size order.
- `case_pack` rounds and says so. `moq` warns and never blocks: minimums are
  the sales team's to negotiate, and a form that refuses a corporate enquiry
  has thrown away a lead.
- On mobile it scrolls horizontally with the size column sticky. It does not
  collapse to a stacked list — buyers need to see the run as a run.
- Switching colourway swaps the grid to that article's own size run while every
  other colour's quantities stay in the basket and visible in a summary
  underneath. Buyers routinely take one style in three colours.

---

## Accessibility

Audited against WCAG 2.1 AA, with the grid given its own pass (§0).

The palette in §10 is the agreed direction and is untouched. Two of its tokens
sit at or below the AA floor for small text, so darker partners carry body copy
while the originals still do rules, fills and large type:

| | on `--paper` | |
|---|---|---|
| `--ink` | 16.53:1 | body text |
| `--graphite` §10 | 4.53:1 | rules, large labels |
| `--graphite-ink` | 5.83:1 | small secondary text |
| `--flag` §10 | 4.35:1 — fails AA for normal text | fills, borders |
| `--flag-ink` | 5.57:1 | small warning text |
| `--paper` on `--fairway` | 8.91:1 | primary buttons |

Every grid cell has a full label (`"…in Flared / White, size S. 8 available."`),
the table has a caption explaining the keyboard model, the decorative depth row
is `aria-hidden` because its numbers already appear in the availability row, and
colour never carries meaning alone — sold-out sizes are struck through as well
as greyed.

**One open item:** `--sand` on `--paper` is 1.39:1. Those are the hairline cell
rules the yardage-book concept rests on. They are structural rather than
informational, so this is not a 1.4.11 failure, but it is worth a look on a
poor screen in sunlight — the trade-show case §11 assumes. Raised rather than
silently overridden, per §0.

---

## Before cutover

**Auth must be replaced.** `src/lib/auth.ts` is a signed, HTTP-only, 12-hour
session cookie in front of a single shared password from the environment. The
session layer is sound and middleware gates every `/admin` route with the page
re-verifying the signature properly. What it is not is what §2 requires:
invite-only Supabase Auth, per-user accounts, MFA enforced.
`verifyCredentials()` is the only function that compares a password — that is
the seam. Do this before the site is publicly reachable.

**Rebuild the redirect map from the real export.** `src/lib/redirects.ts` is
seeded with the collection handles a Shopify golf store would normally carry.
§14.7 step 4 asks for it to be tested against the top 100 indexed URLs — pull
those from Search Console and the products CSV. Anything unmatched currently
falls through to a pre-filled catalogue search, which is a valid landing but a
worse one than the right category.

**Have the terms and privacy pages reviewed.** They are written against UAE
Federal PDPL with the retention periods §11 specifies (quote requests 5 years
for FTA record-keeping, logo files deleted on request, marketing consent held
separately). They are not legal advice.

**Test the importer against a real stock file.** §15.5 is right that this is
where most of the risk sits, and the fuzzy matching has only been proven
against the supplied template and synthetic deformations of it.

Then work §14.7's checklist. The parts that are not code — export Shopify
first, screenshot the DNS zone, **do not touch MX, SPF, DKIM or any TXT
record**, drop the TTL 48 hours ahead, cut over on a Tuesday or Wednesday
morning UAE time — are where this goes wrong, and no amount of application
quality substitutes for them.

---

## Assumptions still unconfirmed (§15)

Worth settling before they become expensive:

1. **Catalogue size.** Built for a few hundred styles. Above ~2,000 the listing
   needs server-side pagination and a search index.
2. **Single language, English.** Multi-language changes the data model.
3. **No buyer accounts.** Repeat customers reordering last year's kit is a real
   pattern; buyer logins with quote history are significant added scope and
   worth deciding early.
4. **One price for every buyer.** Volume breaks are applied by the sales team on
   the quote, not by the site.
5. **Pre-owned and ex-display stock is hidden by default,** with a toggle in
   Admin → Settings. Anything not new is labelled everywhere it appears.
