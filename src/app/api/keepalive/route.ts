import { NextResponse } from "next/server";
import { cronAuthorized, keepAlive } from "@/lib/keepalive";

// Called once a day by Vercel Cron (vercel.json). See lib/keepalive.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await keepAlive();
  return NextResponse.json({ ok: true });
}
