"use client";

import { Calendar, Edit2, Eye, Plus } from "lucide-react";
import Link from "next/link";

import { PageShell, QueryState } from "@/components/studio/PageShell";
import { StatusBadge } from "@/components/studio/StatusBadge";
import { useStudioQuery } from "@/components/studio/useStudioQuery";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { listArticles } from "@/lib/studio-api";

export default function MyArticlesPage() {
  const { user } = useAuth();
  const { data, loading, error } = useStudioQuery(
    () =>
      user
        ? listArticles({ author: user.id, page_size: 50, ordering: "-updated_at" })
        : Promise.resolve({ count: 0, next: null, previous: null, results: [] }),
    [user?.id],
  );
  const articles = data?.results ?? [];

  return (
    <PageShell
      title="My Articles"
      actions={
        <Button asChild size="sm">
          <Link href="/studio/content/new">
            <Plus size={15} /> New article
          </Link>
        </Button>
      }
    >
      <QueryState
        loading={loading}
        error={error}
        isEmpty={articles.length === 0}
        empty="You haven't written any articles yet."
      >
        <div className="space-y-3">
          {articles.map((article) => (
            <div key={article.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/articles/${article.slug}`}
                    className="block truncate text-base font-semibold text-[var(--sl-ink)] transition hover:text-[var(--sl-accent)] sm:text-lg"
                  >
                    {article.title || "Untitled"}
                  </Link>
                  {article.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--sl-muted)]">
                      {article.excerpt}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-[var(--sl-muted)]">
                    <StatusBadge status={article.status} />
                    <span className="flex items-center gap-1 tabular-nums">
                      <Eye className="h-3.5 w-3.5" />
                      {article.views_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(article.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" asChild aria-label={`Edit ${article.title}`}>
                  <Link href={`/studio/content/${encodeURIComponent(article.slug)}`}>
                    <Edit2 className="h-4 w-4 text-[var(--sl-muted)]" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </QueryState>
    </PageShell>
  );
}
