"use client";

import { GitMerge, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { QueryState } from "@/components/studio/PageShell";
import { useStudioQuery } from "@/components/studio/useStudioQuery";
import { Button } from "@/components/ui/Button";
import {
  Badge,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useAsyncFlow } from "@/lib/fsm/useAsyncFlow";
import { listTags, mergeTags, saveTag, studioApi, type TagRow } from "@/lib/studio-api";

const KIND_TONE = { topic: "blue", series: "purple", format: "slate" } as const;

export function TagManager() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [editing, setEditing] = useState<TagRow | "new" | null>(null);

  const { data, loading, error, refresh } = useStudioQuery(
    () => listTags(search ? { search } : {}),
    [search],
  );
  const tags = data?.results ?? [];

  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input-field max-w-xs"
          placeholder="Search tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
          <Plus size={14} /> New tag
        </Button>
        {selected.size >= 2 && (
          <Button size="sm" onClick={() => setMerging(true)}>
            <GitMerge size={14} /> Merge {selected.size}
          </Button>
        )}
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-[var(--sl-muted)] underline"
          >
            Clear selection
          </button>
        )}
      </div>

      <QueryState
        loading={loading}
        error={error}
        isEmpty={tags.length === 0}
        empty={search ? `No tags match “${search}”.` : "No tags yet."}
      >
        <ul className="divide-y divide-[var(--sl-line)] rounded-xl border border-[var(--sl-line)] bg-[var(--sl-card)]">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                checked={selected.has(tag.slug)}
                onChange={() => toggle(tag.slug)}
                aria-label={`Select ${tag.name}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--sl-ink)]">
                  {tag.name}
                </span>
                <span className="block truncate font-mono text-xs text-[var(--sl-muted)]">
                  /tags/{tag.slug}
                </span>
              </span>
              <Badge tone={KIND_TONE[tag.kind] ?? "slate"}>{tag.kind}</Badge>
              <span
                className={cn(
                  "w-16 sm:w-20 shrink-0 text-right text-xs tabular-nums",
                  tag.usage_count === 0 ? "text-[var(--sl-muted)]" : "text-[var(--sl-ink)]",
                )}
              >
                {tag.usage_count} use{tag.usage_count === 1 ? "" : "s"}
              </span>
              <Button size="icon" variant="ghost" onClick={() => setEditing(tag)}>
                <Pencil size={13} />
              </Button>
            </li>
          ))}
        </ul>
      </QueryState>

      {merging && (
        <MergeDialog
          candidates={tags.filter((tag) => selected.has(tag.slug))}
          onClose={(changed) => {
            setMerging(false);
            if (changed) {
              setSelected(new Set());
              refresh();
            }
          }}
        />
      )}

      {editing && (
        <TagDialog
          tag={editing === "new" ? null : editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) refresh();
          }}
        />
      )}
    </div>
  );
}

function MergeDialog({
  candidates,
  onClose,
}: {
  candidates: TagRow[];
  onClose: (changed: boolean) => void;
}) {
  const [target, setTarget] = useState(
    [...candidates].sort((a, b) => b.usage_count - a.usage_count)[0]?.slug ?? "",
  );
  const flow = useAsyncFlow<{ moved: number; merged: number }>();

  const sources = candidates.filter((tag) => tag.slug !== target);
  const result = flow.result;

  const run = async () => {
    await flow.run(
      async () => {
        const outcome = await mergeTags(target, sources.map((tag) => tag.slug));
        return { moved: outcome.items_moved, merged: outcome.merged.length };
      },
      { action: "merge", fallbackError: "The merge failed. Nothing was changed." },
    );
  };

  return (
    <Dialog open onOpenChange={() => onClose(Boolean(result))}>
      <DialogContent data-state={flow.dataState}>
        <DialogHeader>
          <DialogTitle>{result ? "Merged" : "Merge tags"}</DialogTitle>
          <DialogDescription>
            {result
              ? `${result.merged} tag${result.merged === 1 ? "" : "s"} folded in, ${result.moved} article${result.moved === 1 ? "" : "s"} re-tagged.`
              : "Pick the tag to keep. The others are deleted and everything they were on moves onto it."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {result ? null : (
            <>
              <fieldset className="space-y-1">
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
                  Keep
                </legend>
                {candidates.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-[var(--sl-soft)]"
                  >
                    <input
                      type="radio"
                      name="merge-target"
                      checked={target === tag.slug}
                      onChange={() => setTarget(tag.slug)}
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    <span className="text-xs text-[var(--sl-muted)]">{tag.usage_count} uses</span>
                  </label>
                ))}
              </fieldset>

              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {sources.length === 0
                  ? "Select a different tag to keep."
                  : `${sources.map((t) => `“${t.name}”`).join(", ")} will be deleted. This cannot be undone.`}
              </p>
            </>
          )}
          {flow.error && <p className="mt-3 text-sm text-red-600" role="alert">{flow.error}</p>}
        </DialogBody>

        <DialogFooter>
          {result ? (
            <Button onClick={() => onClose(true)}>Close</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onClose(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={run}
                disabled={flow.isRunning || sources.length === 0}
              >
                {flow.isRunning && <Loader2 size={14} className="animate-spin" />}
                Merge into “{candidates.find((t) => t.slug === target)?.name}”
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagDialog({
  tag,
  onClose,
}: {
  tag: TagRow | null;
  onClose: (changed: boolean) => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [kind, setKind] = useState<TagRow["kind"]>(tag?.kind ?? "topic");
  const [description, setDescription] = useState(tag?.description ?? "");
  const flow = useAsyncFlow<void>();

  const submit = async () => {
    const ok = await flow.run(
      async () => {
        await saveTag(tag?.slug ?? null, { name, kind, description });
      },
      { action: "save", fallbackError: "Could not save this tag." },
    );
    if (ok !== null) onClose(true);
  };

  const remove = async () => {
    if (!tag) return;
    const ok = await flow.run(
      async () => {
        await studioApi().delete(`/tags/${encodeURIComponent(tag.slug)}/`);
      },
      { action: "delete", fallbackError: "Could not delete this tag." },
    );
    if (ok !== null) onClose(true);
  };

  return (
    <Dialog open onOpenChange={() => onClose(false)}>
      <DialogContent data-state={flow.dataState}>
        <DialogHeader>
          <DialogTitle>{tag ? "Edit tag" : "New tag"}</DialogTitle>
          {tag && (
            <DialogDescription>
              Renaming changes how it reads, not its URL. Editing the slug is
              what breaks <code>/tags/{tag.slug}</code>.
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogBody className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--sl-muted)]">Name</span>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--sl-muted)]">Kind</span>
            <select
              className="input-field"
              value={kind}
              onChange={(e) => setKind(e.target.value as TagRow["kind"])}
            >
              <option value="topic">Topic</option>
              <option value="series">Series</option>
              <option value="format">Format</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--sl-muted)]">
              Description
            </span>
            <textarea
              className="input-field h-20 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {flow.error && <p className="text-sm text-red-600" role="alert">{flow.error}</p>}
        </DialogBody>

        <DialogFooter>
          {tag && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600"
              onClick={remove}
              disabled={flow.isRunning}
            >
              <Trash2 size={14} /> Delete
            </Button>
          )}
          <Button variant="secondary" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={flow.isRunning || !name.trim()}>
            {flow.isRunning && <Loader2 size={14} className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
