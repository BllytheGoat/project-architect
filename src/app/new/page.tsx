"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiPost, ApiClientError } from "@/lib/client/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (idea.trim().length < 8) {
      setError("Give the idea a little more detail so the interview has something to work with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await apiPost<{ id: string }>("/api/projects", {
        name: name.trim() || undefined,
        idea: idea.trim(),
      });
      router.push(`/projects/${id}/interview`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't start the project. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Back to dashboard
          </Link>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          What do you want to build?
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Describe your idea in your own words. Don't worry about technical
          details — the interview will fill those in.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="idea">Your idea</Label>
            <Textarea
              id="idea"
              rows={7}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder='I want an app where students can share notes and discuss them.'
              className="min-h-[140px] resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Example: “I want an app where students can share notes and discuss
              them.”
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projectName">Project name (optional)</Label>
            <input
              id="projectName"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="A short name for this project"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy} className="h-11">
              {busy ? "Starting…" : "Start planning"}
            </Button>
            <span className="text-sm text-muted-foreground">You can rename it later.</span>
          </div>
        </form>
      </main>
    </div>
  );
}
