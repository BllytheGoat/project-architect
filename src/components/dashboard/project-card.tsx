"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiPost, apiPatch, ApiClientError } from "@/lib/client/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProjectCardData {
  id: string;
  name: string;
  description: string;
  status: string;
  readiness: number;
  updated: string;
}

function statusLabel(s: string) {
  switch (s) {
    case "complete":
      return { text: "Complete", tone: "bg-primary/10 text-primary" };
    case "in_progress":
      return { text: "In progress", tone: "bg-primary/10 text-primary" };
    case "draft":
      return { text: "Draft", tone: "bg-muted text-muted-foreground" };
    default:
      return { text: s, tone: "bg-muted text-muted-foreground" };
  }
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const router = useRouter();
  const tone = statusLabel(project.status);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setEditing(false);
    try {
      const input = document.getElementById(`rename-${project.id}`) as HTMLInputElement | null;
      const name = input?.value.trim();
      if (!name) return;
      await apiPatch(`/api/projects/${project.id}`, { name });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not rename the project.");
      setEditing(true);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setConfirming(false);
    try {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete the project.");
      setDeleting(false);
    }
  }

  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {editing ? (
              <form onSubmit={handleRename} className="flex items-center gap-2">
                <Input
                  id={`rename-${project.id}`}
                  defaultValue={project.name}
                  className="h-8 w-56 max-w-full"
                  autoFocus
                />
                <Button type="submit" size="sm" variant="ghost">
                  Save
                </Button>
              </form>
            ) : (
              <h3 className="truncate font-display text-base font-semibold tracking-tight">
                {project.name}
              </h3>
            )}
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {project.description || "No description yet."}
            </p>
          </div>
          <Badge variant="secondary" className={`shrink-0 ${tone.tone}`}>
            {tone.text}
          </Badge>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Readiness</span>
            <span className="tabular-nums">{Math.round(project.readiness)}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.min(100, Math.max(0, project.readiness))}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Updated {project.updated}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={editing}
            >
              Rename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
            <Link
              href={`/projects/${project.id}`}
              className={buttonVariants({ variant: "default", size: "sm", className: "ml-1" })}
            >
              Open
            </Link>
          </div>
        </div>
      </CardContent>

      {error && (
        <p className="border-t border-destructive/20 bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{project.name}”?</DialogTitle>
            <DialogDescription>
              This removes the project and everything collected in its interview.
              This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
