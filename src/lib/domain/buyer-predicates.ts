/**
 * Sync predicates that used to be written as `async` callbacks.
 *
 * `Array.filter(async …)` and `Array.some(async …)` do not await the
 * callback. A Promise is truthy, so filter keeps every item and some()
 * returns true on the first element of a non-empty list. The related-product
 * rail and the confirmation "email sent" line both shipped with that bug.
 */

export function isRelatedCatalogueCard(
  card: { style_group: string | null; article_number: string },
  product: { style_group: string | null; article_number: string },
): boolean {
  return product.style_group
    ? card.style_group !== product.style_group
    : card.article_number !== product.article_number;
}

export function buyerCopyWasSent(
  notified: ReadonlyArray<{ recipient: string; status: string }>,
  buyerEmail: string,
): boolean {
  return notified.some(
    (entry) => entry.recipient === buyerEmail && entry.status === "sent",
  );
}
