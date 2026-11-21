"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import api from "./api";
import type { AuthTokens, LoginCredentials, RegisterData, User } from "./types";

export type AuthMachineState =
  | { kind: "bootstrapping"; user: User | null; tokens: AuthTokens | null }
  | { kind: "authenticated"; user: User; tokens: AuthTokens }
  | { kind: "unauthenticated" };

type AuthEvent =
  | { type: "HYDRATE_CACHED"; user: User | null; tokens: AuthTokens }
  | { type: "AUTHENTICATE"; user: User; tokens?: AuthTokens }
  | { type: "UPDATE_USER"; user: User }
  | { type: "UNAUTHENTICATE" };

function authReducer(state: AuthMachineState, event: AuthEvent): AuthMachineState {
  switch (event.type) {
    case "HYDRATE_CACHED":
      return { kind: "bootstrapping", user: event.user, tokens: event.tokens };
    case "AUTHENTICATE": {
      const tokens =
        event.tokens ?? (state.kind !== "unauthenticated" ? state.tokens : null);
      if (!tokens) return { kind: "unauthenticated" };
      return { kind: "authenticated", user: event.user, tokens };
    }
    case "UPDATE_USER":
      if (state.kind !== "authenticated") return state;
      return { ...state, user: event.user };
    case "UNAUTHENTICATE":
      return { kind: "unauthenticated" };
  }
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  tokens: AuthTokens | null;
  authState: AuthMachineState["kind"];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    kind: "bootstrapping",
    user: null,
    tokens: null,
  });

  const fetchProfile = useCallback(async (tokensOverride?: AuthTokens) => {
    try {
      const response = await api.get<User>("/auth/profile/");
      localStorage.setItem("user", JSON.stringify(response.data));
      dispatch({
        type: "AUTHENTICATE",
        user: response.data,
        tokens: tokensOverride,
      });
    } catch {
      localStorage.removeItem("tokens");
      localStorage.removeItem("user");
      dispatch({ type: "UNAUTHENTICATE" });
    }
  }, []);

  useEffect(() => {
    const storedTokens = safeParseJson<AuthTokens>(localStorage.getItem("tokens"));
    const storedUser = safeParseJson<User>(localStorage.getItem("user"));

    if (!storedTokens?.access) {
      localStorage.removeItem("tokens");
      localStorage.removeItem("user");
      dispatch({ type: "UNAUTHENTICATE" });
      return;
    }

    dispatch({ type: "HYDRATE_CACHED", user: storedUser, tokens: storedTokens });
    void fetchProfile(storedTokens);
  }, [fetchProfile]);

  const login = async (credentials: LoginCredentials) => {
    const response = await api.post("/auth/login/", credentials);
    const { access, refresh } = response.data;
    const newTokens = { access, refresh };
    localStorage.setItem("tokens", JSON.stringify(newTokens));
    await fetchProfile(newTokens);
  };

  const register = async (data: RegisterData) => {
    const response = await api.post("/auth/register/", data);
    const { tokens: newTokens, user: newUser } = response.data;
    localStorage.setItem("tokens", JSON.stringify(newTokens));
    localStorage.setItem("user", JSON.stringify(newUser));
    dispatch({ type: "AUTHENTICATE", user: newUser, tokens: newTokens });
  };

  const logout = async () => {
    const currentRefresh = state.kind !== "unauthenticated" ? state.tokens?.refresh : undefined;
    try {
      if (currentRefresh) {
        await api.post("/auth/logout/", { refresh: currentRefresh });
      }
    } catch {
      // Ignore logout network errors; always clear local credentials.
    } finally {
      localStorage.removeItem("tokens");
      localStorage.removeItem("user");
      dispatch({ type: "UNAUTHENTICATE" });
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    const response = await api.patch<User>("/auth/profile/", data);
    localStorage.setItem("user", JSON.stringify(response.data));
    dispatch({ type: "UPDATE_USER", user: response.data });
  };

  const user = state.kind === "unauthenticated" ? null : state.user;
  const tokens = state.kind === "unauthenticated" ? null : state.tokens;

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        authState: state.kind,
        isLoading: state.kind === "bootstrapping",
        isAuthenticated: state.kind === "authenticated" || (state.kind === "bootstrapping" && !!state.user),
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
