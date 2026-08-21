import "server-only";
import sharp from "sharp";

/**
 * Image processing (spec §5).
 *
 * "On upload: convert to WebP, generate 400 / 800 / 1600 px widths, strip EXIF,
 * cap at 5 MB input."
 *
 * Stripping metadata is the part that matters beyond file size. Supplier packs
 * and phone photographs carry EXIF that can include GPS coordinates, camera
 * serial numbers and the photographer's name. sharp drops all of it unless you
 * explicitly ask to keep it, and nothing here asks.
 */

export const WIDTHS = [400, 800, 1600] as const;
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/**
 * Cap for a bulk zip. The whole archive is held in memory while it is read, so
 * this bounds peak usage. Lives here rather than beside the action that uses
 * it because a "use server" module may only export async functions.
 */
export const MAX_ZIP_BYTES = 20 * 1024 * 1024;

/** Formats worth accepting from a supplier. */
const ACCEPTED = new Set(["jpeg", "jpg", "png", "webp", "avif", "gif", "tiff"]);

export interface Rendition {
  width: number;
  data: Buffer;
}

export interface ProcessedImage {
  renditions: Rendition[];
  /** Dimensions of the source, for aspect-ratio sanity checks. */
  sourceWidth: number;
  sourceHeight: number;
}

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export async function processImage(input: Buffer, filename: string): Promise<ProcessedImage> {
  if (input.length > MAX_INPUT_BYTES) {
    throw new ImageError(
      `${filename} is ${(input.length / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB — save it smaller and try again.`,
    );
  }

  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageError(`${filename} isn't an image we can read.`);
  }

  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw new ImageError(`${filename} is a ${meta.format ?? "unknown"} file, which we can't use.`);
  }
  if (!meta.width || !meta.height) {
    throw new ImageError(`${filename} has no readable dimensions.`);
  }

  const renditions: Rendition[] = [];
  for (const width of WIDTHS) {
    // Never upscale: a 600px supplier image should not be blown up to 1600 and
    // presented as if it were high resolution.
    const target = Math.min(width, meta.width);

    const data = await sharp(input)
      .rotate() // honour EXIF orientation before the metadata is discarded
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    renditions.push({ width, data });

    // Once the source is narrower than the next step up, the remaining
    // renditions would be identical. Stop and let the largest stand in.
    if (target < width) break;
  }

  return { renditions, sourceWidth: meta.width, sourceHeight: meta.height };
}

/**
 * Alt text (§5): "auto-generate `{style_name} in {colour}` and let the owner
 * override". Brand included because a screen-reader user scanning a listing
 * needs the same first cue a sighted buyer gets from the card.
 */
export function defaultAltText(brand: string, styleName: string, colour: string): string {
  return `${brand} ${styleName} in ${colour}`.replace(/\s+/g, " ").trim();
}
