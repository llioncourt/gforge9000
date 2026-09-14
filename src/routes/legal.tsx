import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal & content policy — Universal Character Forge" },
      {
        name: "description",
        content:
          "Unofficial status, trademark notice and the content policy governing user-entered and imported material in Universal Character Forge.",
      },
      { property: "og:title", content: "Legal & content policy — Universal Character Forge" },
      {
        property: "og:description",
        content: "Unofficial status, trademark notice and content policy.",
      },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h1 className="mt-6 font-display text-3xl font-bold">Legal &amp; content policy</h1>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Unofficial and independent
            </h2>
            <p className="mt-2">
              Universal Character Forge is an independent, unofficial companion application. It is
              not published, licensed, endorsed or sponsored by Steve Jackson Games Incorporated.
              Nothing in this application should be read as an official product or as a statement
              made on behalf of Steve Jackson Games.
            </p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">Trademarks</h2>
            <p className="mt-2">
              GURPS is a trademark of Steve Jackson Games Incorporated. Any reference to GURPS
              Fourth Edition in this application is descriptive and informational only — it
              indicates that the tool&apos;s generic rules engine is intended to be usable
              alongside that ruleset. All trademarks remain the property of their respective
              owners.
            </p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">Content policy</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                No rulebook prose, trait descriptions, tables, artwork or logos from any publisher
                are bundled with this application.
              </li>
              <li>
                Standard stat labels such as ST, DX, IQ, HT, HP, Will, Per and FP are used as
                short interoperability identifiers, not as reproduced text.
              </li>
              <li>
                Calculation formulas in this tool are our own generic implementations and are
                configurable per campaign. They are approximations, not transcriptions of any
                published table.
              </li>
              <li>
                You are responsible for the content you enter. Do not paste copyrighted text you
                are not licensed to reproduce, and do not share it publicly through the library.
              </li>
            </ul>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Licensed content packs
            </h2>
            <p className="mt-2">
              The library is architected so that official or licensed source packs can be installed
              separately in the future, with their own permissions and provenance metadata, without
              changing the rules engine. No such pack is included today.
            </p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Import and export
            </h2>
            <p className="mt-2">
              JSON is the canonical portable format for your data. Adapters for other character
              tools are designed for but not yet implemented; this application does not claim
              compatibility with any third-party file format until such an adapter ships.
            </p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">Your data</h2>
            <p className="mt-2">
              Characters, campaigns and library entries are isolated per account and per campaign
              role. Game Masters can view characters submitted to their campaign; other players
              cannot read your private content.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
