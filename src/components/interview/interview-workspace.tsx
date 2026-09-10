"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiPost, ApiClientError } from "@/lib/client/api";
import type {
  ProjectState,
  Question,
  Recommendation,
} from "@/types";
import type { ReadinessResult } from "@/lib/readiness/readiness";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Mirror of the server's readiness result (subset the UI renders).
type Readiness = Pick<ReadinessResult, "percent" | "criticalMissing" | "optionalRemaining" | "canComplete">;

type Initial = { name: string; description: string };

type QState =
  | { kind: "idle" }
  | { kind: "analyzing" }
  | { kind: "question"; question: Question }
  | { kind: "recommendation"; question: Question; recommendation: Recommendation }
  | { kind: "complete" };

export function InterviewWorkspace({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [state, setState] = useState<ProjectState | null>(null);
  const [question, setQuestion] = useState<QState>({ kind: "idle" });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const multi =
    question.kind === "question" ? question.question.type === "multi_choice" : false;

  // Load the current state + next question once.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      setQuestion({ kind: "analyzing" });
      try {
        const [proj, next] = await Promise.all([
          api<{ state: ProjectState }>(`/api/projects/${projectId}`),
          api<{ nextQuestion: Question | null; readiness: Readiness }>(`/api/projects/${projectId}/interview/next`),
        ]);
        setState(proj.state);
        setReadiness(next.readiness);
        if (next.nextQuestion) setQuestion({ kind: "question", question: next.nextQuestion });
        else if (next.readiness.canComplete) setQuestion({ kind: "complete" });
        else setQuestion({ kind: "complete" });
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : "Couldn't load this project.");
        setQuestion({ kind: "idle" });
      }
    })();
  }, [projectId]);

  const resetInputs = () => {
    setAnswerText("");
    setSelected([]);
  };

  const submitAnswer = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setSaved("saving");
      setError(null);
      try {
        const res = await apiPost<{
          nextQuestion: Question | null;
          readiness: Readiness;
          canComplete: boolean;
          recommendation: Recommendation | null;
        }>(`/api/projects/${projectId}/interview/answer`, payload);
        setState((prev) => prev); // state is authoritative server-side; refetch on next question
        setReadiness(res.readiness);
        if (res.recommendation) {
          setQuestion({ kind: "recommendation", question: currentQuestion(), recommendation: res.recommendation });
        } else if (res.nextQuestion) {
          setQuestion({ kind: "question", question: res.nextQuestion });
        } else {
          setQuestion({ kind: "complete" });
        }
        resetInputs();
        setSaved("saved");
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : "Your answer was saved, but something went wrong. Try again.");
        setSaved("idle");
      } finally {
        setBusy(false);
      }
    },
    [projectId],
  );

  // Grab the currently displayed question's key for the payload.
  function currentQuestion(): Question {
    if (question.kind === "question") return question.question;
    if (question.kind === "recommendation") return question.question;
    throw new Error("No active question.");
  }

  function submitSelection(selected: string[]) {
    const q = currentQuestion();
    void submitAnswer({ questionKey: q.questionKey, selected });
  }

  function submitFreeText() {
    const q = currentQuestion();
    void submitAnswer({ questionKey: q.questionKey, freeText: answerText.trim() });
  }

  function pickUnsure() {
    const q = currentQuestion();
    void submitAnswer({ questionKey: q.questionKey, unsure: true });
  }

  function useRecommendation() {
    if (question.kind !== "recommendation") return;
    const q = question.question;
    const rec = question.recommendation;
    void submitAnswer({ questionKey: q.questionKey, freeText: rec.recommendation });
  }

  async function finish() {
    // Refresh server state so the review screen has the latest, then navigate.
    try {
      const proj = await api<{ state: ProjectState }>(`/api/projects/${projectId}`);
      setState(proj.state);
    } catch {
      /* best effort */
    }
    router.push(`/projects/${projectId}/review`);
    router.refresh();
  }

  const title = state?.project.name || initial.name;

  return (
    <div className="min-h-full bg-background">
      <WorkspaceBar
        name={title}
        saved={saved}
        readiness={readiness?.percent ?? 0}
      />
      <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_300px]">
        {/* interview column */}
        <div className="min-w-0">
          {question.kind === "analyzing" && <LoadingQuestion />}
          {question.kind === "idle" && (
            <Alert variant="destructive">
              <AlertTitle>Couldn't load the interview</AlertTitle>
              <AlertDescription>{error ?? "Please try again."}</AlertDescription>
            </Alert>
          )}

          {(question.kind === "question" || question.kind === "recommendation") && (
            <QuestionCard
              question={question.question}
              selected={selected}
              answerText={answerText}
              multi={multi}
              busy={busy}
              onToggle={toggleOption}
              onText={(v) => setAnswerText(v)}
              onPick={() =>
                (question.question.type === "free_text" || question.question.type === "number")
                  ? submitFreeText()
                  : submitSelection(selected)
              }
              onUnsure={pickUnsure}
              recommendation={question.kind === "recommendation" ? question.recommendation : undefined}
              onUseRecommendation={useRecommendation}
              onDiscuss={() => {
                // "Discuss" = give a free-text answer instead of the default.
                setQuestion((prev) => (prev.kind === "recommendation" ? { kind: "question", question: prev.question } : prev));
              }}
            />
          )}

          {question.kind === "complete" && (
            <CompleteCard
              criticalMissing={readiness?.criticalMissing ?? []}
              optionalRemaining={readiness?.optionalRemaining ?? []}
              canComplete={readiness?.canComplete ?? true}
              onFinish={finish}
              onReview={() => router.push(`/projects/${projectId}/review`)}
            />
          )}
        </div>

        {/* sidebar */}
        <aside className="space-y-4">
          <StatePanel state={state} readiness={readiness} />
        </aside>
      </main>
    </div>
  );

  function toggleOption(id: string) {
    setSelected((prev: string[]) => {
      if (multi) {
        return prev.includes(id) ? prev.filter((x: string) => x !== id) : [...prev, id];
      }
      return [id];
    });
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WorkspaceBar({
  name,
  saved,
  readiness,
}: {
  name: string;
  saved: "idle" | "saving" | "saved";
  readiness: number;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-display text-sm font-semibold">{name}</span>
        </div>
        <div className="flex items-center gap-4">
          <SaveBadge state={saved} />
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-xs text-muted-foreground">Readiness</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${readiness}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{Math.round(readiness)}%</span>
          </div>
          <Link
            href="/projects"
            className={buttonVariants({ variant: "outline", size: "sm", className: "ml-1" })}
          >
            Review
          </Link>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "saving")
    return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Saved
      </span>
    );
  return null;
}

function LoadingQuestion() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-6 space-y-2">
          <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Reading your project…</p>
      </CardContent>
    </Card>
  );
}

const PRIORITY_TONE: Record<Question["priority"], string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-primary/10 text-primary",
  medium: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

function QuestionCard({
  question,
  selected,
  answerText,
  multi,
  busy,
  onToggle,
  onText,
  onPick,
  onUnsure,
  recommendation,
  onUseRecommendation,
  onDiscuss,
}: {
  question: Question;
  selected: string[];
  answerText: string;
  multi: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onText: (v: string) => void;
  onPick: () => void;
  onUnsure: () => void;
  recommendation?: Recommendation;
  onUseRecommendation: () => void;
  onDiscuss: () => void;
}) {
  const isFree = question.type === "free_text" || question.type === "number";
  const isYesNo = question.type === "yes_no";
  const options = question.options ?? (isYesNo ? [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }] : []);
  const canPick = isFree ? answerText.trim().length > 0 : selected.length > 0;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={PRIORITY_TONE[question.priority]}>
            {question.priority}
          </Badge>
          <span className="text-xs text-muted-foreground">{question.category}</span>
        </div>

        {recommendation && (
          <Alert className="my-4 border-primary/30 bg-primary/5 text-foreground">
            <AlertTitle>You answered “I’m not sure” — here’s a safe default</AlertTitle>
            <AlertDescription className="mt-1 text-sm leading-6">
              <span className="font-medium text-foreground">{recommendation.recommendation}</span>
              {recommendation.reason && (
                <span className="mt-1 block text-muted-foreground">
                  {recommendation.reason}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <h2 className="font-display text-lg font-semibold leading-snug tracking-tight">
          {question.question}
        </h2>
        {question.reason && <p className="mt-2 text-sm text-muted-foreground">{question.reason}</p>}

        {!isFree && options.length > 0 && (
          <div className="mt-5 space-y-2">
            {options.map((opt) => {
              const active = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggle(opt.id)}
                  disabled={busy}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center border",
                      multi ? "rounded" : "rounded-full",
                      active ? "border-primary" : "border-input",
                    )}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        {isFree && (
          <div className="mt-5">
            <Textarea
              value={answerText}
              onChange={(e) => onText(e.target.value)}
              rows={3}
              placeholder="Describe it in your own words…"
              className="min-h-[90px] resize-y"
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!recommendation ? (
            <Button onClick={onPick} disabled={!canPick || busy}>
              {busy ? "Saving…" : "Continue"}
            </Button>
          ) : (
            <>
              <Button onClick={onUseRecommendation} disabled={busy}>
                Use recommendation
              </Button>
              <Button variant="outline" onClick={onDiscuss} disabled={busy}>
                Ask me something else
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={onUnsure}
            disabled={busy || !isFree}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-40"
          >
            I’m not sure
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function CompleteCard({
  criticalMissing,
  optionalRemaining,
  canComplete,
  onFinish,
  onReview,
}: {
  criticalMissing: string[];
  optionalRemaining: string[];
  canComplete: boolean;
  onFinish: () => void;
  onReview: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            ✓
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {canComplete ? "Your plan is ready to review" : "Mostly there"}
          </h2>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          {canComplete
            ? "All the essential decisions are captured. Review the specification, then export it."
            : "You've resolved the essentials. A few optional details are left — you can finish now and fill them in later."}
        </p>

        {criticalMissing.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-muted-foreground">Still to decide</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {criticalMissing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {canComplete && optionalRemaining.length > 0 && (
          <div className="mt-5 rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-muted-foreground">Optional details you can skip</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {optionalRemaining.slice(0, 4).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onFinish} className="h-10">
            Finish and review
          </Button>
          <Button variant="outline" onClick={onReview} className="h-10">
            Go to review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatePanel({
  state,
  readiness,
}: {
  state: ProjectState | null;
  readiness: Readiness | null;
}) {
  const confirmedFeatures = state?.features.filter((f) => f.status === "confirmed") ?? [];
  const decisions = state?.decisions ?? [];

  const progress = useMemo(() => {
    if (!readiness) return null;
    return {
      percent: readiness.percent,
      missing: readiness.criticalMissing,
      optional: readiness.optionalRemaining,
    };
  }, [readiness]);

  if (!state) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-2 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* readiness */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Readiness</span>
            <span className="font-display text-lg font-bold tabular-nums">
              {progress?.percent ?? 0}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>

          {progress && progress.missing.length > 0 && (
            <>
              <p className="mt-4 text-xs font-medium text-muted-foreground">
                Key things still needed
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {progress.missing.slice(0, 4).map((m) => (
                  <li key={m} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="text-muted-foreground">{m}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* what we know */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-medium">Collected so far</h3>
          <Separator className="my-3" />
          {state.project.problem && (
            <Field label="Problem" value={state.project.problem} />
          )}
          {state.project.targetUsers.length > 0 && (
            <Field label="For" value={state.project.targetUsers.join(", ")} />
          )}
          {confirmedFeatures.length > 0 && (
            <Field label="Core features" value={confirmedFeatures.map((f) => f.name).join(", ")} />
          )}
          {state.architecture.database && (
            <Field label="Storage" value={state.architecture.database} />
          )}
          {decisions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {decisions.length} decision{decisions.length === 1 ? "" : "s"} recorded
              </p>
            </div>
          )}
          {!(state.project.problem ||
            state.project.targetUsers.length ||
            confirmedFeatures.length ||
            state.architecture.database ||
            decisions.length) && (
            <p className="text-sm text-muted-foreground">
              Answers will show up here as you go.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm leading-6">{value}</p>
    </div>
  );
}
