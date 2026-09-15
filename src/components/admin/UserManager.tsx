"use client";

import { useState, useTransition } from "react";
import {
  inviteUser,
  issueResetLink,
  resetUserMfaAction,
  setUserActiveAction,
  setUserRoleAction,
  type LinkResult,
} from "@/app/admin/actions";
import type { AdminUserSummary } from "@/lib/repo/admin-users";

/**
 * Account management (spec §2, §9).
 *
 * The one rule: an owner must never be stuck. Every action that would
 * normally send an email — an invitation, a reset — falls back to showing
 * the link on screen when email is not set up, so the owner can paste it
 * into WhatsApp and carry on.
 */
export function UserManager({
  users,
  me,
  canEmail,
}: {
  users: AdminUserSummary[];
  me: string;
  canEmail: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<LinkResult | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; message: string; link?: string }>) =>
    start(async () => setResult(await fn()));

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section className="hairline bg-paper-raised">
        <header className="border-b border-sand px-4 py-3">
          <h2 className="font-medium">Accounts</h2>
        </header>
        <ul className="divide-y divide-sand">
          {users.map((u) => (
            <li key={u.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`tabular ${u.is_active ? "" : "text-graphite-ink line-through"}`}>
                  {u.email}
                </span>
                {u.id === me && <span className="text-2xs uppercase tracking-wider text-graphite-ink">you</span>}
                <Badge tone={u.role === "owner" ? "ink" : "sand"}>{u.role}</Badge>
                {!u.is_active ? (
                  <Badge tone="flag">Access removed</Badge>
                ) : u.pending_invite ? (
                  <Badge tone="sand">Invited — not yet set up</Badge>
                ) : u.mfa_enabled ? (
                  <Badge tone="fairway">Authenticator on</Badge>
                ) : (
                  <Badge tone="flag">No authenticator yet</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-graphite-ink">
                {u.last_login_at
                  ? `Last signed in ${new Date(u.last_login_at).toLocaleString("en-AE")}`
                  : "Never signed in"}
                {u.invited_by ? ` · invited by ${u.invited_by}` : ""}
              </p>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {u.is_active && u.id !== me && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => setUserActiveAction(u.id, false))}
                    className="text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
                  >
                    Remove access
                  </button>
                )}
                {!u.is_active && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => setUserActiveAction(u.id, true))}
                    className="text-graphite-ink underline underline-offset-2 hover:text-fairway"
                  >
                    Restore access
                  </button>
                )}
                {u.is_active && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      act(() => setUserRoleAction(u.id, u.role === "owner" ? "staff" : "owner"))
                    }
                    className="text-graphite-ink underline underline-offset-2 hover:text-fairway"
                  >
                    {u.role === "owner" ? "Make staff" : "Make owner"}
                  </button>
                )}
                {u.is_active && u.has_password && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => issueResetLink(u.id))}
                    className="text-graphite-ink underline underline-offset-2 hover:text-fairway"
                  >
                    Send password reset
                  </button>
                )}
                {u.is_active && u.mfa_enabled && u.id !== me && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Remove ${u.email}'s authenticator? They will set a new one up at their next sign-in.`)) {
                        act(() => resetUserMfaAction(u.id));
                      }
                    }}
                    className="text-graphite-ink underline underline-offset-2 hover:text-flag-ink"
                  >
                    Reset authenticator (lost phone)
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Add someone</h2>
          <form
            action={(formData) =>
              start(async () => {
                setResult(await inviteUser(formData));
              })
            }
          >
            <label htmlFor="invite-email" className="label-caps block mb-1">
              Email address
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="name@company.com"
              className="w-full hairline bg-paper px-3 py-2 text-sm tabular focus:outline-none focus:border-fairway"
            />
            <label htmlFor="invite-role" className="label-caps mt-4 block mb-1">
              Role
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue="staff"
              className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
            >
              <option value="staff">Staff — quotes, stock, products, settings</option>
              <option value="owner">Owner — everything, including this page</option>
            </select>
            <p className="mt-2 text-xs text-graphite-ink">
              {canEmail
                ? "They get an email with a link to choose a password. It lasts seven days."
                : "Email isn't set up on this site, so you'll be shown a link to send them yourself."}
            </p>
            <button
              type="submit"
              disabled={pending}
              className="mt-4 w-full bg-fairway px-4 py-2 text-sm text-paper hover:bg-ink transition-colors duration-150 disabled:opacity-60"
            >
              {pending ? "Working…" : "Send invitation"}
            </button>
          </form>
        </div>

        {result && <ResultBox result={result} onDismiss={() => setResult(null)} />}
      </aside>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ink" | "sand" | "fairway" | "flag"; children: React.ReactNode }) {
  const cls = {
    ink: "bg-ink text-paper",
    sand: "bg-sand text-ink",
    fairway: "bg-fairway text-paper",
    flag: "bg-flag-wash text-flag-ink border border-flag",
  }[tone];
  return (
    <span className={`text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 ${cls}`}>{children}</span>
  );
}

function ResultBox({ result, onDismiss }: { result: LinkResult; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      role={result.ok ? "status" : "alert"}
      className={`hairline px-4 py-3 text-sm ${result.ok ? "bg-paper-raised" : "border-flag bg-flag-wash"}`}
    >
      <p>{result.message}</p>
      {result.link && (
        <>
          <p className="mt-2 break-all tabular text-xs bg-paper px-2 py-2 select-all">{result.link}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.link!);
                setCopied(true);
              } catch {
                /* the text is selectable either way */
              }
            }}
            className="mt-2 hairline px-3 py-1.5 text-xs hover:border-fairway"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-3 mt-2 text-xs text-graphite-ink underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
