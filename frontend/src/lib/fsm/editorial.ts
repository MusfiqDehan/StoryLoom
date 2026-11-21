import type { AvailableTransition, BulkResult, StudioArticle, StudioStatus } from "@/lib/studio-api";

export type Visibility = "draft" | "scheduled" | "public" | "hidden";

export const VISIBILITY_OF_STATUS: Record<StudioStatus, Visibility> = {
  draft: "draft",
  in_review: "draft",
  approved: "draft",
  scheduled: "scheduled",
  published: "public",
  archived: "hidden",
};

/**
 * Explicit visibility transition table mapped onto backend workflow names.
 * Checking `available_transitions` lets UI and agents inspect allowed moves
 * without guessing role permissions or status edge cases.
 */
const VISIBILITY_TO_TRANSITION: Record<
  Visibility,
  Partial<Record<StudioStatus, string>>
> = {
  draft: {
    published: "unpublish",
    archived: "restore",
    in_review: "withdraw",
    scheduled: "unschedule",
  },
  scheduled: {},
  public: {
    draft: "publish",
    in_review: "publish",
    approved: "publish",
    scheduled: "publish",
    archived: "publish",
  },
  hidden: {
    draft: "archive",
    in_review: "archive",
    approved: "archive",
    scheduled: "archive",
    published: "archive",
  },
};

export function resolveVisibilityTransition(
  from: StudioStatus,
  to: Visibility,
  available?: AvailableTransition[],
): string | null {
  const transition = VISIBILITY_TO_TRANSITION[to]?.[from] ?? null;
  if (!transition) return null;
  if (!available) return transition;
  return available.some((item) => item.name === transition) ? transition : null;
}

/** Explicit finite-state machine for the Studio article editor screen. */
export type EditorLifecycleState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      article: StudioArticle;
      mutation:
        | { kind: "idle" }
        | { kind: "confirm_restore"; revisionNumber: number }
        | { kind: "running"; action: string }
        | { kind: "error"; action: string; message: string };
    };

export type EditorLifecycleEvent =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; article: StudioArticle }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "MUTATION_START"; action: string }
  | { type: "MUTATION_SUCCESS"; article?: StudioArticle }
  | { type: "MUTATION_ERROR"; action: string; message: string }
  | { type: "REQUEST_RESTORE"; revisionNumber: number }
  | { type: "DISMISS_MUTATION_STATE" };

export function editorLifecycleReducer(
  state: EditorLifecycleState,
  event: EditorLifecycleEvent,
): EditorLifecycleState {
  switch (event.type) {
    case "LOAD_START":
      return { kind: "loading" };
    case "LOAD_SUCCESS":
      return {
        kind: "ready",
        article: event.article,
        mutation: { kind: "idle" },
      };
    case "LOAD_ERROR":
      return { kind: "error", message: event.message };
    case "MUTATION_START":
      if (state.kind !== "ready") return state;
      return { ...state, mutation: { kind: "running", action: event.action } };
    case "MUTATION_SUCCESS":
      if (state.kind !== "ready") return state;
      return {
        kind: "ready",
        article: event.article ?? state.article,
        mutation: { kind: "idle" },
      };
    case "MUTATION_ERROR":
      if (state.kind !== "ready") return state;
      return {
        ...state,
        mutation: { kind: "error", action: event.action, message: event.message },
      };
    case "REQUEST_RESTORE":
      if (state.kind !== "ready") return state;
      return {
        ...state,
        mutation: { kind: "confirm_restore", revisionNumber: event.revisionNumber },
      };
    case "DISMISS_MUTATION_STATE":
      if (state.kind !== "ready") return state;
      return { ...state, mutation: { kind: "idle" } };
  }
}

/** Explicit finite-state machine for BulkActionDrawer. */
export type BulkActionId = "publish" | "unpublish" | "archive" | "submit" | "approve" | "delete";

export type BulkDrawerState =
  | { kind: "closed" }
  | { kind: "confirm"; action: BulkActionId; reason: string; ackDelete: boolean }
  | { kind: "running"; action: BulkActionId; reason: string }
  | { kind: "done"; action: BulkActionId; result: BulkResult }
  | { kind: "error"; action: BulkActionId; reason: string; message: string };

export type BulkDrawerEvent =
  | { type: "OPEN"; action: BulkActionId }
  | { type: "CLOSE" }
  | { type: "SET_REASON"; reason: string }
  | { type: "SET_ACK_DELETE"; ackDelete: boolean }
  | { type: "SUBMIT" }
  | { type: "SUCCEED"; result: BulkResult }
  | { type: "FAIL"; message: string }
  | { type: "BACK_TO_CONFIRM" };

export function bulkDrawerReducer(
  state: BulkDrawerState,
  event: BulkDrawerEvent,
): BulkDrawerState {
  switch (event.type) {
    case "OPEN":
      return { kind: "confirm", action: event.action, reason: "", ackDelete: false };
    case "CLOSE":
      return { kind: "closed" };
    case "SET_REASON":
      if (state.kind !== "confirm" && state.kind !== "error") return state;
      return { ...state, reason: event.reason };
    case "SET_ACK_DELETE":
      if (state.kind !== "confirm") return state;
      return { ...state, ackDelete: event.ackDelete };
    case "SUBMIT":
      if (state.kind !== "confirm" && state.kind !== "error") return state;
      return { kind: "running", action: state.action, reason: state.reason };
    case "SUCCEED":
      if (state.kind !== "running") return state;
      return { kind: "done", action: state.action, result: event.result };
    case "FAIL":
      if (state.kind !== "running") return state;
      return {
        kind: "error",
        action: state.action,
        reason: state.reason,
        message: event.message,
      };
    case "BACK_TO_CONFIRM":
      if (state.kind === "closed") return state;
      return {
        kind: "confirm",
        action: state.action,
        reason: "reason" in state ? state.reason : "",
        ackDelete: false,
      };
  }
}
