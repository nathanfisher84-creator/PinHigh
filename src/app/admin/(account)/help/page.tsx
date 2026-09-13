import Link from "next/link";

export const metadata = { title: "Help" };

/**
 * The owner's manual, kept where the owner is. Written for the person who
 * runs the business, not the person who built the site: every answer says
 * what to click, and the last section is honest about what still needs a
 * developer.
 */
export default function HelpPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl">Help</h1>
      <p className="mt-2 text-sm text-graphite-ink">
        How to run the site day to day, and what to do when something goes
        wrong. Bookmark this page.
      </p>

      <nav aria-label="On this page" className="mt-6 hairline bg-paper-raised px-4 py-3 text-sm">
        <ul className="grid gap-1 sm:grid-cols-2">
          {[
            ["#signin", "Signing in and your authenticator"],
            ["#lost", "Lost phone or forgotten password"],
            ["#people", "Adding and removing people"],
            ["#email", "Email: sending and who gets notified"],
            ["#quotes", "Working a quote request"],
            ["#stock", "Monthly stock upload"],
            ["#site", "Editing the public site"],
            ["#status", "The status card, line by line"],
            ["#developer", "When you need a developer"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="underline underline-offset-2 hover:text-fairway">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 space-y-10 text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-medium [&_h3]:mt-4 [&_h3]:font-medium [&_p]:mt-2 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        <section id="signin">
          <h2>Signing in and your authenticator</h2>
          <p>
            Every person has their own email, password and an authenticator app
            on their phone. Signing in is two steps: password, then the
            six-digit code the app shows. The code changes every 30 seconds;
            always use the newest one.
          </p>
          <p>
            You stay signed in for 12 hours, then sign in again. Change your
            password or replace the authenticator (new phone) under{" "}
            <Link href="/admin/security" className="underline underline-offset-2">Security</Link>.
          </p>
        </section>

        <section id="lost">
          <h2>Lost phone or forgotten password</h2>
          <h3>Lost or replaced your phone</h3>
          <ol>
            <li>At the code step, enter one of the <strong>recovery codes</strong> you saved when you set the app up. Each works once.</li>
            <li>You land on Security. Choose “New phone? Replace the authenticator” and scan the code with the new phone.</li>
            <li>No recovery codes either? Ask another owner: under Users they can choose “Reset authenticator” for you, and you set it up again at your next sign-in.</li>
          </ol>
          <h3>Forgotten your password</h3>
          <ol>
            <li>On the sign-in page choose “Forgotten your password?” and enter your email. A link arrives; it works once and lasts an hour.</li>
            <li>If the site can’t send email yet, an owner can issue you a reset link from Users and send it to you on WhatsApp.</li>
          </ol>
          <h3>The only owner has lost everything</h3>
          <p>
            This is the one situation that needs a developer, and the reason
            the status card asks for a second owner. See the last section.
          </p>
        </section>

        <section id="people">
          <h2>Adding and removing people</h2>
          <p>
            Owners manage this under <Link href="/admin/users" className="underline underline-offset-2">Users</Link>.
            Staff can do everything except manage accounts.
          </p>
          <ul>
            <li><strong>Add someone:</strong> enter their email and choose a role. They get a link to choose a password, then set up their authenticator. The link lasts seven days.</li>
            <li><strong>Someone leaves:</strong> “Remove access”. Their sign-in stops working immediately. You can restore it later.</li>
            <li><strong>Two owners, always.</strong> If the only owner loses their phone and codes, nobody can manage accounts. Make a trusted second person an owner.</li>
          </ul>
        </section>

        <section id="email">
          <h2>Email: sending and who gets notified</h2>
          <p>
            Email is how quote requests reach you. Two separate things:
          </p>
          <h3>The account the site sends <em>from</em></h3>
          <ol>
            <li>Use a Gmail account for the business (a dedicated one is best).</li>
            <li>In that Google Account: Security → 2-Step Verification → App passwords → create one for “Mail”. Google shows a 16-character code.</li>
            <li>Under <Link href="/admin/settings" className="underline underline-offset-2">Settings → Email sending</Link>, enter the Gmail address and that code. It is stored encrypted and never shown again.</li>
            <li>Use “Send a test email” to yourself. If it arrives, you are done.</li>
          </ol>
          <h3>The people who <em>receive</em> quote requests</h3>
          <p>
            Under <Link href="/admin/recipients" className="underline underline-offset-2">Recipients</Link>, add every address that should get a copy. Buyers never see these.
          </p>
          <p>
            If the dashboard says a notification failed, open the request and use “Resend notifications” once sending is fixed.
          </p>
        </section>

        <section id="quotes">
          <h2>Working a quote request</h2>
          <p>
            A request is not an order and nothing is charged. Under{" "}
            <Link href="/admin/quotes" className="underline underline-offset-2">Quote requests</Link> each one shows the lines, sizes, any logo files, and the buyer’s details.
          </p>
          <ul>
            <li><strong>New → In progress → Quoted:</strong> move it along as you work. Anything sitting in New for more than a day is flagged on the dashboard.</li>
            <li><strong>Approved / Won:</strong> takes the units off stock and records it. Moving it back off Approved puts them back.</li>
            <li><strong>Lost / Cancelled / Expired:</strong> never touches stock.</li>
            <li><strong>Download Excel</strong> gives the lines with retail RRP in AED — never wholesale or cost.</li>
            <li>You can edit lines and quantities after a request lands, until stock has been taken.</li>
          </ul>
        </section>

        <section id="stock">
          <h2>Monthly stock upload</h2>
          <ol>
            <li>Under <Link href="/admin/stock" className="underline underline-offset-2">Stock</Link>, upload the adidas implementation file and the invoice, as described on that page.</li>
            <li>Check the preview: new styles, changed quantities, anything the site could not match. Confirm.</li>
            <li>If something looks wrong afterwards, Stock → History lets you roll an upload back.</li>
          </ol>
          <p>
            Quantities on the public size grid come from the last upload plus
            anything approved since. The dashboard shows when the last upload was.
          </p>
        </section>

        <section id="site">
          <h2>Editing the public site</h2>
          <ul>
            <li><strong>Home page:</strong> Settings → Front flyer (headline, text, button), Hero background (your own photos, optional slideshow), and the new-product carousel.</li>
            <li><strong>Announcement banner:</strong> Settings. Leave it empty to hide it.</li>
            <li><strong>Contact details:</strong> Settings → Contact details. Empty fields are simply not shown.</li>
            <li><strong>Products and photos:</strong> <Link href="/admin/products" className="underline underline-offset-2">Products</Link>. Hide a style from buyers without deleting it.</li>
            <li><strong>Response time promised to buyers:</strong> Settings → Quoting. Shown on the confirmation screen and in the buyer’s email.</li>
          </ul>
        </section>

        <section id="status">
          <h2>The status card, line by line</h2>
          <p>
            On the dashboard. Green is fine, amber is worth knowing, red means
            something is not working. Each line says who can fix it.
          </p>
          <ul>
            <li><strong>Database</strong> — red means nothing written is being kept. Developer.</li>
            <li><strong>Email sending</strong> — red means nobody is emailed. You fix it under Settings (see above).</li>
            <li><strong>Who gets quote requests</strong> — red means no recipients. You fix it under Recipients.</li>
            <li><strong>Photos and artwork</strong> — red means uploads vanish on restart. Developer.</li>
            <li><strong>Sign-in security</strong> — red means everyone is signed out on each redeploy and authenticators can’t be saved. Developer, one setting.</li>
            <li><strong>Admin accounts</strong> — amber for accounts without an authenticator yet, or only one owner. You fix it under Users.</li>
            <li><strong>Form abuse limits</strong> and <strong>Bot check</strong> — amber is acceptable; both are optional extras a developer can add.</li>
          </ul>
        </section>

        <section id="developer">
          <h2>When you need a developer</h2>
          <p>Everything above is yours. These are not:</p>
          <ul>
            <li><strong>Anything the status card marks “Needs your developer”.</strong> These are settings in the hosting environment (Vercel), not in this panel.</li>
            <li><strong>Connecting the real domain</strong> (pinhighuae.com) to this site.</li>
            <li><strong>The only owner is locked out</strong> with no phone and no recovery codes. A developer can clear the authenticator on the database directly; the procedure is in the project’s handover document.</li>
            <li><strong>New features</strong>, new brands’ file formats, or changing how prices are shown.</li>
          </ul>
          <p>
            Your accounts, in case you ever change developer: the site runs on
            Vercel, the database and file storage are Supabase, the code is on
            GitHub, and email sends through your Gmail. All four should be
            registered to the business, not to a developer.
          </p>
        </section>
      </div>
    </div>
  );
}
