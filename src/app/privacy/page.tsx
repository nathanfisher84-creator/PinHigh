import type { Metadata } from "next";
import { getSettings } from "@/lib/db";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Pin High UAE handles personal data, under the UAE Federal Personal Data Protection Law.",
};

/**
 * Privacy policy (spec §11).
 *
 * Written against UAE Federal PDPL, not GDPR — that is the applicable law for a
 * Dubai distributor. The retention periods stated here are the ones §11
 * specifies: quote requests held 5 years to satisfy FTA record-keeping, logo
 * files deleted on request and on account closure, marketing consent held
 * separately.
 *
 * NOT LEGAL ADVICE, and it must be reviewed before cutover. §11 also notes that
 * if the client sells into the EU, GDPR applies to those buyers and the
 * stricter standard should simply be adopted throughout.
 */
export default async function PrivacyPage() {
  const settings = await getSettings();
  const email = settings.contact_email || "sales@pinhighuae.com";

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl display-xl">Privacy</h1>
      <p className="mt-2 tabular text-sm text-graphite-ink">
        Last updated {new Date().toLocaleDateString("en-GB", { dateStyle: "long" })}
      </p>

      <div className="mt-8 space-y-8">
        <Section title="Who we are">
          <p>
            Pin High UAE is a golf equipment distributor based in Dubai, United
            Arab Emirates. We are the controller of the personal data described
            below. For anything on this page, write to{" "}
            <a href={`mailto:${email}`} className="underline underline-offset-2">
              {email}
            </a>
            .
          </p>
        </Section>

        <Section title="What we collect, and why">
          <p>When you send a quote request we collect:</p>
          <ul className="mt-2 space-y-1 list-disc pl-5">
            <li>Your company name and, if you give it, your TRN.</li>
            <li>Your name, role, email address and phone number.</li>
            <li>The emirate you want the order delivered to, and your required date.</li>
            <li>The items, sizes and quantities you specified, and any notes you wrote.</li>
            <li>Any logo artwork you upload, and your notes about it.</li>
          </ul>
          <p className="mt-3">
            We use it for one purpose: to price your request and reply to you. We
            do not sell it, and we do not share it with anyone beyond the
            suppliers and processors listed below.
          </p>
        </Section>

        <Section title="Legal basis">
          <p>
            We process this data to take steps at your request before entering
            into a contract, and to comply with our own tax and record-keeping
            obligations. We rely on your consent separately, and only, for
            marketing.
          </p>
        </Section>

        <Section title="How long we keep it">
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <strong>Quote requests</strong> — five years. UAE Federal Tax
              Authority record-keeping rules require us to retain commercial
              records for this period, and a request that converts is part of that
              record.
            </li>
            <li>
              <strong>Logo artwork</strong> — deleted on request, and on closure of
              your account. Your artwork is your trademark; we hold it only to
              produce your order.
            </li>
            <li>
              <strong>Marketing consent</strong> — held separately from the above,
              and withdrawn the moment you ask.
            </li>
            <li>
              <strong>Back-in-stock notifications</strong> — until we have notified
              you, or you ask us to remove you.
            </li>
          </ul>
        </Section>

        <Section title="Who processes it for us">
          <ul className="space-y-1 list-disc pl-5">
            <li>Our hosting and database providers, to run this site.</li>
            <li>Our transactional email provider, to send you a copy of your request.</li>
            <li>WhatsApp Business (Meta), to alert our own team that a request has arrived.</li>
          </ul>
          <p className="mt-3">
            Some of these process data outside the UAE. Where they do, we rely on
            the transfer mechanisms permitted under the UAE Personal Data
            Protection Law.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under the UAE Personal Data Protection Law you can ask us for a copy of
            your data, ask us to correct it, ask us to delete it, object to how we
            are using it, or withdraw consent to marketing. Write to{" "}
            <a href={`mailto:${email}`} className="underline underline-offset-2">
              {email}
            </a>{" "}
            and we will respond within 30 days.
          </p>
          <p className="mt-3">
            Where we must keep a record for tax purposes we will tell you, and we
            will restrict its use to that purpose rather than continuing to
            process it for anything else.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            This site sets no advertising or analytics cookies. Your basket is
            kept in your own browser&apos;s local storage so it survives if you
            close the tab and come back, and it never leaves your device until you
            send a request. Signing in to the admin area sets one essential cookie
            to keep that session open.
          </p>
        </Section>

        <Section title="Buyers in the EU or UK">
          <p>
            If you are contacting us from the EU or the UK, the GDPR may also apply
            to your data. Where it does, we apply the stricter of the two standards
            throughout rather than treating you differently.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl">{title}</h2>
      <div className="mt-3 space-y-2 text-graphite-ink">{children}</div>
    </section>
  );
}
