"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget. Only mounts when a site key is present, so
 * local and unconfigured deploys are not blocked.
 */
export function TurnstileField() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [token, setToken] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;

    const w = window as unknown as {
      turnstile?: {
        render: (el: HTMLElement, opts: Record<string, unknown>) => string;
        remove: (id: string) => void;
      };
    };

    let widgetId: string | null = null;
    const render = () => {
      if (!hostRef.current || !w.turnstile) return;
      widgetId = w.turnstile.render(hostRef.current, {
        sitekey: siteKey,
        callback: (value: string) => setToken(value),
      });
    };

    if (w.turnstile) {
      render();
    } else {
      const existing = document.querySelector("script[data-pinhigh-turnstile]");
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.pinhighTurnstile = "1";
        script.onload = render;
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", render);
      }
    }

    return () => {
      if (widgetId && w.turnstile) w.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <>
      <input type="hidden" name="turnstile_token" value={token} />
      <div ref={hostRef} className="mt-3" />
    </>
  );
}
