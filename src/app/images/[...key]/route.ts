import { NextResponse } from "next/server";
import { getImage } from "@/lib/images/storage";
import { WIDTHS } from "@/lib/images/process";

/**
 * Serves product imagery (spec §5).
 *
 * Public, unlike customer artwork (§8) which is admin-authenticated. Images are
 * immutable once written — the key contains a random id — so they are cached
 * hard. A replaced image gets a new id and therefore a new URL.
 *
 * `?w=` picks a rendition. Anything unrecognised falls back to the largest
 * available rather than 404ing, because a missing photo on a catalogue page is
 * a worse outcome than serving one that is bigger than asked for.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const requested = key.join("/");

  const url = new URL(request.url);
  const widthParam = Number(url.searchParams.get("w"));

  let data = await getImage(requested);

  if (!data && Number.isFinite(widthParam) && widthParam > 0) {
    // Swap the width in the key for the nearest rendition we actually made.
    const match = requested.match(/^(.*)-(\d+)\.webp$/);
    if (match) {
      const candidates = [...WIDTHS].sort(
        (a, b) => Math.abs(a - widthParam) - Math.abs(b - widthParam),
      );
      for (const w of candidates) {
        data = await getImage(`${match[1]}-${w}.webp`);
        if (data) break;
      }
    }
  }

  if (!data) {
    // The product page renders its branded placeholder on a missing image, so
    // a 404 here is handled rather than broken.
    return new NextResponse("Not found.", { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
