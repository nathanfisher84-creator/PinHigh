import Link from "next/link";
import { systemStatus, worstLevel, type StatusLevel } from "@/lib/status";

const DOT: Record<StatusLevel, string> = {
  ok: "bg-fairway",
  warn: "bg-[#D9A400]",
  off: "bg-flag",
};

const WORD: Record<StatusLevel, string> = {
  ok: "Everything is connected",
  warn: "Working, with things worth knowing",
  off: "Something needs attention",
};

/**
 * The dashboard's "is it healthy?" card. Red means a real gap — usually
 * quotes not reaching anyone — and says whose job it is to fix.
 */
export async function SystemStatus() {
  const items = await systemStatus();
  const overall = worstLevel(items);

  return (
    <section className="hairline bg-paper-raised px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-caps">System status</h2>
        <span className="flex items-center gap-2 text-sm">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[overall]}`} aria-hidden="true" />
          {WORD[overall]}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-sand text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex gap-3 py-2.5">
            <span
              className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.level]}`}
              aria-label={item.level === "ok" ? "OK" : item.level === "warn" ? "Warning" : "Not working"}
            />
            <div className="min-w-0">
              <p>
                <span className="font-medium">{item.label}</span>{" "}
                <span className="text-graphite-ink">— {item.detail}</span>
              </p>
              {item.action && (
                <p className="mt-0.5 text-xs text-graphite-ink">
                  {item.href ? (
                    <Link href={item.href} className="underline underline-offset-2 hover:text-fairway">
                      {item.action}
                    </Link>
                  ) : (
                    item.action
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-graphite-ink">
        Not sure what one of these means?{" "}
        <Link href="/admin/help#status" className="underline underline-offset-2 hover:text-fairway">
          The Help page explains each line.
        </Link>
      </p>
    </section>
  );
}
