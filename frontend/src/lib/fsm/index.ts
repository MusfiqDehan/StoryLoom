/**
 * Minimal, typed finite-state-machine primitives for StoryLoom Studio & UI.
 *
 * Matches the backend ethos (`apps/editorial/transitions.py`, `common/fsm.py`):
 * explicit transition tables, discriminated state unions, zero external bloat,
 * and a `data-state` convention so UI elements are self-describing for DX & AX.
 */

export type AsyncFlowState<T = unknown> =
  | { kind: "idle" }
  | { kind: "running"; action?: string }
  | { kind: "done"; value: T; action?: string }
  | { kind: "error"; message: string; code?: string; action?: string };

export type AsyncFlowEvent<T = unknown> =
  | { type: "START"; action?: string }
  | { type: "SUCCEED"; value: T; action?: string }
  | { type: "FAIL"; message: string; code?: string; action?: string }
  | { type: "RESET" };

const ASYNC_FLOW_TRANSITIONS: Record<AsyncFlowState["kind"], ReadonlySet<AsyncFlowState["kind"]>> = {
  idle: new Set(["running", "idle"]),
  running: new Set(["done", "error", "idle"]),
  done: new Set(["running", "idle"]),
  error: new Set(["running", "idle", "done"]),
};

export function asyncFlowReducer<T>(
  state: AsyncFlowState<T>,
  event: AsyncFlowEvent<T>,
): AsyncFlowState<T> {
  switch (event.type) {
    case "START": {
      if (!ASYNC_FLOW_TRANSITIONS[state.kind].has("running")) return state;
      return { kind: "running", action: event.action };
    }
    case "SUCCEED": {
      return { kind: "done", value: event.value, action: event.action ?? ("action" in state ? state.action : undefined) };
    }
    case "FAIL": {
      return {
        kind: "error",
        message: event.message,
        code: event.code,
        action: event.action ?? ("action" in state ? state.action : undefined),
      };
    }
    case "RESET":
      return { kind: "idle" };
  }
}

export function extractErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): { message: string; code?: string } {
  const response = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (response && typeof response === "object") {
    const code = typeof response.code === "string" ? response.code : undefined;
    if (typeof response.detail === "string" && response.detail) {
      return { message: response.detail, code };
    }
    const first = Object.values(response)[0];
    if (Array.isArray(first) && first[0]) {
      return { message: String(first[0]), code };
    }
    if (typeof first === "string" && first) {
      return { message: first, code };
    }
  }
  if (err instanceof Error && err.message) {
    return { message: err.message };
  }
  return { message: fallback };
}
