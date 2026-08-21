import type { Metadata } from "next";
import { QuoteReview } from "@/components/quote/QuoteReview";

export const metadata: Metadata = {
  title: "Request a quote",
  description:
    "Review your size run, add your logo if you want it, and send it to the Pin High team for a quote.",
  robots: { index: false, follow: true },
};

export default function QuotePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
      <h1 className="text-3xl display-xl">Request a quote</h1>
      <p className="mt-2 max-w-2xl text-graphite-ink">
        Check the sizes below, tell us who you are, and we&apos;ll come back with a
        price. Nothing is charged here and nothing is reserved until we confirm it.
      </p>

      <div className="mt-8">
        <QuoteReview />
      </div>
    </div>
  );
}
