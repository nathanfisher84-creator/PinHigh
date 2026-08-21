/**
 * Shopify redirect map (spec §14.3).
 *
 * "Every previously indexed Shopify URL must land somewhere sensible.
 * /collections/* and /products/* are the two patterns that matter... Keep the
 * map in a checked-in config file rather than scattered through middleware."
 *
 * This file is that config. It is deliberately data, not logic, so the owner's
 * future developer can add a row without reading any code.
 *
 * BEFORE CUTOVER: this is seeded from the collection names a Shopify golf store
 * would normally carry. It must be rebuilt from the *real* export — pull the
 * top 100 indexed URLs from Search Console and the products CSV, and test every
 * one (§14.7 step 4). Any old URL not matched here falls through to
 * /catalogue, which is a valid landing but a worse one than the right category.
 */

/** Exact path → destination. Checked first. */
export const REDIRECTS: Record<string, string> = {
  "/collections/all": "/catalogue",
  "/collections": "/catalogue",
  "/products": "/catalogue",
  "/pages/about-us": "/about",
  "/pages/about": "/about",
  "/pages/contact-us": "/contact",
  "/pages/contact": "/contact",
  "/pages/terms-and-conditions": "/terms",
  "/pages/terms-of-service": "/terms",
  "/pages/privacy-policy": "/privacy",
  "/pages/refund-policy": "/terms",
  "/pages/shipping-policy": "/terms",
  "/cart": "/quote",
  "/checkout": "/quote",
  "/account": "/contact",
  "/account/login": "/contact",
  "/account/register": "/contact",
  "/search": "/catalogue",
  "/blogs/news": "/catalogue",
};

/**
 * Collection handle → category route.
 * Shopify handles are lowercase and hyphenated, which makes them close to our
 * own category slugs but not identical — "womens" is a gender, not a category,
 * so it maps to a filtered catalogue view rather than a category page.
 */
export const COLLECTION_MAP: Record<string, string> = {
  // Direct category equivalents
  polos: "/catalogue/polos",
  "polo-shirts": "/catalogue/polos",
  "t-shirts": "/catalogue/t-shirts",
  tshirts: "/catalogue/t-shirts",
  tees: "/catalogue/t-shirts",
  "mid-layers": "/catalogue/mid-layers",
  midlayers: "/catalogue/mid-layers",
  sweaters: "/catalogue/mid-layers",
  knitwear: "/catalogue/mid-layers",
  outerwear: "/catalogue/outerwear",
  jackets: "/catalogue/outerwear",
  waterproofs: "/catalogue/outerwear",
  trousers: "/catalogue/trousers",
  pants: "/catalogue/trousers",
  shorts: "/catalogue/shorts",
  skorts: "/catalogue/skorts",
  skirts: "/catalogue/skorts",
  caps: "/catalogue/caps",
  hats: "/catalogue/caps",
  headwear: "/catalogue/caps",
  gloves: "/catalogue/gloves",
  shoes: "/catalogue/shoes",
  footwear: "/catalogue/shoes",
  "golf-shoes": "/catalogue/shoes",
  belts: "/catalogue/belts",
  socks: "/catalogue/socks",
  "golf-bags": "/catalogue/golf-bags",
  bags: "/catalogue/golf-bags",
  "stand-bags": "/catalogue/golf-bags",
  "cart-bags": "/catalogue/golf-bags",
  balls: "/catalogue/balls",
  "golf-balls": "/catalogue/balls",
  clubs: "/catalogue/clubs",
  "golf-clubs": "/catalogue/clubs",
  putters: "/catalogue/clubs",
  irons: "/catalogue/clubs",
  drivers: "/catalogue/clubs",
  wedges: "/catalogue/clubs",
  "junior-sets": "/catalogue/junior-sets",
  juniors: "/catalogue/junior-sets",
  kids: "/catalogue/junior-sets",
  rangefinders: "/catalogue/rangefinders",
  "laser-rangefinders": "/catalogue/rangefinders",
  gps: "/catalogue/rangefinders",
  trolleys: "/catalogue/trolleys",
  towels: "/catalogue/towels",
  umbrellas: "/catalogue/umbrellas",
  accessories: "/catalogue/accessories",

  // Gender collections become filters, not categories.
  mens: "/catalogue?gender=mens",
  "mens-golf": "/catalogue?gender=mens",
  womens: "/catalogue?gender=ladies",
  ladies: "/catalogue?gender=ladies",
  "ladies-golf": "/catalogue?gender=ladies",
  "womens-golf": "/catalogue?gender=ladies",

  // Brand collections become brand landing pages (§6.2).
  adidas: "/brand/adidas",
  callaway: "/brand/callaway",
  titleist: "/brand/titleist",
  ping: "/brand/ping",
  footjoy: "/brand/footjoy",
  puma: "/brand/puma",
  taylormade: "/brand/taylormade",
  mizuno: "/brand/mizuno",
  "under-armour": "/brand/under armour",
  skechers: "/brand/skechers",
  odyssey: "/brand/odyssey",
  bushnell: "/brand/bushnell",
  vice: "/brand/vice",

  // Sale and clearance collections have no equivalent — the corporate
  // proposition is not a discount one (§14.6). Send them to the catalogue.
  sale: "/catalogue",
  clearance: "/catalogue",
  outlet: "/catalogue",
  "best-sellers": "/catalogue",
  "new-arrivals": "/catalogue?sort=stock",
};

/**
 * Resolve a legacy path.
 *
 * Returns null when the path is a live route and nothing should happen. Order
 * matters: exact matches first, then collections, then products, then a
 * catch-all so no indexed URL 404s.
 */
export function matchRedirect(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (REDIRECTS[path]) return REDIRECTS[path];

  /*
   * /products/{handle} and /collections/{c}/products/{handle}.
   *
   * Checked before collections, because Shopify nests product URLs under a
   * collection and the more specific match has to win — otherwise every
   * /collections/polos/products/… lands on the polos category instead of the
   * product the buyer actually followed a link to.
   *
   * The article number cannot be recovered from a Shopify handle, so these go
   * to the catalogue with the handle as a search term: search already matches
   * style name, colour and article number, so a handle like
   * "adidas-ultimate365-stripe-polo-navy" lands the buyer on something
   * relevant rather than on a dead end. §14.3 asks for the parent category
   * where the article cannot be matched; a pre-filled search is strictly
   * better and degrades to the full catalogue when it finds nothing.
   */
  const product = path.match(/\/products\/([^/]+)/);
  if (product) {
    const handle = decodeURIComponent(product[1]).toLowerCase();
    const terms = handle.replace(/-/g, " ").replace(/\bcopy\b|\d{4,}$/g, "").trim();
    return terms ? `/catalogue?q=${encodeURIComponent(terms)}` : "/catalogue";
  }

  /* /collections/{handle} and /collections/{handle}/{tag} */
  const collection = path.match(/^\/collections\/([^/]+)/);
  if (collection) {
    const handle = decodeURIComponent(collection[1]).toLowerCase();
    return COLLECTION_MAP[handle] ?? "/catalogue";
  }

  return null;
}
