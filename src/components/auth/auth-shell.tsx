import Link from "next/link";

// Centered auth frame on the drafting-paper ground.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-background px-5 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 35%, transparent 80%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2.5"
        >
          <span className="relative inline-block h-6 w-6">
            <span className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-primary" />
            <span className="absolute top-1/2 left-0 h-px w-6 -translate-y-1/2 bg-primary" />
            <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Project Architect
          </span>
        </Link>
        {children}
      </div>
    </div>
  );
}
