import { getSetting, getSettings } from "@/lib/db";
import { saveSettings } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { GmailSettings, PasswordSettings } from "@/components/admin/OwnerSettings";
import { emailTransportStatus } from "@/lib/notify/email";
import { canStoreSecrets } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  const email = await emailTransportStatus();
  const hasOwnPassword = Boolean(await getSetting("admin_password_hash"));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl">Settings</h1>

      <div className="mt-8 space-y-8">
        <GmailSettings
          transport={email.transport}
          sender={email.sender}
          canStore={canStoreSecrets()}
        />
        <PasswordSettings hasOwnPassword={hasOwnPassword} />
      </div>

      <form action={saveSettings} className="mt-8 space-y-8">
        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Announcement banner</h2>
          <label htmlFor="announcement" className="sr-only">
            Announcement text
          </label>
          <input
            id="announcement"
            name="announcement"
            defaultValue={settings.announcement}
            placeholder="e.g. New season stock landing week commencing 8 September"
            className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
          />
          <p className="mt-1 text-xs text-graphite-ink">
            Shows across the top of every page. Leave it empty to hide it.
          </p>
        </section>

        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Contact details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sales email"
              name="contact_email"
              type="email"
              defaultValue={settings.contact_email}
            />
            <Field label="Phone" name="contact_phone" defaultValue={settings.contact_phone} />
            <Field
              label="WhatsApp number for buyers"
              name="contact_whatsapp"
              defaultValue={settings.contact_whatsapp}
              help="Used for the 'Send us a WhatsApp' button on the confirmation screen. Full international format."
              className="sm:col-span-2"
            />
          </div>
        </section>

        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Quoting</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Minimum units per branded design"
              name="branding_min_units"
              defaultValue={settings.branding_min_units}
              numeric
              help="Warns below this. Never blocks — a small enquiry is still a lead."
            />
            <Field
              label="Response time we promise (hours)"
              name="quote_response_hours"
              defaultValue={settings.quote_response_hours}
              numeric
              help="Shown on the confirmation screen and in the buyer's email."
            />
          </div>
        </section>

        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Pre-owned and ex-display stock</h2>
          <input type="hidden" name="_present_show_non_new_stock" value="1" />
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="show_non_new_stock"
              defaultChecked={settings.show_non_new_stock === "true"}
              className="mt-1 h-4 w-4 accent-[var(--color-fairway)]"
            />
            <span>
              <strong>Show pre-owned and ex-display stock in the catalogue</strong>
              <span className="block text-graphite-ink">
                Off by default. Anything not new is clearly labelled wherever it
                appears and buyers can filter it out. Mixing used equipment into a
                trade catalogue without saying so is the fastest way to lose a
                professional buyer.
              </span>
            </span>
          </label>
        </section>

        <SubmitButton label="Save settings" />
      </form>

      <form action={saveSettings} className="mt-8 space-y-8">
        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">Front flyer</h2>
          <p className="mb-4 text-xs text-graphite-ink">
            The home page hero. Leave a field empty to keep the default.
          </p>
          <div className="grid gap-4">
            <Field
              label="Kicker (small line above the headline)"
              name="home_kicker"
              defaultValue={settings.home_kicker}
            />
            <div>
              <label htmlFor="home_headline" className="label-caps block mb-1">
                Headline
              </label>
              <textarea
                id="home_headline"
                name="home_headline"
                rows={2}
                defaultValue={settings.home_headline}
                className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
              />
            </div>
            <div>
              <label htmlFor="home_body" className="label-caps block mb-1">
                Body
              </label>
              <textarea
                id="home_body"
                name="home_body"
                rows={3}
                defaultValue={settings.home_body}
                className="w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Button label"
                name="home_cta_label"
                defaultValue={settings.home_cta_label}
              />
              <Field
                label="Button link"
                name="home_cta_href"
                defaultValue={settings.home_cta_href}
              />
            </div>
          </div>
        </section>

        <section className="hairline bg-paper-raised px-4 py-4">
          <h2 className="label-caps mb-3">New-product carousel</h2>
          <input type="hidden" name="_present_carousel_enabled" value="1" />
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="carousel_enabled"
              defaultChecked={settings.carousel_enabled === "true"}
              className="mt-1 h-4 w-4 accent-[var(--color-fairway)]"
            />
            <span>
              <strong>Show the carousel on the home flyer</strong>
              <span className="block text-graphite-ink">
                Off until you turn it on. Use it for a theme of new product.
              </span>
            </span>
          </label>
          <div className="mt-4 grid gap-4">
            <Field
              label="Carousel title"
              name="carousel_title"
              defaultValue={settings.carousel_title}
            />
            <div>
              <label htmlFor="carousel_articles" className="label-caps block mb-1">
                Article numbers
              </label>
              <textarea
                id="carousel_articles"
                name="carousel_articles"
                rows={3}
                defaultValue={settings.carousel_articles}
                placeholder="HZ6893, HZ6891, IU4435"
                className="w-full hairline bg-paper px-3 py-2 text-sm tabular focus:outline-none focus:border-fairway"
              />
              <p className="mt-1 text-xs text-graphite-ink">
                Comma-separated article numbers from the catalogue. Unknown
                numbers are skipped.
              </p>
            </div>
          </div>
        </section>

        <SubmitButton label="Save flyer" />
      </form>

      <section className="mt-12 hairline bg-paper-raised px-4 py-4">
        <h2 className="label-caps mb-2">Set by your developer</h2>
        <p className="text-sm text-graphite-ink">
          Currency (AED), the 5% VAT note and the price disclaimers are fixed
          across the site so they can never disagree with each other. Email and
          WhatsApp connection details live in the environment, not here — they are
          credentials.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  numeric,
  help,
  className = "",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  numeric?: boolean;
  help?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label-caps block mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        inputMode={numeric ? "numeric" : undefined}
        className={`w-full hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-fairway ${
          numeric ? "tabular" : ""
        }`}
      />
      {help && <p className="mt-1 text-xs text-graphite-ink">{help}</p>}
    </div>
  );
}
