import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { OrderRail } from "@/components/order/OrderRail";
import { EphemeralNotice } from "@/components/shell/EphemeralNotice";
import { getFacets, getStockAsAt } from "@/lib/repo/catalogue";
import { getSetting } from "@/lib/db";
import { isEphemeralStore, isIndexable, siteUrl } from "@/lib/runtime";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Pin High UAE — Corporate golf kit, quoted from stock in Dubai",
    template: "%s · Pin High UAE",
  },
  description:
    "Multi-brand golf apparel, footwear and equipment for UAE companies. Build a size run from live stock, add your logo, and get a quote from our Dubai team.",
  openGraph: {
    type: "website",
    locale: "en_AE",
    siteName: "Pin High UAE",
  },
  // A preview deployment must not compete with the live site in search
  // results while pinhighuae.com is still the real one (§14).
  robots: isIndexable()
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#F7F6F3",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once here and pass down, so the header search and the announcement
  // bar do not each open their own query on every navigation.
  const facets = await getFacets();
  const announcement = await getSetting("announcement");
  const contactEmail = await getSetting("contact_email");
  const contactPhone = await getSetting("contact_phone");
  const stockDate = await getStockAsAt();

  return (
    <html lang="en-AE">
      <head>
        {/* Fonts load progressively. If the network is unavailable the stacks
            in globals.css take over, which keeps the grid legible offline —
            the buyer at a trade show on bad signal is the assumed case (§11). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-fairway focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>

        {isEphemeralStore() && <EphemeralNotice />}

        <SiteHeader
          brands={facets.brands}
          categories={facets.categories}
          genders={facets.genders}
          stockDate={stockDate}
          announcement={announcement}
        />

        <main id="main" className="flex-1 fade-in">
          {children}
        </main>

        <SiteFooter
          stockDate={stockDate}
          categories={facets.categories}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
        />

        {/* The running total. Persistent rail on desktop, bottom bar on mobile
            (§6.3). Rendered once at the root so it survives navigation between
            products — a buyer taking one style in three colours must never see
            it reset. */}
        <OrderRail />
      </body>
    </html>
  );
}
