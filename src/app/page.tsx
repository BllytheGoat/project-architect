import Link from "next/link";

// Landing page. The most characteristic thing in this product's world is the
// interview itself — so the hero shows that loop (idea -> structured spec),
// not a stock hero. Cool drafting-paper ground + engineering-blue accent.
export default function Home() {
  return (
    <div className="relative min-h-full overflow-hidden bg-background">
      {/* blueprint grid — the drafting-paper identity */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 78%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-5 sm:px-8">
        {/* top bar */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span className="font-display text-lg font-semibold tracking-tight">Project Architect</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </a>
            <Link
              href="/login"
              className="text-foreground transition-colors hover:text-primary"
            >
              Sign in
            </Link>
          </nav>
        </header>

        {/* hero */}
        <section className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              The planning layer between you and a coding agent
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl">
              Have an idea, but not the words for it?
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Project Architect interviews you, fills in the gaps, and turns a
              rough app idea into a build-ready <span className="font-medium text-foreground">PROJECT.md</span>{" "}
              you can hand to a human developer or an AI coding agent.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Start building
              </Link>
              <a
                href="#how"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-6 text-sm font-medium transition-colors hover:bg-muted"
              >
                See how it works
              </a>
            </div>
          </div>

          {/* the interview card — the product's signature moment */}
          <InterviewMock />
        </section>

        {/* how it works — a genuine sequence, so numbered markers are earned */}
        <section id="how" className="border-t border-border py-16 sm:py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            From vague idea to clear specification
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <Step n="01" title="Describe the idea">
              Write it the way you would to a friend. No technical vocabulary
              required — the system does the translating.
            </Step>
            <Step n="02" title="Answer focused questions">
              One question at a time, prioritized by what actually matters.
              Stuck? The tool explains the tradeoff and offers a safe default.
            </Step>
            <Step n="03" title="Export the spec">
              Get a structured PROJECT.md that lists requirements, decisions,
              assumptions and an implementation guide — ready for a coding agent.
            </Step>
          </div>
        </section>

        {/* honest promise — the product principle from the brief */}
        <section className="py-16 sm:py-20">
          <blockquote className="mx-auto max-w-2xl text-center">
            <p className="font-display text-2xl font-semibold leading-snug tracking-tight text-balance">
              A structured planning process that helps you discover the
              requirements, decisions and details your project needs before you
              hand it to a coding agent.
            </p>
          </blockquote>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-border py-10 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span>Project Architect</span>
          </div>
          <span>Built to make your specification useful, not just pretty.</span>
        </footer>
      </div>
    </div>
  );
}

function Mark() {
  // A drafting crosshair — the product's mark.
  return (
    <span className="relative inline-block h-6 w-6">
      <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-primary" />
      <span className="absolute top-1/2 left-0 h-px w-6 -translate-y-1/2 bg-primary" />
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary" />
    </span>
  );
}

function InterviewMock() {
  return (
    <div className="rounded-xl border border-border bg-card p-1 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="rounded-lg bg-background/60 p-5 sm:p-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium">Planning session</span>
          <span className="tabular-nums">Readiness 78%</span>
        </div>
        <div className="mt-4">
          <p className="text-sm leading-7 text-foreground">
            I noticed notes need to be tied to people who own them. Should users
            have accounts?
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Option label="Yes — each note belongs to a user" active />
            <Option label="No — notes are shared, not owned" />
            <Option label="I'm not sure" />
          </div>
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[78%] rounded-full bg-primary" />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Saved</span>
              <span>3 critical gaps left</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Option({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors " +
        (active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-card text-foreground/80")
      }
    >
      <span
        className={
          "flex h-4 w-4 items-center justify-center rounded-full border " +
          (active ? "border-primary" : "border-input")
        }
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      {label}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-xs tracking-widest text-primary">{n}</div>
      <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{children}</p>
    </div>
  );
}
