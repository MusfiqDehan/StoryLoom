export type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "conflict"; currentVersion: string }
  | { kind: "error"; message: string };

export type SaveEvent =
  | { type: "RESET" }
  | { type: "MARK_DIRTY" }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCEED"; at: number }
  | { type: "SAVE_CONFLICT"; currentVersion: string }
  | { type: "SAVE_ERROR"; message: string };

const ALLOWED_TRANSITIONS: Record<SaveState["kind"], ReadonlySet<SaveState["kind"]>> = {
  idle: new Set(["idle", "dirty", "saving"]),
  dirty: new Set(["idle", "dirty", "saving"]),
  saving: new Set(["idle", "dirty", "saving", "saved", "conflict", "error"]),
  saved: new Set(["idle", "dirty", "saving", "saved"]),
  conflict: new Set(["idle", "dirty", "saving"]),
  error: new Set(["idle", "dirty", "saving"]),
};

export function autosaveReducer(state: SaveState, event: SaveEvent): SaveState {
  switch (event.type) {
    case "RESET":
      return { kind: "idle" };
    case "MARK_DIRTY":
      if (state.kind === "saving" || state.kind === "conflict") return state;
      return ALLOWED_TRANSITIONS[state.kind].has("dirty") ? { kind: "dirty" } : state;
    case "SAVE_START":
      return ALLOWED_TRANSITIONS[state.kind].has("saving") ? { kind: "saving" } : state;
    case "SAVE_SUCCEED":
      return ALLOWED_TRANSITIONS[state.kind].has("saved")
        ? { kind: "saved", at: event.at }
        : state;
    case "SAVE_CONFLICT":
      return { kind: "conflict", currentVersion: event.currentVersion };
    case "SAVE_ERROR":
      return { kind: "error", message: event.message };
  }
}
