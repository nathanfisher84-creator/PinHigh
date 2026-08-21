import type { NotificationLog, QuoteRequestWithLines } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";

/**
 * Per-recipient delivery status (spec §7.3).
 *
 * Three states, deliberately distinct:
 *   sent    — it landed.
 *   failed  — it should have landed and did not. Actionable, flagged loudly.
 *   skipped — the channel is not connected yet. Not a failure, but the owner
 *             still needs to know nothing went out, which is why it is shown
 *             rather than hidden.
 */
export function NotificationStatus({ quote }: { quote: QuoteRequestWithLines }) {
  const channels: { label: string; log: NotificationLog }[] = [
    { label: "Email", log: quote.notified_email },
    { label: "WhatsApp", log: quote.notified_whatsapp },
  ];

  const hasAny = channels.some((c) => c.log.length > 0);
  if (!hasAny) return null;

  return (
    <section className="mt-8">
      <h2 className="label-caps mb-2">Who was told</h2>
      <div className="hairline bg-paper-raised divide-y divide-sand">
        {channels.map((channel) =>
          channel.log.length === 0 ? null : (
            <div key={channel.label} className="px-4 py-3">
              <p className="label-caps mb-2">{channel.label}</p>
              <ul className="space-y-1.5 text-sm">
                {channel.log.map((entry, i) => (
                  <li key={`${entry.recipient}-${i}`} className="flex flex-wrap items-baseline gap-x-3">
                    <span
                      className={[
                        "text-2xs font-semibold uppercase tracking-wider px-1.5 py-0.5 shrink-0",
                        entry.status === "sent"
                          ? "bg-fairway text-paper"
                          : entry.status === "failed"
                            ? "bg-flag text-paper"
                            : "bg-sand text-ink",
                      ].join(" ")}
                    >
                      {entry.status}
                    </span>
                    <span>{entry.name}</span>
                    <span className="tabular text-xs text-graphite-ink break-all">
                      {entry.recipient}
                    </span>
                    {entry.attempts > 1 && (
                      <span className="tabular text-xs text-graphite-ink">
                        {entry.attempts} attempts
                      </span>
                    )}
                    <span className="tabular text-xs text-graphite-ink">
                      {formatDateTime(entry.at)}
                    </span>
                    {entry.detail && (
                      <span className="w-full text-xs text-graphite-ink">{entry.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
