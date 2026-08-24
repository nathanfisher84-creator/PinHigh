"use server";

import { getVariantsBySku, getBrandingPlacements } from "@/lib/repo/catalogue";
import { getSetting } from "@/lib/db";

/**
 * Server-side re-check of the basket on the review page (spec §6.4, §7.2).
 *
 * "Re-check every line against current stock server-side and flag movement for
 * the sales team without blocking the buyer." So this returns the truth about
 * each line and lets the UI present it as information, not as an error. The
 * buyer is never stopped; the flag travels with the request.
 */

export interface ReviewLineState {
  sku: string;
  /** Units on hand right now. */
  available: number;
  /** Set when what the buyer asked for is no longer fully there. */
  flag: string | null;
  /** True when the article has been withdrawn from the catalogue entirely. */
  gone: boolean;
  category: string;
  case_pack: number | null;
  moq: number | null;
}

export interface ReviewState {
  lines: ReviewLineState[];
  /** Placements the owner has enabled, by category (§8). */
  placementsByCategory: Record<string, string[]>;
  brandingMinUnits: number;
  responseHours: number;
}

export async function reviewCart(
  lines: { sku: string; quantity: number }[],
): Promise<ReviewState> {
  const skus = lines.map((l) => l.sku).filter(Boolean).slice(0, 500);
  const live = await getVariantsBySku(skus);

  const categories = new Set<string>();
  const states: ReviewLineState[] = [];

  for (const line of lines) {
    const variant = live.get(line.sku);

    if (!variant) {
      states.push({
        sku: line.sku,
        available: 0,
        flag: "This item is no longer in the catalogue. Our team will suggest an alternative.",
        gone: true,
        category: "accessories",
        case_pack: null,
        moq: null,
      });
      continue;
    }

    categories.add(variant.category);

    let flag: string | null = null;
    if (!variant.is_visible) {
      flag = "This item has been withdrawn since you added it. We'll confirm what's possible.";
    } else if (variant.quantity <= 0) {
      flag = "Sold out since you added it. We'll check what we can get for your date.";
    } else if (variant.quantity < line.quantity) {
      flag = `${variant.quantity} in stock — we'll confirm the rest on your quote.`;
    }

    states.push({
      sku: line.sku,
      available: variant.quantity,
      flag,
      gone: false,
      category: variant.category,
      case_pack: variant.case_pack,
      moq: variant.moq,
    });
  }

  const placementsByCategory: Record<string, string[]> = {};
  for (const category of categories) {
    placementsByCategory[category] = await getBrandingPlacements(category);
  }

  return {
    lines: states,
    placementsByCategory,
    brandingMinUnits: Number(await getSetting("branding_min_units")) || 12,
    responseHours: Number(await getSetting("quote_response_hours")) || 24,
  };
}
