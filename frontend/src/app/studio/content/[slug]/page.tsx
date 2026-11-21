"use client";

import type { OutputData } from "@editorjs/editorjs";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  History,
  ListTree,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { ArticleDeliveries } from "@/components/studio/ArticleDeliveries";
import { SeoPanel } from "@/components/studio/SeoPanel";
import { SocialComposer } from "@/components/studio/SocialComposer";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { TagInput } from "@/components/studio/TagInput";
import { VisibilityControl } from "@/components/studio/VisibilityControl";
import { useAutosave } from "@/components/studio/useAutosave";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/primitives";
import { editorLifecycleReducer } from "@/lib/fsm/editorial";
import { normalizeSlug } from "@/lib/slug";
import {
  getArticle,
  listRevisions,
  restoreRevision,
  runTransition,
  type AvailableTransition,
  type RevisionRow,
  type StudioArticle,
} from "@/lib/studio-api";

const Editor = dynamic(() => import("@/components/editor/Editor"), { ssr: false });

type MobilePanel = "none" | "outline" | "inspector";

/**
 * Three-pane article editor: outline, canvas, right rail.
 *
 * Uses an explicit lifecycle FSM (`loading | error | ready` with nested
 * `mutation` sub-states) and renders accessible drawers for the outline (<xl)
 * and inspector rail (<lg) on mobile and tablet viewports.
 */
export default function StudioArticleEditor() {
  const params = useParams();
  const slug = normalizeSlug(String(params.slug ?? ""));

  const [lifecycle, dispatch] = useReducer(editorLifecycleReducer, { kind: "loading" });
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<OutputData | undefined>(undefined);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("none");

  const loadedArticle = lifecycle.kind === "ready" ? lifecycle.article : null;
  const { state, queue, saveNow, keepMine, markVersion } = useAutosave(
    slug,
    loadedArticle?.content_hash ?? null,
  );

  const loadArticle = useCallback(() => {
    let cancelled = false;
    setBlocks(undefined);
    dispatch({ type: "LOAD_START" });
    getArticle(slug)
      .then((loaded) => {
        if (cancelled) return;
        dispatch({ type: "LOAD_SUCCESS", article: loaded });
        setTitle(loaded.title);
        setExcerpt(loaded.excerpt);
        setTags((loaded.tags ?? []).map((tag) => tag.name));
        setBlocks((loaded.content as OutputData) ?? { blocks: [] });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: "LOAD_ERROR", message: "Could not load this article." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        loadArticle();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadArticle]);

  const refreshRevisions = useCallback(() => {
    listRevisions(slug)
      .then(setRevisions)
      .catch(() => setRevisions([]));
  }, [slug]);

  useEffect(refreshRevisions, [refreshRevisions]);

  const onEditorChange = useCallback(
    (data: OutputData) => {
      setBlocks(data);
      queue({ content: { blocks: data.blocks } as StudioArticle["content"] });
    },
    [queue],
  );

  const outline = useMemo(() => {
    const list = (blocks?.blocks ?? []) as Array<{
      type: string;
      data?: { text?: string; level?: number };
    }>;
    return list
      .filter((block) => block.type === "header")
      .map((block) => ({
        text: (block.data?.text ?? "").replace(/<[^>]+>/g, ""),
        level: block.data?.level ?? 2,
      }));
  }, [blocks]);

  const wordCount = useMemo(() => {
    const list = (blocks?.blocks ?? []) as Array<{ data?: Record<string, unknown> }>;
    const text = list
      .map((block) => String(block.data?.text ?? ""))
      .join(" ")
      .replace(/<[^>]+>/g, " ");
    return text.split(/\s+/).filter(Boolean).length;
  }, [blocks]);

  const runAction = async (transition: AvailableTransition) => {
    dispatch({ type: "MUTATION_START", action: transition.name });
    try {
      await saveNow();
      const result = await runTransition(slug, transition.name);
      dispatch({ type: "MUTATION_SUCCESS", article: result.article });
      markVersion(result.article.content_hash);
      refreshRevisions();
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      dispatch({
        type: "MUTATION_ERROR",
        action: transition.name,
        message:
          status === 409
            ? "That action is no longer valid — the article's state changed. Reload to see where it is now."
            : status === 403
              ? "You do not have permission to do that."
              : "Something went wrong running that action.",
      });
    }
  };

  const confirmRestore = async (revisionNumber: number) => {
    dispatch({ type: "MUTATION_START", action: `restore:${revisionNumber}` });
    try {
      const updated = await restoreRevision(slug, revisionNumber);
      dispatch({ type: "MUTATION_SUCCESS", article: updated });
      setTitle(updated.title);
      setExcerpt(updated.excerpt);
      setBlocks(updated.content as OutputData);
      markVersion(updated.content_hash);
      setEditorEpoch((epoch) => epoch + 1);
      refreshRevisions();
    } catch {
      dispatch({
        type: "MUTATION_ERROR",
        action: `restore:${revisionNumber}`,
        message: `Could not restore v${revisionNumber}.`,
      });
    }
  };

  if (lifecycle.kind === "error") {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center" data-state="error">
        <p className="text-sm text-red-600">{lifecycle.message}</p>
        <Button size="sm" variant="secondary" onClick={loadArticle}>
          Try again
        </Button>
      </div>
    );
  }

  if (lifecycle.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center" data-state="loading">
        <Loader2 className="animate-spin text-[var(--sl-muted)]" />
      </div>
    );
  }

  const { article, mutation } = lifecycle;
  const busy = mutation.kind === "running";
  const transitions = article.available_transitions ?? [];
  const primary = transitions[0];
  const rest = transitions.slice(1);

  const outlinePanel = (
    <OutlineContent
      outline={outline}
      blockCount={blocks?.blocks?.length ?? 0}
      wordCount={wordCount}
    />
  );

  const inspectorPanel = (
    <InspectorTabs
      slug={slug}
      article={article}
      title={title}
      excerpt={excerpt}
      tags={tags}
      blocks={blocks}
      revisions={revisions}
      busy={busy}
      onExcerptChange={(next) => {
        setExcerpt(next);
        queue({ excerpt: next });
      }}
      onTagsChange={(next) => {
        setTags(next);
        queue({ tag_slugs: next } as Partial<StudioArticle>);
      }}
      onRequestRestore={(revisionNumber) =>
        dispatch({ type: "REQUEST_RESTORE", revisionNumber })
      }
    />
  );

  return (
    <div
      className="flex min-h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)] min-w-0 flex-col"
      data-state={article.status}
      data-mutation={mutation.kind}
    >
      {/* Topbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--sl-line)] bg-[var(--sl-card)] px-3 py-2.5 sm:gap-3 sm:px-4">
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label="Back to content">
            <Link href="/studio/content">
              <ArrowLeft size={17} />
            </Link>
          </Button>

          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              queue({ title: event.target.value });
            }}
            placeholder="Untitled article"
            aria-label="Article title"
            className="min-w-0 flex-1 border-0 bg-transparent font-display text-base font-bold text-[var(--sl-ink)] outline-none placeholder:text-[var(--sl-muted)] sm:text-lg"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={article.status} />
          <VisibilityControl
            status={article.status}
            transitions={transitions}
            busy={busy}
            onRun={(name) => {
              const match = transitions.find((item) => item.name === name);
              if (match) void runAction(match);
            }}
          />
          <SaveIndicator state={state} onKeepMine={keepMine} />

          <Button
            variant="ghost"
            size="sm"
            className="xl:hidden"
            onClick={() => setMobilePanel("outline")}
            aria-label="Open outline"
          >
            <ListTree size={15} />
            <span className="hidden sm:inline">Outline</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setMobilePanel("inspector")}
            aria-label="Open article inspector"
          >
            <SlidersHorizontal size={15} />
            <span className="hidden sm:inline">Details</span>
          </Button>

          {article.is_live && article.placements?.[0]?.url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={article.placements[0].url} target="_blank" rel="noreferrer">
                View <ExternalLink size={13} />
              </a>
            </Button>
          )}

          {primary ? (
            <div className="flex items-center">
              <Button
                disabled={busy}
                onClick={() => runAction(primary)}
                className={rest.length ? "rounded-r-none" : undefined}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {primary.label}
              </Button>
              {rest.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={busy}
                      className="rounded-l-none border-l border-[var(--sl-soft)] px-2"
                      aria-label="More actions"
                    >
                      <ChevronDown size={15} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {rest.map((transition) => (
                      <DropdownMenuItem
                        key={transition.name}
                        onSelect={() => runAction(transition)}
                        destructive={transition.name === "archive"}
                      >
                        {transition.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ) : (
            <span className="text-xs text-[var(--sl-muted)]">No actions available</span>
          )}
        </div>
      </div>

      {mutation.kind === "error" && (
        <div
          className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {mutation.message}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: "DISMISS_MUTATION_STATE" })}
            aria-label="Dismiss error"
            className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Desktop Outline */}
        <aside className="relative z-0 hidden w-52 shrink-0 overflow-y-auto border-r border-[var(--sl-line)] bg-[var(--sl-card)] p-4 xl:block">
          {outlinePanel}
        </aside>

        {/* Canvas */}
        <div className="relative z-20 min-w-0 flex-1 overflow-y-auto bg-[var(--sl-soft)] px-3 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto max-w-3xl">
            <Editor
              key={`${slug}-${editorEpoch}`}
              holder="studio-editor"
              data={
                article && normalizeSlug(article.slug) === slug ? blocks : undefined
              }
              onChange={onEditorChange}
            />
          </div>
        </div>

        {/* Desktop Right rail */}
        <aside className="relative z-0 hidden w-80 shrink-0 overflow-y-auto border-l border-[var(--sl-line)] bg-[var(--sl-card)] lg:block">
          {inspectorPanel}
        </aside>
      </div>

      {/* Tablet / Mobile Outline Drawer */}
      <Dialog
        open={mobilePanel === "outline"}
        onOpenChange={(open) => !open && setMobilePanel("none")}
      >
        <DialogContent side="left" className="max-w-xs p-0">
          <DialogHeader>
            <DialogTitle>Outline</DialogTitle>
            <DialogDescription>Headings and reading stats</DialogDescription>
          </DialogHeader>
          <DialogBody>{outlinePanel}</DialogBody>
        </DialogContent>
      </Dialog>

      {/* Tablet / Mobile Inspector Drawer */}
      <Dialog
        open={mobilePanel === "inspector"}
        onOpenChange={(open) => !open && setMobilePanel("none")}
      >
        <DialogContent side="right" className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>Article details</DialogTitle>
            <DialogDescription>SEO, settings, revisions, and distribution</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">{inspectorPanel}</DialogBody>
        </DialogContent>
      </Dialog>

      {/* Revision Restore Confirmation Dialog (replaces browser confirm()) */}
      <Dialog
        open={mutation.kind === "confirm_restore"}
        onOpenChange={(open) => !open && dispatch({ type: "DISMISS_MUTATION_STATE" })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Restore revision v{mutation.kind === "confirm_restore" ? mutation.revisionNumber : ""}?
            </DialogTitle>
            <DialogDescription>
              Your current draft content is snapshotted first so nothing is lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "DISMISS_MUTATION_STATE" })}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (mutation.kind === "confirm_restore") {
                  void confirmRestore(mutation.revisionNumber);
                }
              }}
            >
              <History size={14} /> Restore revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OutlineContent({
  outline,
  blockCount,
  wordCount,
}: {
  outline: Array<{ text: string; level: number }>;
  blockCount: number;
  wordCount: number;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
        Outline
      </h2>
      {outline.length === 0 ? (
        <p className="text-xs text-[var(--sl-muted)]">Headings appear here.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {outline.map((heading, index) => (
            <li
              key={index}
              style={{ paddingLeft: `${Math.max(0, heading.level - 2) * 10}px` }}
              className="truncate text-[var(--sl-ink)]"
              title={heading.text}
            >
              {heading.text || "(empty heading)"}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-6 space-y-1 border-t border-[var(--sl-line)] pt-4 text-xs text-[var(--sl-muted)]">
        <div className="flex justify-between">
          <dt>Blocks</dt>
          <dd>{blockCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Words</dt>
          <dd>{wordCount.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Read time</dt>
          <dd>{Math.max(1, Math.ceil(wordCount / 200))} min</dd>
        </div>
      </dl>
    </div>
  );
}

function InspectorTabs({
  slug,
  article,
  title,
  excerpt,
  tags,
  blocks,
  revisions,
  busy,
  onExcerptChange,
  onTagsChange,
  onRequestRestore,
}: {
  slug: string;
  article: StudioArticle;
  title: string;
  excerpt: string;
  tags: string[];
  blocks: OutputData | undefined;
  revisions: RevisionRow[];
  busy: boolean;
  onExcerptChange: (next: string) => void;
  onTagsChange: (next: string[]) => void;
  onRequestRestore: (revisionNumber: number) => void;
}) {
  return (
    <Tabs defaultValue="settings">
      <TabsList className="w-full overflow-x-auto px-3">
        <TabsTrigger value="seo">SEO</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="distribute">Distribute</TabsTrigger>
      </TabsList>

      <TabsContent value="seo" className="p-4">
        <SeoPanel
          slug={slug}
          title={title}
          excerpt={excerpt}
          blocks={blocks}
          siteUrl={article.placements?.[0]?.url ?? ""}
        />
      </TabsContent>

      <TabsContent value="settings" className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
            Excerpt
          </span>
          <textarea
            value={excerpt}
            rows={4}
            maxLength={500}
            onChange={(event) => onExcerptChange(event.target.value)}
            className="input-field resize-y"
          />
          <span className="mt-1 block text-right text-xs text-[var(--sl-muted)]">
            {excerpt.length}/500
          </span>
        </label>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
            Tags
          </span>
          <TagInput value={tags} onChange={onTagsChange} />
        </div>

        <dl className="space-y-2 border-t border-[var(--sl-line)] pt-4 text-sm">
          <Row label="Slug" value={article.slug} mono />
          <Row label="Author" value={article.author?.name ?? "—"} />
          <Row
            label="First published"
            value={
              article.published_at
                ? new Date(article.published_at).toLocaleString()
                : "Never"
            }
          />
          <Row
            label="Last published"
            value={
              article.last_published_at
                ? new Date(article.last_published_at).toLocaleString()
                : "—"
            }
          />
          {article.scheduled_publish_at && (
            <Row
              label="Scheduled"
              value={new Date(article.scheduled_publish_at).toLocaleString()}
            />
          )}
        </dl>
      </TabsContent>

      <TabsContent value="history" className="p-4">
        {revisions.length === 0 ? (
          <p className="text-sm text-[var(--sl-muted)]">No revisions yet.</p>
        ) : (
          <ul className="space-y-2">
            {revisions.map((revision) => (
              <li
                key={revision.id}
                className="rounded-lg border border-[var(--sl-line)] p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--sl-ink)]">
                    v{revision.number}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRequestRestore(revision.number)}
                    className="flex items-center gap-1 text-xs text-[var(--sl-accent)] hover:underline disabled:opacity-50"
                  >
                    <History size={12} /> Restore
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-[var(--sl-muted)]">
                  {revision.reason || "edit"} · {revision.created_by_name} ·{" "}
                  {new Date(revision.created_at).toLocaleString()}
                </p>
                <p className="text-xs text-[var(--sl-muted)]">
                  {revision.summary.blocks} blocks
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="distribute" className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
          Share
        </p>
        <SocialComposer articleId={article.id} articleTitle={article.title} compact />
        <div className="mt-6 border-t border-[var(--sl-line)] pt-5" />
        <ArticleDeliveries articleId={article.id} />
        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
          Placements
        </p>
        <ul className="space-y-2">
          {(article.placements ?? []).map((placement) => (
            <li
              key={placement.id}
              className="rounded-lg border border-[var(--sl-line)] p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{placement.site_name}</span>
                {placement.is_live ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <Check size={12} /> Live
                  </span>
                ) : (
                  <span className="text-xs text-[var(--sl-muted)]">Not live</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-[var(--sl-muted)]">{placement.url}</p>
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-[var(--sl-muted)]">{label}</dt>
      <dd
        className={`truncate text-right text-[var(--sl-ink)] ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function SaveIndicator({
  state,
  onKeepMine,
}: {
  state: ReturnType<typeof useAutosave>["state"];
  onKeepMine: () => void;
}) {
  if (state.kind === "conflict") {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
        data-state="conflict"
      >
        <AlertTriangle size={13} />
        <span>Someone else edited this.</span>
        <button type="button" onClick={onKeepMine} className="font-semibold underline">
          Keep mine
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-semibold underline"
        >
          Take theirs
        </button>
      </div>
    );
  }

  const text: Record<string, string> = {
    idle: "",
    dirty: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved",
    error: "",
  };

  if (state.kind === "error") {
    return (
      <span className="text-xs text-red-600" data-state="error">
        {state.message}
      </span>
    );
  }

  return (
    <span
      className="whitespace-nowrap text-xs text-[var(--sl-muted)]"
      data-state={state.kind}
    >
      {text[state.kind]}
    </span>
  );
}
