import type { SeoAnalysis, SocialAccount, SocialPost } from "@/lib/studio-api";

export type SeoPanelState =
  | { kind: "idle" }
  | { kind: "pending"; previous: SeoAnalysis | null }
  | { kind: "ready"; analysis: SeoAnalysis }
  | { kind: "error"; message: string; previous: SeoAnalysis | null };

export type SeoPanelEvent =
  | { type: "QUEUE" }
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; analysis: SeoAnalysis }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "CLEAR" };

export function seoPanelReducer(
  state: SeoPanelState,
  event: SeoPanelEvent,
): SeoPanelState {
  const previous =
    state.kind === "ready"
      ? state.analysis
      : state.kind === "pending" || state.kind === "error"
        ? state.previous
        : null;

  switch (event.type) {
    case "CLEAR":
      return { kind: "idle" };
    case "QUEUE":
    case "LOAD_START":
      return { kind: "pending", previous };
    case "LOAD_SUCCESS":
      return { kind: "ready", analysis: event.analysis };
    case "LOAD_ERROR":
      return { kind: "error", message: event.message, previous };
  }
}

export type SocialComposerPhase =
  | { kind: "composing" }
  | { kind: "generating" }
  | { kind: "submitting" }
  | { kind: "submitted"; post: SocialPost }
  | { kind: "error"; message: string };

export interface SocialComposerState {
  selectedIds: number[];
  captions: Record<number, string>;
  activeAccountId: number | null;
  scheduleAt: string;
  phase: SocialComposerPhase;
}

export type SocialComposerEvent =
  | { type: "SYNC_ACCOUNTS"; accounts: SocialAccount[]; preselected?: number[] }
  | { type: "TOGGLE_ACCOUNT"; accountId: number }
  | { type: "SET_ACTIVE"; accountId: number }
  | { type: "SET_CAPTION"; accountId: number; caption: string }
  | { type: "SET_ALL_CAPTIONS"; captions: Record<number, string> }
  | { type: "SET_SCHEDULE"; scheduleAt: string }
  | { type: "GENERATE_START" }
  | { type: "GENERATE_DONE"; captions: Record<number, string> }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_DONE"; post: SocialPost }
  | { type: "FAIL"; message: string }
  | { type: "DISMISS_PHASE" };

export const initialSocialComposerState: SocialComposerState = {
  selectedIds: [],
  captions: {},
  activeAccountId: null,
  scheduleAt: "",
  phase: { kind: "composing" },
};

export function socialComposerReducer(
  state: SocialComposerState,
  event: SocialComposerEvent,
): SocialComposerState {
  switch (event.type) {
    case "SYNC_ACCOUNTS": {
      const usableIds = event.accounts.filter((a) => a.is_usable).map((a) => a.id);
      const nextSelected =
        state.selectedIds.length > 0
          ? state.selectedIds.filter((id) => usableIds.includes(id))
          : (event.preselected && event.preselected.length > 0
              ? event.preselected.filter((id) => usableIds.includes(id))
              : usableIds);
      const nextActive =
        state.activeAccountId && nextSelected.includes(state.activeAccountId)
          ? state.activeAccountId
          : (nextSelected[0] ?? event.accounts[0]?.id ?? null);
      return {
        ...state,
        selectedIds: nextSelected,
        activeAccountId: nextActive,
      };
    }
    case "TOGGLE_ACCOUNT": {
      const selected = state.selectedIds.includes(event.accountId)
        ? state.selectedIds.filter((id) => id !== event.accountId)
        : [...state.selectedIds, event.accountId];
      const nextActive = selected.includes(state.activeAccountId ?? -1)
        ? state.activeAccountId
        : (selected[0] ?? null);
      return {
        ...state,
        selectedIds: selected,
        activeAccountId: nextActive,
        phase: state.phase.kind === "error" ? { kind: "composing" } : state.phase,
      };
    }
    case "SET_ACTIVE":
      return { ...state, activeAccountId: event.accountId };
    case "SET_CAPTION":
      return {
        ...state,
        captions: { ...state.captions, [event.accountId]: event.caption },
        phase: state.phase.kind === "error" ? { kind: "composing" } : state.phase,
      };
    case "SET_ALL_CAPTIONS":
      return { ...state, captions: { ...state.captions, ...event.captions } };
    case "SET_SCHEDULE":
      return { ...state, scheduleAt: event.scheduleAt };
    case "GENERATE_START":
      return { ...state, phase: { kind: "generating" } };
    case "GENERATE_DONE":
      return {
        ...state,
        captions: { ...state.captions, ...event.captions },
        phase: { kind: "composing" },
      };
    case "SUBMIT_START":
      return { ...state, phase: { kind: "submitting" } };
    case "SUBMIT_DONE":
      return { ...state, phase: { kind: "submitted", post: event.post } };
    case "FAIL":
      return { ...state, phase: { kind: "error", message: event.message } };
    case "DISMISS_PHASE":
      return { ...state, phase: { kind: "composing" } };
  }
}
