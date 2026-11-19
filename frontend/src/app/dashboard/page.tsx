"use client";

import { BookOpen, Eye, FileText } from "lucide-react";

import { PageShell, QueryState } from "@/components/studio/PageShell";
import { useStudioQuery } from "@/components/studio/useStudioQuery";
import { useAuth } from "@/lib/auth";
import { listArticles } from "@/lib/studio-api";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats, loading, error } = useStudioQuery(async () => {
    const [all, published, recent] = await Promise.all([
      listArticles({ page_size: 1 }),
      listArticles({ page_size: 1, status: "published" }),
      listArticles({ page_size: 100 }),
    ]);
    return {
      total: all.count,
      published: published.count,
      views: recent.results.reduce((sum, a) => sum + (a.views_count || 0), 0),
    };
  }, []);

  return (
    <PageShell
      title={`Welcome back${user?.first_name || user?.username ? `, ${user?.first_name || user?.username}` : ""}!`}
      description="Here is an overview of your activity."
    >
      <QueryState loading={loading} error={error} isEmpty={false} empty={null}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
          <StatCard
            icon={<FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            value={stats?.total ?? 0}
            label="Total Articles"
          />
          <StatCard
            icon={<BookOpen className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            value={stats?.published ?? 0}
            label="Published"
          />
          <StatCard
            icon={<Eye className="h-6 w-6 text-purple-600 dark:text-purple-400" />}
            iconBg="bg-purple-100 dark:bg-purple-900/30"
            value={(stats?.views ?? 0).toLocaleString()}
            label="Total Views"
          />
        </div>
      </QueryState>
    </PageShell>
  );
}

function StatCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: number | string;
  label: string;
}) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div className={`rounded-xl p-3 ${iconBg}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-[var(--sl-ink)] tabular-nums">{value}</p>
          <p className="text-sm text-[var(--sl-muted)]">{label}</p>
        </div>
      </div>
    </div>
  );
}
