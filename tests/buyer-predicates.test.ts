import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buyerCopyWasSent,
  isRelatedCatalogueCard,
} from "@/lib/domain/buyer-predicates";

describe("related-product predicate", () => {
  const current = { style_group: null, article_number: "HZ6893" };
  const cards = [
    { style_group: null, article_number: "HZ6893" },
    { style_group: null, article_number: "HZ6891" },
    { style_group: "g1", article_number: "AA0001" },
  ];

  test("Array.filter(async) keeps every item — that is the shipped bug", () => {
    const broken = cards.filter(async (c) =>
      current.style_group
        ? c.style_group !== current.style_group
        : c.article_number !== current.article_number,
    );
    assert.equal(broken.length, cards.length);
  });

  test("the sync predicate drops the current article and keeps others", () => {
    const related = cards.filter((c) => isRelatedCatalogueCard(c, current));
    assert.deepEqual(
      related.map((c) => c.article_number),
      ["HZ6891", "AA0001"],
    );
  });

  test("when a style_group is set, siblings of that group are excluded", () => {
    const grouped = { style_group: "g1", article_number: "AA0001" };
    const related = cards.filter((c) => isRelatedCatalogueCard(c, grouped));
    assert.deepEqual(
      related.map((c) => c.article_number),
      ["HZ6893", "HZ6891"],
    );
  });
});

describe("confirmation buyer-copy predicate", () => {
  const log = [
    { recipient: "sales@pinhighuae.com", status: "sent" },
    { recipient: "buyer@example.ae", status: "skipped" },
  ];

  test("Array.some(async) is true on any non-empty list — that is the shipped bug", () => {
    const broken = log.some(
      async (entry) => entry.recipient === "buyer@example.ae" && entry.status === "sent",
    );
    assert.equal(broken, true);
  });

  test("does not claim the buyer email was sent when it was skipped", () => {
    assert.equal(buyerCopyWasSent(log, "buyer@example.ae"), false);
  });

  test("is true only when that recipient is recorded as sent", () => {
    assert.equal(
      buyerCopyWasSent(
        [
          { recipient: "sales@pinhighuae.com", status: "sent" },
          { recipient: "buyer@example.ae", status: "sent" },
        ],
        "buyer@example.ae",
      ),
      true,
    );
  });

  test("an empty log never claims the email went out", () => {
    assert.equal(buyerCopyWasSent([], "buyer@example.ae"), false);
    const emptyBroken = [].some(
      async (entry: { recipient: string; status: string }) =>
        entry.recipient === "buyer@example.ae" && entry.status === "sent",
    );
    assert.equal(emptyBroken, false);
  });
});
