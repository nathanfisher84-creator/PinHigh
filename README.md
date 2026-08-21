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
npm test        # 131 tests
```

The catalogue seeds itself on first run by running both real adidas files
through the real importers, in the order the business uses them: the
implementation file defines the products, then the invoice sets the stock.
adidas is the only brand; there is no sample data.

---

## What's built

Spec §12 sequences the work in nine phases and says to ship 1–5 first. Those
are done, plus most of 6.

| Phase | Status |
|---|---|
| 1 · Foundation — scaffold, schema, design tokens, layout, admin auth | Built |
| 2 · Catalogue — listing, filters, search, product page, size grid, basket | Built |
| 3 · Import — parse, column mapping, diff preview, commit, history, rollback | Built |
| 4 · Images — upload, processing pipeline, bulk zip matcher, management UI | Built |
| 5 · Quote requests — submission, validation, persistence, email, admin | Built |
| 6 · Branding — per-line toggle, placements, logo upload, admin surfacing | Built |
| 7 · WhatsApp — Cloud API, template, test tooling, retry | Code complete, unverified |
| 8 · Polish — accessibility, performance, SEO, copy | Partial |
| 9 · Cutover | Redirect map built; the rest is process |

### Known gaps

These are deliberate stopping points, not oversights.

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
    zip.ts                shared zip reader (xlsx and image packs)
    images/               match (filename -> article) · process (webp, resize, EXIF) · storage
    repo/                 catalogue and quote queries
    notify/               email, whatsapp, csv
    cart/store.ts         localStorage basket, keyed by SKU
    redirects.ts          the Shopify redirect map (§14.3)
supabase/migrations/      Postgres schema + RLS (the §2 target)
tests/                    131 tests, node:test, no test framework dependency
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

## No prices on the public site

Nothing on the buyer-facing site shows a price. Every product, size grid,
basket and confirmation says **Price on request**, because what a corporate
order costs depends on the quantity, the branding and the delivery — a figure
on a product page would be wrong for most of the people reading it, and the
sales team would spend the call arguing back from it.

The numbers still exist and are still used. Cost and RRP come off the adidas
files into admin-only columns, the corporate price is set per product in the
admin, and `indicative_value` is still stored on every quote request so the
team can see what a job is worth before pricing it. The line is drawn at what a
buyer sees: the sales team's notification carries the figures, the buyer's copy
of the same email does not.

`money()` and `amount()` are for the admin and the internal notification only —
there is a grep in the verification steps to keep them off public pages.


## The two adidas files

adidas send two SAP exports and they do different jobs. Both are detected by
their own columns, so the owner just uploads whatever arrived.

**The division of labour is the thing to get right:**

> The implementation file is the **template** — what the products *are*.
> The invoice is the **quantities** — what is actually on the shelf.
> **No stock is ever taken from the implementation file.**

### The implementation file — the template

`Order Number 5052282932`. Every article bought for the season, with the detail
the invoice does not carry.

| Column | Becomes |
|---|---|
| `Article No` | article number — six characters, `HZ6891` |
| `Article Name` | product name **and** colourway, in one fixed-width field |
| `Business Segment Description` + `Gender Description` | fit |
| `Size` | the article's size run |
| `Net Price/Unit` | unit cost, admin-only |
| `Manual Price` | RRP reference |

It imports in **details** mode: articles, names, colourways, fit, sizes and
prices. New sizes are created at zero; an existing quantity is never touched.
Its own `Quantity Ordered` and `Delivered Qty` columns are read only to report
on, never to set stock — they are order-book positions, and putting them on the
site would advertise units nobody can ship. That makes the import idempotent:
re-upload a refreshed template as often as adidas send one.

`Article Name` is two fixed-width fields run together —
`PERF TXT POLO       WHITE/MAROON` — so a run of two or more spaces is the
boundary. adidas' colour codes are kept as adidas writes them: expanding
`FROTUR` into a guess at "Frozen Turquoise" would be inventing data.

Category is inferred from the product name only where the name says so plainly.
21 of the 23 articles resolve to Polos; `M BU DRIVER HD` does not, so those two
are flagged for the owner rather than filed under a guess.

### The invoice — the quantities

`Billing Document 5101901080`. What actually left the warehouse: `Material`,
`AFS Grid Value`, `Invoiced Quantity`. It adds to stock, and every invoice
number is recorded so the same shipment cannot be counted twice.

Seeding both in order gives the correct result: **23 articles, 141 sizes, 750
units** — the invoice's figure, not the template's 1,000.

**Cost never becomes the public price.** Both files carry what Pin High pays
adidas. It goes in an admin-only `cost_price` column and the corporate price is
left null for the owner to set. Publishing a distributor's buying terms to its
own customers would be the most damaging thing either importer could do.

A caveat worth knowing: an invoice records what came in, and nothing decrements
stock as it is sold, so the figures drift until a stock take is uploaded.


## Images

Built to §5, and sharing the zip reader with the stock importer.

adidas ship a pack of around 160 JPEGs named `{ARTICLE}_{View}.jpeg` — the
first six characters are the article number, which is the whole matching rule.
Drop the zip into Admin → Products and it sorts itself out.

- **The CAD drawings are left out.** Alongside each photograph adidas include a
  flat technical illustration, named as a numbered variant of a view —
  `HZ6891_Standard View-1.jpeg`, `IS7344_Back View-1.jpeg`. On a catalogue page
  next to real photography they read as a mistake, so they are skipped and
  counted separately rather than reported as 21 problems.
  The discriminator is that the number qualifies a *named view*: `41002-1.jpg`
  is still photo one of article 41002 under §5's own convention.
- **The ghost-mannequin shot leads.** `Standard View` is what adidas uses as
  its own hero and what a buyer recognises, so it takes the card and the top of
  the product page. Front, back, side and back-centre fall in behind it.
- **A preview before anything is written**, listing what matched, what did not
  and why, how many CADs were skipped, and which products will still have no
  photo afterwards.
- **Windows zips work.** PowerShell's Compress-Archive writes backslash path
  separators rather than the forward slashes the zip spec calls for. Before that
  was handled, every photo inside a sub-folder silently failed to match. There
  is a regression test with a hand-built zip.
- **Processing**: converted to WebP at 400/800/1600, never upscaled beyond the
  source, and all EXIF stripped.
- macOS resource forks and `Thumbs.db` are dropped rather than reported.

Against the real pack: 164 files, 21 CADs skipped, 143 photographs matched,
nothing unmatched, all 23 articles covered.

One hero photograph per article ships in `seed/images`, pre-encoded, so a fresh
instance comes up looking like a catalogue rather than a grid of placeholders.
They are read straight from the bundle rather than copied into the writable
store — on Vercel every instance starts with an empty `/tmp` and is frozen once
it has responded, so anything deferred would never finish.

Per product, the admin has drag-and-drop upload, reordering, a primary
selection and editable alt text. Reordering uses explicit move buttons rather
than pointer dragging — that version works by keyboard and on a tablet, which
§11 assumes.


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
