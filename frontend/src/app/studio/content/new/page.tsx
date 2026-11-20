"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useAsyncFlow } from "@/lib/fsm/useAsyncFlow";
import { createArticle } from "@/lib/studio-api";

export default function NewArticlePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const flow = useAsyncFlow<string>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const slug = await flow.run(
      async () => {
        const article = await createArticle({
          title: title.trim(),
          content: { blocks: [] },
        });
        return article.slug;
      },
      { action: "create", fallbackError: "Could not create the article." },
    );
    if (slug) {
      router.replace(`/studio/content/${encodeURIComponent(slug)}`);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-10" data-state={flow.dataState}>
      <h1 className="mb-1 font-display text-2xl font-bold text-[var(--sl-ink)]">
        New article
      </h1>
      <p className="mb-6 text-sm text-[var(--sl-muted)]">
        Give it a working title. Everything else happens in the editor.
      </p>

      <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[var(--sl-ink)]">
            Title
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="How neural machine translation works"
            className="input-field"
            maxLength={300}
          />
        </label>

        {flow.error && (
          <p className="text-sm text-red-600" role="alert">
            {flow.error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={flow.isRunning || !title.trim()}>
            {flow.isRunning && <Loader2 size={15} className="animate-spin" />}
            Create draft
          </Button>
        </div>
      </form>
    </div>
  );
}
