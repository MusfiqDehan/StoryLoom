"use client";

import { Check, Loader2, Save, User } from "lucide-react";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/studio/PageShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useAsyncFlow } from "@/lib/fsm/useAsyncFlow";

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const flow = useAsyncFlow<void>();

  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name ?? "");
    setLastName(user.last_name ?? "");
    setBio(user.bio ?? "");
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await flow.run(
      () =>
        updateProfile({
          first_name: firstName,
          last_name: lastName,
          bio,
        }),
      { action: "save_profile", fallbackError: "Failed to update profile." },
    );
  };

  return (
    <PageShell title="Profile Settings">
      <div className="max-w-2xl" data-state={flow.dataState}>
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--sl-soft)] sm:h-20 sm:w-20">
            <User className="h-8 w-8 text-[var(--sl-accent)] sm:h-10 sm:w-10" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--sl-ink)]">
              {user?.username}
            </p>
            <p className="truncate text-sm text-[var(--sl-muted)]">
              {user?.email}
            </p>
            <p className="text-xs capitalize text-[var(--sl-muted)]">{user?.role}</p>
          </div>
        </div>

        {flow.state.kind === "done" && (
          <div
            className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            role="status"
          >
            <Check size={16} /> Profile updated successfully.
          </div>
        )}

        {flow.error && (
          <div
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            role="alert"
          >
            {flow.error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--sl-ink)]">
                First Name
              </span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (flow.state.kind !== "idle") flow.reset();
                }}
                className="input-field"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--sl-ink)]">
                Last Name
              </span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (flow.state.kind !== "idle") flow.reset();
                }}
                className="input-field"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--sl-ink)]">
              Bio
            </span>
            <textarea
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                if (flow.state.kind !== "idle") flow.reset();
              }}
              placeholder="Tell us about yourself"
              rows={4}
              className="input-field"
            />
          </label>

          <Button type="submit" disabled={flow.isRunning}>
            {flow.isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {flow.isRunning ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </div>
    </PageShell>
  );
}
