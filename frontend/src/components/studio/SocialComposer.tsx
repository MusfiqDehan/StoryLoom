"use client";

import { AlertTriangle, Clock, Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useReducer } from "react";

import { SocialPreview } from "@/components/studio/SocialPreview";
import { useStudioQuery } from "@/components/studio/useStudioQuery";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { extractErrorMessage } from "@/lib/fsm";
import {
  initialSocialComposerState,
  socialComposerReducer,
} from "@/lib/fsm/composer";
import { countedLength } from "@/lib/graphemes";
import {
  createSocialPost,
  deriveCaptions,
  getPlatformSpecs,
  listSocialAccounts,
  type Platform,
  type SocialPost,
} from "@/lib/studio-api";

export function SocialComposer({
  articleId,
  articleTitle,
  compact = false,
  onPublished,
}: {
  articleId?: number;
  articleTitle?: string;
  /** Forces single-column stacking inside narrow sidebars like the article inspector. */
  compact?: boolean;
  onPublished?: (post: SocialPost) => void;
}) {
  const { data: specs } = useStudioQuery(getPlatformSpecs, []);
  const { data: accounts, loading, error: loadError, refresh: reload } = useStudioQuery(
    listSocialAccounts,
    [],
  );

  const [state, dispatch] = useReducer(
    socialComposerReducer,
    initialSocialComposerState,
  );

  const specByKey = useMemo(
    () => Object.fromEntries((specs ?? []).map((spec) => [spec.key, spec])),
    [specs],
  );
  const usable = useMemo(
    () => (accounts ?? []).filter((account) => account.is_usable),
    [accounts],
  );

  useEffect(() => {
    if (accounts) {
      dispatch({ type: "SYNC_ACCOUNTS", accounts });
    }
  }, [accounts]);

  const selectedSet = useMemo(
    () => new Set(state.selectedIds),
    [state.selectedIds],
  );
  const activeAccount =
    usable.find((account) => account.id === state.activeAccountId) ??
    usable.find((account) => selectedSet.has(account.id)) ??
    null;

  const busy =
    state.phase.kind === "generating" || state.phase.kind === "submitting";

  const suggest = async () => {
    if (!articleId) return;
    dispatch({ type: "GENERATE_START" });
    try {
      const platforms = Array.from(
        new Set(
          usable
            .filter((account) => selectedSet.has(account.id))
            .map((account) => account.platform),
        ),
      );
      const previews = await deriveCaptions({ article: articleId, platforms });
      const byPlatform = Object.fromEntries(previews.map((p) => [p.platform, p]));
      const next: Record<number, string> = {};
      for (const account of usable) {
        if (!selectedSet.has(account.id)) continue;
        if (!state.captions[account.id]?.trim()) {
          next[account.id] = byPlatform[account.platform]?.caption ?? "";
        }
      }
      dispatch({ type: "GENERATE_DONE", captions: next });
      const impossible = previews.filter((p) => !p.fits);
      if (impossible.length) {
        dispatch({
          type: "FAIL",
          message:
            `Too long for ${impossible.map((p) => p.platform).join(", ")} even with the ` +
            "excerpt removed — shorten the title or drop a hashtag.",
        });
      }
    } catch {
      dispatch({ type: "FAIL", message: "Could not generate captions." });
    }
  };

  const submit = async () => {
    dispatch({ type: "SUBMIT_START" });
    try {
      const post = await createSocialPost({
        article: articleId ?? null,
        scheduled_at: state.scheduleAt
          ? new Date(state.scheduleAt).toISOString()
          : null,
        targets: usable
          .filter((account) => selectedSet.has(account.id))
          .map((account) => ({
            account: account.id,
            caption: state.captions[account.id] ?? "",
          })),
      });
      dispatch({ type: "SUBMIT_DONE", post });
      onPublished?.(post);
    } catch (err) {
      const { message } = extractErrorMessage(err, "Could not submit.");
      dispatch({ type: "FAIL", message });
    }
  };

  if (state.phase.kind === "submitted") {
    return (
      <ResultStrip
        post={state.phase.post}
        onReset={() => dispatch({ type: "DISMISS_PHASE" })}
      />
    );
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-[var(--sl-muted)]" data-state="loading">
        Loading accounts…
      </p>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 p-4 text-center text-sm text-red-700 dark:border-red-900/50 dark:text-red-300" data-state="error">
        <p>{loadError}</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }
  if (usable.length === 0) {
    return (
      <p
        className="rounded-xl border border-dashed border-[var(--sl-line)] p-6 text-center text-sm text-[var(--sl-muted)]"
        data-state="empty"
      >
        No connected social accounts. Add one in Settings before composing.
      </p>
    );
  }

  return (
    <div
      className={cn("grid gap-6", !compact && "lg:grid-cols-2")}
      data-state={state.phase.kind}
    >
      <div className="min-w-0 space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
            Post to
          </p>
          <div className="flex flex-wrap gap-1.5">
            {usable.map((account) => {
              const isSelected = selectedSet.has(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    dispatch({ type: "TOGGLE_ACCOUNT", accountId: account.id })
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    isSelected
                      ? "border-[var(--sl-action)] bg-[var(--sl-action)] text-white"
                      : "border-[var(--sl-line)] bg-[var(--sl-card)] text-[var(--sl-ink)] hover:bg-[var(--sl-soft)]",
                  )}
                >
                  {specByKey[account.platform]?.label ?? account.platform}
                  <span className="opacity-75">
                    {account.handle || account.display_name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedSet.size > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1">
                {usable
                  .filter((a) => selectedSet.has(a.id))
                  .map((account) => {
                    const isActive = activeAccount?.id === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() =>
                          dispatch({ type: "SET_ACTIVE", accountId: account.id })
                        }
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition",
                          isActive
                            ? "bg-[var(--sl-action)] text-white"
                            : "bg-[var(--sl-soft)] text-[var(--sl-ink)] hover:opacity-90",
                        )}
                      >
                        {specByKey[account.platform]?.label ?? account.platform}
                      </button>
                    );
                  })}
              </div>
              {articleId && (
                <Button size="sm" variant="secondary" onClick={suggest} disabled={busy}>
                  {state.phase.kind === "generating" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  Suggest captions
                </Button>
              )}
            </div>

            {activeAccount && (
              <CaptionField
                key={activeAccount.id}
                value={state.captions[activeAccount.id] ?? ""}
                onChange={(caption) =>
                  dispatch({
                    type: "SET_CAPTION",
                    accountId: activeAccount.id,
                    caption,
                  })
                }
                spec={specByKey[activeAccount.platform]}
              />
            )}

            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--sl-muted)]">
                <Clock size={12} /> Schedule (optional)
              </span>
              <input
                type="datetime-local"
                className="input-field"
                value={state.scheduleAt}
                onChange={(e) =>
                  dispatch({ type: "SET_SCHEDULE", scheduleAt: e.target.value })
                }
              />
              <span className="mt-1 block text-xs text-[var(--sl-muted)]">
                Held here and published at that moment by this CMS, not handed to
                the platform.
              </span>
            </label>
          </>
        )}

        {state.phase.kind === "error" && (
          <p
            className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            role="alert"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {state.phase.message}
          </p>
        )}

        <Button
          onClick={submit}
          disabled={
            busy ||
            selectedSet.size === 0 ||
            hasOverflow(usable, selectedSet, state.captions, specByKey)
          }
        >
          {state.phase.kind === "submitting" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
          {state.scheduleAt ? "Schedule" : "Publish"} to {selectedSet.size}
        </Button>
      </div>

      <div className="min-w-0 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
          Preview
        </p>
        {usable
          .filter((account) => selectedSet.has(account.id))
          .map((account) => (
            <SocialPreview
              key={account.id}
              platform={account.platform}
              caption={
                state.captions[account.id] ||
                `Share “${articleTitle ?? "this article"}”…`
              }
              accountName={account.display_name}
              handle={account.handle}
              avatarUrl={account.avatar_url}
            />
          ))}
        {selectedSet.size === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--sl-line)] p-6 text-center text-sm text-[var(--sl-muted)]">
            Pick an account to see how the post will look.
          </p>
        )}
      </div>
    </div>
  );
}

function CaptionField({
  value,
  onChange,
  spec,
}: {
  value: string;
  onChange: (value: string) => void;
  spec?: { label: string; max_length: number; url_length: number | null; notes: string[] };
}) {
  if (!spec) return null;
  const used = countedLength(value, spec.url_length);
  const left = spec.max_length - used;

  return (
    <div>
      <textarea
        className="input-field h-40 resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Write the ${spec.label} post…`}
      />
      <div className="mt-1 flex items-start justify-between gap-3 text-xs">
        <span className="text-[var(--sl-muted)]">{spec.notes[0]}</span>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            left < 0 ? "font-semibold text-red-600" : left < 20 ? "text-amber-600" : "text-[var(--sl-muted)]",
          )}
        >
          {used}/{spec.max_length}
        </span>
      </div>
    </div>
  );
}

function hasOverflow(
  accounts: Array<{ id: number; platform: Platform }>,
  selected: Set<number>,
  captions: Record<number, string>,
  specs: Record<string, { max_length: number; url_length: number | null }>,
) {
  return accounts.some((account) => {
    if (!selected.has(account.id)) return false;
    const spec = specs[account.platform];
    if (!spec) return false;
    return countedLength(captions[account.id] ?? "", spec.url_length) > spec.max_length;
  });
}

function ResultStrip({ post, onReset }: { post: SocialPost; onReset: () => void }) {
  return (
    <div className="space-y-3" data-state="submitted">
      <ul className="divide-y divide-[var(--sl-line)] rounded-xl border border-[var(--sl-line)]">
        {post.targets.map((target) => (
          <li key={target.id} className="flex items-start gap-3 px-4 py-3 text-sm">
            <span className="w-20 shrink-0 font-medium capitalize">{target.platform}</span>
            {target.state === "published" ? (
              <span className="flex-1 text-emerald-700 dark:text-emerald-400">
                Published{" "}
                {target.external_url && (
                  <a
                    href={target.external_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    view post
                  </a>
                )}
              </span>
            ) : target.state === "failed" ? (
              <span className="flex-1 text-red-600">
                {target.last_error || "Failed."}
              </span>
            ) : target.state === "retrying" ? (
              <span className="flex-1 text-amber-600">
                Retrying — {target.last_error || "the platform is still working."}
              </span>
            ) : (
              <span className="flex-1 text-[var(--sl-muted)]">
                {post.state === "scheduled" ? "Scheduled." : "Sending…"}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" onClick={onReset}>
        Compose another
      </Button>
    </div>
  );
}
