"use client";

import { useCallback, useReducer } from "react";
import { asyncFlowReducer, extractErrorMessage, type AsyncFlowState } from "./index";

/**
 * Explicit finite-state hook for async UI actions, mutations, and dialogs.
 *
 * Replaces scattered `busy` + `error` + `saved` + `result` boolean combinations
 * with a single discriminated state (`idle | running | done | error`).
 */
export function useAsyncFlow<T = void>() {
  const [state, dispatch] = useReducer(asyncFlowReducer<T>, { kind: "idle" } as AsyncFlowState<T>);

  const run = useCallback(
    async (
      task: () => Promise<T>,
      options?: { action?: string; fallbackError?: string } | string,
    ): Promise<T | null> => {
      const opts = typeof options === "string" ? { fallbackError: options } : options;
      dispatch({ type: "START", action: opts?.action });
      try {
        const value = await task();
        dispatch({ type: "SUCCEED", value, action: opts?.action });
        return value;
      } catch (err) {
        const { message, code } = extractErrorMessage(err, opts?.fallbackError);
        dispatch({ type: "FAIL", message, code, action: opts?.action });
        return null;
      }
    },
    [],
  );

  const setError = useCallback((message: string, code?: string) => {
    dispatch({ type: "FAIL", message, code });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    isRunning: state.kind === "running",
    error: state.kind === "error" ? state.message : null,
    result: state.kind === "done" ? state.value : null,
    dataState: state.kind,
    run,
    setError,
    reset,
  };
}
