import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { get } from "@/lib/db";

/**
 * Customer artwork download (spec §8).
 *
 * "Store privately in Supabase with signed-URL access only — these are
 * customers' trademarks." The local equivalent: files live outside the public
 * directory and are only ever served through this authenticated route.
 *
 * Two checks, both necessary. Authentication stops the public reading them, and
 * verifying the filename against the database stops an authenticated user
 * walking the directory or path-traversing out of it.
 */

const LOGO_DIR = path.join(
  process.env.PINHIGH_DATA_DIR ?? path.join(process.cwd(), ".data"),
  "private",
  "logos",
);

const CONTENT_TYPES: Record<string, string> = {
  ".ai": "application/postscript",
  ".eps": "application/postscript",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  if (!(await getSession())) {
    return new NextResponse("Not signed in.", { status: 401 });
  }

  const { file } = await params;
  // basename strips any traversal before it can matter.
  const name = path.basename(decodeURIComponent(file));

  // Only serve a file some quote request actually points at.
  const owner = get<{ reference: string }>(
    "SELECT reference FROM quote_requests WHERE logo_path = ?",
    name,
  );
  if (!owner) return new NextResponse("Not found.", { status: 404 });

  const filePath = path.join(LOGO_DIR, name);
  if (!filePath.startsWith(LOGO_DIR) || !existsSync(filePath)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const buffer = await readFile(filePath);
  const ext = path.extname(name).toLowerCase();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      // Always an attachment. An SVG rendered inline from a customer upload is
      // a stored-XSS vector against the admin panel.
      "Content-Disposition": `attachment; filename="${owner.reference}-artwork${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
