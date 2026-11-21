"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { PageShell, QueryState } from "@/components/studio/PageShell";
import { useStudioQuery } from "@/components/studio/useStudioQuery";
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
import { cn } from "@/lib/cn";
import { useAsyncFlow } from "@/lib/fsm/useAsyncFlow";
import { getCalendar, scheduleArticle, type CalendarEntry } from "@/lib/studio-api";

const DEFAULT_HOUR = 9;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_STYLE: Record<CalendarEntry["kind"], string> = {
  scheduled_publish:
    "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  scheduled_unpublish:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
  published:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
};

/**
 * Publishing calendar.
 *
 * Supports both desktop drag-and-drop onto any day cell (preserving time of day)
 * and a touch/keyboard reschedule dialog so mobile and assistive-tech users
 * have identical scheduling power.
 */
export default function CalendarPage() {
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [dragging, setDragging] = useState<CalendarEntry | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [scheduleInput, setScheduleInput] = useState("");
  const flow = useAsyncFlow<void>();

  const grid = useMemo(() => monthGrid(monthStart), [monthStart]);
  const { data, loading, error: loadError, refresh } = useStudioQuery(
    () => getCalendar(grid[0], addDays(grid[grid.length - 1], 1)),
    [monthStart.toISOString()],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of data?.entries ?? []) {
      if (!entry.at) continue;
      const key = dayKey(new Date(entry.at));
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [data]);

  const rescheduleTo = useCallback(async (entry: CalendarEntry, when: Date) => {
    if (when.getTime() <= Date.now()) {
      flow.setError("That date has already passed — pick a future time.");
      return false;
    }
    const ok = await flow.run(
      async () => {
        await scheduleArticle(entry.slug, {
          scheduled_publish_at: when.toISOString(),
        });
      },
      { action: "reschedule", fallbackError: "Could not reschedule that." },
    );
    if (ok !== null) {
      refresh();
      return true;
    }
    return false;
  }, [flow, refresh]);

  const drop = async (day: Date) => {
    const entry = dragging;
    setDragging(null);
    setOverDay(null);
    if (!entry) return;

    const previous = entry.scheduled_publish_at ?? entry.published_at;
    const when = new Date(day);
    if (previous) {
      const old = new Date(previous);
      when.setHours(old.getHours(), old.getMinutes(), 0, 0);
    } else {
      when.setHours(DEFAULT_HOUR, 0, 0, 0);
    }
    await rescheduleTo(entry, when);
  };

  const openScheduleModal = (entry: CalendarEntry) => {
    flow.reset();
    const base = entry.scheduled_publish_at ?? entry.at;
    const targetDate = base ? new Date(base) : addDays(new Date(), 1);
    if (!base) targetDate.setHours(DEFAULT_HOUR, 0, 0, 0);
    setScheduleInput(toLocalInputValue(targetDate));
    setEditingEntry(entry);
  };

  const monthLabel = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <PageShell
      title="Calendar"
      description="Drag an article onto a day or use the clock button to reschedule."
      actions={
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous month"
            onClick={() => setMonthStart(addMonths(monthStart, -1))}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-[var(--sl-ink)] sm:w-40">
            {monthLabel}
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next month"
            onClick={() => setMonthStart(addMonths(monthStart, 1))}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMonthStart(startOfMonth(new Date()))}
          >
            Today
          </Button>
        </div>
      }
    >
      {(flow.error || flow.isRunning) && (
        <div className="mb-3 flex items-center gap-2 text-sm" data-state={flow.dataState}>
          {flow.isRunning && <Loader2 size={14} className="animate-spin text-[var(--sl-muted)]" />}
          {flow.error && (
            <span className="text-red-600" role="alert">
              {flow.error}
            </span>
          )}
        </div>
      )}

      <QueryState loading={loading} error={loadError} isEmpty={false} empty={null}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="overflow-x-auto rounded-xl border border-[var(--sl-line)] bg-[var(--sl-card)]">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-7 border-b border-[var(--sl-line)] text-center text-xs font-medium uppercase tracking-wide text-[var(--sl-muted)]">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.map((day) => {
                  const key = dayKey(day);
                  const entries = byDay.get(key) ?? [];
                  const inMonth = day.getMonth() === monthStart.getMonth();
                  const isToday = key === dayKey(new Date());
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setOverDay(key);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void drop(day);
                      }}
                      className={cn(
                        "min-h-[104px] border-b border-r border-[var(--sl-line)] p-1.5 transition",
                        !inMonth && "bg-slate-50/60 dark:bg-slate-950/40",
                        overDay === key && "bg-[var(--sl-soft)] dark:bg-primary-950/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums",
                          isToday
                            ? "bg-[var(--sl-action)] font-semibold text-white"
                            : inMonth
                              ? "text-[var(--sl-ink)]"
                              : "text-[var(--sl-muted)] opacity-60",
                        )}
                      >
                        {day.getDate()}
                      </span>
                      <div className="space-y-1">
                        {entries.map((entry) => (
                          <EntryChip
                            key={`${entry.id}-${entry.kind}`}
                            entry={entry}
                            onDragStart={() => setDragging(entry)}
                            onDragEnd={() => setDragging(null)}
                            onReschedule={() => openScheduleModal(entry)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <aside>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--sl-muted)]">
              <CalendarClock size={13} /> Unscheduled
            </h2>
            {(data?.unscheduled ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--sl-line)] p-4 text-center text-xs text-[var(--sl-muted)]">
                Nothing waiting.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(data?.unscheduled ?? []).map((entry) => (
                  <EntryChip
                    key={entry.id}
                    entry={entry}
                    onDragStart={() => setDragging(entry)}
                    onDragEnd={() => setDragging(null)}
                    onReschedule={() => openScheduleModal(entry)}
                  />
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-[var(--sl-muted)]">
              Dragged here for the first time, an article defaults to {DEFAULT_HOUR}:00
              on the chosen day. Tap the clock button on any card for manual timing.
            </p>
          </aside>
        </div>
      </QueryState>

      {editingEntry && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingEntry(null);
          }}
        >
          <DialogContent className="max-w-md" data-state={flow.dataState}>
            <DialogHeader>
              <DialogTitle>Schedule article</DialogTitle>
              <DialogDescription className="truncate">
                {editingEntry.title || "Untitled"}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--sl-muted)]">
                  Publish date & time
                </span>
                <input
                  type="datetime-local"
                  className="input-field"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                />
              </label>
              {flow.error && (
                <p className="text-sm text-red-600" role="alert">
                  {flow.error}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditingEntry(null)}>
                Cancel
              </Button>
              <Button
                disabled={flow.isRunning || !scheduleInput}
                onClick={async () => {
                  const ok = await rescheduleTo(
                    editingEntry,
                    new Date(scheduleInput),
                  );
                  if (ok) setEditingEntry(null);
                }}
              >
                {flow.isRunning && <Loader2 size={14} className="animate-spin" />}
                Save schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}

function EntryChip({
  entry,
  onDragStart,
  onDragEnd,
  onReschedule,
}: {
  entry: CalendarEntry;
  onDragStart: () => void;
  onDragEnd: () => void;
  onReschedule: () => void;
}) {
  const time = entry.at
    ? new Date(entry.at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] leading-tight",
        KIND_STYLE[entry.kind] ?? KIND_STYLE.published,
      )}
    >
      <Link
        href={`/studio/content/${encodeURIComponent(entry.slug)}`}
        title={`${entry.title} — ${entry.kind.replace("_", " ")}`}
        className="min-w-0 flex-1 cursor-grab truncate hover:underline"
      >
        {time && <span className="mr-1 opacity-60 tabular-nums">{time}</span>}
        {entry.title || "Untitled"}
      </Link>
      {entry.kind !== "published" && (
        <button
          type="button"
          onClick={onReschedule}
          aria-label={`Reschedule ${entry.title || "article"}`}
          className="shrink-0 rounded p-0.5 opacity-70 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
        >
          <Clock size={11} />
        </button>
      )}
    </div>
  );
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function monthGrid(monthStart: Date) {
  const first = new Date(monthStart);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
