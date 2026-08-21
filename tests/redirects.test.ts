import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchRedirect } from "@/lib/redirects";

/**
 * The cutover (spec §14.3) is where most of the risk in this project sits, and
 * "No previously indexed URL may return a 404" is the hard requirement.
 */

describe("Shopify redirect map", () => {
  test("collection paths map to the nearest category", () => {
    assert.equal(matchRedirect("/collections/shoes"), "/catalogue/shoes");
    assert.equal(matchRedirect("/collections/polos"), "/catalogue/polos");
    assert.equal(matchRedirect("/collections/golf-balls"), "/catalogue/balls");
  });

  test("gender collections become filters, not categories", () => {
    // §14.3 gives this exact example: /collections/womens -> Ladies.
    assert.equal(matchRedirect("/collections/womens"), "/catalogue?gender=ladies");
    assert.equal(matchRedirect("/collections/mens"), "/catalogue?gender=mens");
  });

  test("brand collections land on brand pages", () => {
    assert.equal(matchRedirect("/collections/adidas"), "/brand/adidas");
    assert.equal(matchRedirect("/collections/titleist"), "/brand/titleist");
  });

  test("an unknown collection falls back to the catalogue rather than 404ing", () => {
    assert.equal(matchRedirect("/collections/whatever-this-was"), "/catalogue");
  });

  test("product URLs carry their handle into search", () => {
    const target = matchRedirect(
      "/products/adidas-mens-ultimate365-stripe-golf-polo-navy",
    );
    assert.ok(target?.startsWith("/catalogue?q="));
    assert.ok(decodeURIComponent(target!).includes("ultimate365"));
  });

  test("nested collection product URLs resolve too", () => {
    const target = matchRedirect("/collections/polos/products/some-polo");
    assert.ok(target?.startsWith("/catalogue?q="));
  });

  test("cart and checkout go to the quote flow", () => {
    assert.equal(matchRedirect("/cart"), "/quote");
    assert.equal(matchRedirect("/checkout"), "/quote");
  });

  test("Shopify content pages map to ours", () => {
    assert.equal(matchRedirect("/pages/about-us"), "/about");
    assert.equal(matchRedirect("/pages/privacy-policy"), "/privacy");
  });

  test("trailing slashes do not change the destination", () => {
    assert.equal(matchRedirect("/collections/shoes/"), "/catalogue/shoes");
  });

  test("live routes are left alone", () => {
    // Returning a destination for these would cause a redirect loop.
    for (const live of ["/", "/catalogue", "/catalogue/polos", "/product/41001", "/admin", "/quote"]) {
      assert.equal(matchRedirect(live), null, live);
    }
  });
});
