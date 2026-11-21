"use client";

import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { useEffect, useReducer } from "react";

import { StatusBadge } from "@/components/studio/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";
import { extractErrorMessage } from "@/lib/fsm";
import {
  bulkDrawerReducer,
  type BulkActionId,
  type BulkDrawerState,
} from "@/lib/fsm/editorial";
import { bulkDelete, bulkTransition, type StudioArticleRow } from "@/lib/studio-api";

const ACTIONS: ReadonlyArray<{
  name: BulkActionId;
  label: string;
  destructive: boolean;
}> = [
  { name: "publish", label: "Make public", destructive: false },
  { name: "submit", label: "Submit for review", destructive: false },
  { name: "approve", label: "Approve", destructive: false },
  { name: "unpublish", label: "Move to draft", destructive: true },
  { name: "archive", label: "Hide", destructive: true },
  { name: "delete", label: "Delete permanently", destructive: true },
];

const INITIAL: BulkDrawerState = { kind: "closed" };

export function BulkActionDrawer({
  open,
  onOpenChange,
  selected,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: StudioArticleRow[];
  onCompleted: () => void;
}) {
  const [state, dispatch] = useReducer(bulkDrawerReducer, INITIAL);

  useEffect(() => {
    if (open && state.kind === "closed") {
      dispatch({ type: "OPEN", action: "publish" });
    } else if (!open && state.kind !== "closed") {
      dispatch({ type: "CLOSE" });
    }
  }, [open, state.kind]);

  const activeAction: BulkActionId =
    state.kind === "closed" ? "publish" : state.action;
  const chosen = ACTIONS.find((a) => a.name === activeAction);
  const isDelete = activeAction === "delete";
  const ackDelete = state.kind === "confirm" ? state.ackDelete : false;
  const titleBySlug = new Map(selected.map((a) => [a.slug, a.title]));

  const run = async () => {
    if (state.kind !== "confirm" && state.kind !== "error") return;
    dispatch({ type: "SUBMIT" });
    try {
      const slugs = selected.map((a) => a.slug);
      const outcome =
        state.action === "delete"
          ? await bulkDelete(slugs)
          : await bulkTransition(slugs, state.action);
      dispatch({ type: "SUCCEED", result: outcome });
      onCompleted();
    } catch (err) {
      const { message } = extractErrorMessage(
        err,
        "The request failed. Nothing was changed.",
      );
      dispatch({ type: "FAIL", message });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dispatch({ type: "CLOSE" });
        onOpenChange(next);
      }}
    >
      <DialogContent side="right" aria-describedby="bulk-desc" data-state={state.kind}>
        <DialogHeader>
          <DialogTitle>
            {state.kind === "done"
              ? "Results"
              : `${chosen?.label ?? "Action"} articles`}
          </DialogTitle>
          <DialogDescription id="bulk-desc">
            {state.kind === "done"
              ? `${state.result.succeeded} succeeded, ${state.result.failed} failed.`
              : `${selected.length} article${selected.length === 1 ? "" : "s"} selected.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {state.kind !== "done" && (
            <>
              <fieldset className="mb-5" disabled={state.kind === "running"}>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
                  Action
                </legend>
                <div className="space-y-1">
                  {ACTIONS.map((option) => (
                    <label
                      key={option.name}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-[var(--sl-soft)]"
                    >
                      <input
                        type="radio"
                        name="bulk-action"
                        value={option.name}
                        checked={activeAction === option.name}
                        onChange={() =>
                          dispatch({ type: "OPEN", action: option.name })
                        }
                      />
                      <span
                        className={
                          option.destructive
                            ? "text-red-600 dark:text-red-400"
                            : "text-[var(--sl-ink)]"
                        }
                      >
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {isDelete ? (
                <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  Permanently removes these articles, their revisions, and public
                  URLs. This cannot be undone. Use Hide if you only want them
                  off the site.
                </p>
              ) : (
                chosen?.destructive && (
                  <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    This takes content off the public site. Articles that are
                    already in another state are skipped rather than forced.
                  </p>
                )
              )}

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
                Will be attempted
              </p>
              <ul className="divide-y divide-[var(--sl-line)] rounded-lg border border-[var(--sl-line)]">
                {selected.map((article) => (
                  <li
                    key={article.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="truncate text-[var(--sl-ink)]">
                      {article.title || "Untitled"}
                    </span>
                    <StatusBadge status={article.status} />
                  </li>
                ))}
              </ul>

              {isDelete && state.kind === "confirm" && (
                <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-[var(--sl-ink)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-[var(--sl-line)]"
                    checked={ackDelete}
                    onChange={(event) =>
                      dispatch({
                        type: "SET_ACK_DELETE",
                        ackDelete: event.target.checked,
                      })
                    }
                  />
                  I understand these articles will be deleted completely and
                  cannot be recovered.
                </label>
              )}
            </>
          )}

          {state.kind === "done" && (
            <ul className="divide-y divide-[var(--sl-line)] rounded-lg border border-[var(--sl-line)]">
              {state.result.results.map((row) => (
                <li
                  key={row.slug}
                  className="flex items-start gap-2.5 px-3 py-2.5 text-sm"
                >
                  {row.ok ? (
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <X size={15} className="mt-0.5 shrink-0 text-red-500" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[var(--sl-ink)]">
                      {titleBySlug.get(row.slug) || row.slug}
                    </span>
                    {row.ok && isDelete && (
                      <span className="block text-xs text-[var(--sl-muted)]">
                        Deleted
                      </span>
                    )}
                    {!row.ok && (
                      <span className="block text-xs text-red-600 dark:text-red-400">
                        {row.detail}
                      </span>
                    )}
                  </span>
                  {row.ok && row.status && <StatusBadge status={row.status} />}
                </li>
              ))}
            </ul>
          )}

          {state.kind === "error" && (
            <p
              className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {state.message}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          {state.kind === "done" ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant={chosen?.destructive ? "destructive" : "default"}
                disabled={
                  state.kind === "running" ||
                  selected.length === 0 ||
                  (isDelete && !ackDelete)
                }
                onClick={run}
              >
                {state.kind === "running" && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                {chosen?.label} {selected.length}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
