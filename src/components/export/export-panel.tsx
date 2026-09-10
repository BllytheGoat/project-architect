"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type Initial = {
  name: string;
  markdown: string;
  version: number;
};

export function ExportPanel({ projectId, initial }: { projectId: string; initial: Initial }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filename = `${slugify(initial.name || "project")}-PROJECT.md`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(initial.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setError(null);
    } catch {
      setError("Copy failed. You can select and copy the text manually.");
    }
  }

  function download() {
    const blob = new Blob([initial.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={`/projects/${projectId}/review`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Back to review
            </Link>
          </div>
          <span className="font-display text-sm font-semibold">{initial.name}</span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Your specification</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generated deterministically from your answers — version {initial.version}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copy} className={cn(copied && "text-primary")}>
              {copied ? "Copied ✓" : "Copy Markdown"}
            </Button>
            <Button onClick={download} className="h-10">
              Download PROJECT.md
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-mono">{filename}</Badge>
              </span>
              <span className="text-xs text-muted-foreground">
                {initial.markdown.length.toLocaleString()} characters
              </span>
            </div>
            <pre className="max-h-[70vh] overflow-auto p-4 text-[13px] leading-6 text-foreground/90">
              {initial.markdown}
            </pre>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/projects/${projectId}/review`} className={buttonVariants({ variant: "secondary", className: "h-11" })}>
            Back to review
          </Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "ghost", className: "h-11" })}>
            Go to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
}
