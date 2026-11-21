"use client";

import { CalendarClock, Eye, EyeOff, FilePenLine } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import {
  VISIBILITY_OF_STATUS,
  resolveVisibilityTransition,
  type Visibility,
} from "@/lib/fsm/editorial";
import type { AvailableTransition, StudioStatus } from "@/lib/studio-api";

const OPTIONS: {
  id: Exclude<Visibility, "scheduled">;
  label: string;
  hint: string;
  scheduledHint?: string;
  Icon: typeof Eye;
}[] = [
  {
    id: "draft",
    label: "Draft",
    hint: "Only visible in the studio",
    scheduledHint: "Cancel schedule and return to non-public",
    Icon: FilePenLine,
  },
  { id: "public", label: "Public", hint: "Live on the site", Icon: Eye },
  { id: "hidden", label: "Hidden", hint: "Taken off the site", Icon: EyeOff },
];

export function VisibilityControl({
  status,
  transitions,
  busy,
  onRun,
}: {
  status: StudioStatus;
  transitions: AvailableTransition[];
  busy: boolean;
  onRun: (name: string) => void;
}) {
  const current = VISIBILITY_OF_STATUS[status];
  const triggerMeta =
    current === "scheduled"
      ? { label: "Scheduled", Icon: CalendarClock }
      : (OPTIONS.find((item) => item.id === current) ?? OPTIONS[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        data-state={status}
        data-visibility={current}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring",
          current === "public" &&
            "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
          current === "scheduled" &&
            "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
          current === "hidden" &&
            "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
          current === "draft" &&
            "border-[var(--sl-line)] bg-[var(--sl-card)] text-[var(--sl-ink)]",
        )}
        aria-label={`Article visibility: ${triggerMeta.label}`}
      >
        <triggerMeta.Icon size={13} />
        {triggerMeta.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Visibility</DropdownMenuLabel>
        {OPTIONS.map((option) => {
          const transitionName = resolveVisibilityTransition(status, option.id, transitions);
          const isCurrent = option.id === current;
          return (
            <DropdownMenuItem
              key={option.id}
              disabled={!transitionName || busy || isCurrent}
              data-transition={transitionName ?? undefined}
              onSelect={() => {
                if (transitionName) onRun(transitionName);
              }}
            >
              <option.Icon size={14} />
              <span className="flex flex-col">
                <span>
                  {status === "scheduled" && option.id === "draft"
                    ? "Cancel schedule"
                    : option.label}
                </span>
                <span className="text-[11px] font-normal text-[var(--sl-muted)]">
                  {status === "scheduled" && option.scheduledHint
                    ? option.scheduledHint
                    : option.hint}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
