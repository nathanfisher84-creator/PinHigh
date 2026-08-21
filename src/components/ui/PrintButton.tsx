"use client";

/**
 * Print / save as PDF.
 *
 * §7.2 step 6 asks for a PDF copy of the request. A print stylesheet plus the
 * browser's own "Save as PDF" gives the buyer a real file without shipping a
 * PDF renderer, and it works offline — which matters given §11 assumes a buyer
 * on a phone in poor signal.
 */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="hairline px-5 py-2.5 text-sm hover:border-fairway transition-colors duration-150"
    >
      {label}
    </button>
  );
}
