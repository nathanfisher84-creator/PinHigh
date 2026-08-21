/**
 * Says out loud that this deployment does not keep what you write.
 *
 * Rendered only when the store is ephemeral (see `lib/runtime.ts`) — on a
 * Vercel deployment with no Supabase configured, every instance holds its own
 * copy of the catalogue in /tmp and discards it when it recycles.
 *
 * Browsing is completely accurate. A quote request will submit, produce a
 * reference and render its confirmation, but the sales team will not be able
 * to find it afterwards. Letting a buyer believe an enquiry had landed when it
 * had not is exactly the failure the whole quote model exists to avoid (§7.1),
 * so the site declares it rather than hiding it behind a caveat.
 */
export function EphemeralNotice() {
  return (
    <div className="border-b border-flag bg-flag-wash">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 text-sm">
        <strong className="font-semibold">Preview deployment.</strong>{" "}
        The catalogue and stock figures are real, but this environment has no
        database yet — quote requests and stock uploads are not kept. Don&apos;t
        send anything here you need us to receive.
      </div>
    </div>
  );
}
