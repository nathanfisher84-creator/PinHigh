import "server-only";
import { get, getSetting } from "@/lib/db";
import { KEEPALIVE_SETTING, keepAliveStatus } from "@/lib/keepalive";
import { emailTransportStatus } from "@/lib/notify/email";
import { storageBackend } from "@/lib/images/storage";
import { canStoreSecrets } from "@/lib/secrets";
import { isVercel } from "@/lib/runtime";

/**
 * System status for the admin dashboard.
 *
 * The owner should be able to answer "is the site healthy, and if not, what
 * do I do?" without a developer. Each check says what it found in plain
 * words, and — when something is off — whether it is theirs to fix in the
 * panel or needs the deployment's environment changed. Nothing here ever
 * prints a secret.
 */

export type StatusLevel = "ok" | "warn" | "off";

export interface StatusItem {
  key: string;
  label: string;
  level: StatusLevel;
  /** What was found. */
  detail: string;
  /** What to do about it, when level is not ok. */
  action?: string;
  /** Where in the panel the fix lives, if it is the owner's to make. */
  href?: string;
}

export const DEVELOPER_NOTE = "Needs your developer: set in Vercel → Settings → Environment Variables, then redeploy.";

export async function systemStatus(): Promise<StatusItem[]> {
  const onVercel = isVercel();
  const items: StatusItem[] = [];

  /* -- Database ---------------------------------------------------------- */
  if (process.env.DATABASE_URL) {
    items.push({
      key: "database",
      label: "Database",
      level: "ok",
      detail: "Connected to Postgres. Quote requests, stock and uploads are kept.",
    });
  } else {
    items.push({
      key: "database",
      label: "Database",
      level: onVercel ? "off" : "warn",
      detail: onVercel
        ? "No database is connected. Anything written — a quote request, a stock upload — is lost when the server restarts."
        : "Running on the embedded development database.",
      action: onVercel ? `DATABASE_URL is not set. ${DEVELOPER_NOTE}` : undefined,
    });
  }

  /* -- Keep-alive -------------------------------------------------------- */
  // Only meaningful against the hosted database; the embedded one never pauses.
  if (process.env.DATABASE_URL) {
    items.push(keepAliveStatus(await getSetting(KEEPALIVE_SETTING)));
  }

  /* -- Email ------------------------------------------------------------- */
  const email = await emailTransportStatus();
  if (email.transport === "none") {
    items.push({
      key: "email",
      label: "Email sending",
      level: "off",
      detail: "Not set up. Quote requests are saved, but nobody is emailed and buyers get no confirmation.",
      action: "Enter a Gmail address and app password under Settings → Email sending, then send yourself a test.",
      href: "/admin/settings",
    });
  } else {
    items.push({
      key: "email",
      label: "Email sending",
      level: "ok",
      detail:
        email.transport === "resend"
          ? `Sending from ${email.sender} via the site's own domain.`
          : `Sending as ${email.sender}.`,
    });
  }

  /* -- Recipients -------------------------------------------------------- */
  const recipients = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM notification_recipients WHERE channel = 'email' AND is_active = 1",
  );
  const activeRecipients = Number(recipients?.n ?? 0);
  items.push(
    activeRecipients > 0
      ? {
          key: "recipients",
          label: "Who gets quote requests",
          level: "ok",
          detail: `${activeRecipients} ${activeRecipients === 1 ? "address is" : "addresses are"} emailed when a request arrives.`,
        }
      : {
          key: "recipients",
          label: "Who gets quote requests",
          level: "off",
          detail: "Nobody is set to receive quote requests.",
          action: "Add at least one address under Recipients.",
          href: "/admin/recipients",
        },
  );

  /* -- File storage ------------------------------------------------------ */
  if (storageBackend() === "supabase") {
    items.push({
      key: "storage",
      label: "Photos and artwork",
      level: "ok",
      detail: "Stored in Supabase. Product photos and buyers' logos are kept.",
    });
  } else {
    items.push({
      key: "storage",
      label: "Photos and artwork",
      level: onVercel ? "off" : "warn",
      detail: onVercel
        ? "Stored on the server's temporary disk. Uploaded photos and buyers' logos disappear on restart."
        : "Stored on local disk (development).",
      action: onVercel
        ? `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not both set. ${DEVELOPER_NOTE}`
        : undefined,
    });
  }

  /* -- Session secret ---------------------------------------------------- */
  items.push(
    canStoreSecrets()
      ? {
          key: "secret",
          label: "Sign-in security",
          level: "ok",
          detail: "Sessions survive redeploys; authenticators and the Gmail password can be stored.",
        }
      : {
          key: "secret",
          label: "Sign-in security",
          level: "off",
          detail:
            "ADMIN_SESSION_SECRET is missing. Everyone is signed out on each redeploy, and authenticator apps and the Gmail password can't be saved.",
          action: `Set ADMIN_SESSION_SECRET to any 32 or more random characters. ${DEVELOPER_NOTE}`,
        },
  );

  /* -- Accounts ---------------------------------------------------------- */
  const noMfa = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM admin_users WHERE is_active = 1 AND password_hash IS NOT NULL AND mfa_enabled = 0",
  );
  const withoutMfa = Number(noMfa?.n ?? 0);
  const owners = await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM admin_users WHERE is_active = 1 AND role = 'owner'",
  );
  const ownerCount = Number(owners?.n ?? 0);
  if (withoutMfa > 0) {
    items.push({
      key: "accounts",
      label: "Admin accounts",
      level: "warn",
      detail: `${withoutMfa} ${withoutMfa === 1 ? "account has" : "accounts have"} no authenticator app yet.`,
      action: "They'll be asked to set one up at their next sign-in. You can see who under Users.",
      href: "/admin/users",
    });
  } else if (ownerCount === 1) {
    items.push({
      key: "accounts",
      label: "Admin accounts",
      level: "warn",
      detail: "There is one owner account.",
      action: "Make a second person an owner under Users, so a lost phone or a leaver never locks the business out.",
      href: "/admin/users",
    });
  } else {
    items.push({
      key: "accounts",
      label: "Admin accounts",
      level: "ok",
      detail: `${ownerCount} owners; every account has an authenticator app.`,
    });
  }

  /* -- Abuse protection -------------------------------------------------- */
  const upstash = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  items.push(
    upstash
      ? {
          key: "ratelimit",
          label: "Form abuse limits",
          level: "ok",
          detail: "Shared rate limiting is on.",
        }
      : {
          key: "ratelimit",
          label: "Form abuse limits",
          level: "warn",
          detail: onVercel
            ? "Rate limiting works per server instance only, so a determined spammer gets more attempts than intended."
            : "Rate limiting is per process (development).",
          action: onVercel ? `Optional: UPSTASH_REDIS_REST_URL and _TOKEN. ${DEVELOPER_NOTE}` : undefined,
        },
  );

  const turnstile = Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  items.push(
    turnstile
      ? {
          key: "turnstile",
          label: "Bot check on the quote form",
          level: "ok",
          detail: "Cloudflare Turnstile is on.",
        }
      : {
          key: "turnstile",
          label: "Bot check on the quote form",
          level: "warn",
          detail: "Off. The hidden honeypot field and rate limit still apply.",
          action: `Optional: TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY. ${DEVELOPER_NOTE}`,
        },
  );

  return items;
}

export function worstLevel(items: StatusItem[]): StatusLevel {
  if (items.some((i) => i.level === "off")) return "off";
  if (items.some((i) => i.level === "warn")) return "warn";
  return "ok";
}
