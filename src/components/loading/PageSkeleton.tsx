import type { AppPage } from "../TopNavbar";
import { LoadingRegion, SkeletonBlock as Block } from "../ui/Skeleton";

export function GoalTaskListSkeleton({ readOnly = false }: { readOnly?: boolean }) {
  return <LoadingRegion label="Loading linked tasks" className="py-4">
    <Block width={120} />
    <Block width={160} height={18} className="mb-3 mt-6" />
    {[0, 1, 2].map((row) => <div key={row} className="flex flex-wrap items-center gap-3 border-b border-line-subtle py-3">
      {!readOnly && <Block width={44} height={44} className="shrink-0" />}
      <div className="min-w-0 flex-1 basis-48 space-y-2"><Block width={`${70 - row * 10}%`} height={14} /><Block width={90} /></div>
      {!readOnly && <Block width={220} height={44} />}
    </div>)}
    <Block width={175} height={18} className="mb-3 mt-8" />
    <div className="space-y-4"><Block width="60%" /><Block width="45%" /></div>
  </LoadingRegion>;
}

export function PageSkeleton({ page }: { page: Exclude<AppPage, "timeline"> }) {
  return <LoadingRegion label={`Loading ${page}`} className="h-full overflow-hidden bg-[var(--color-bg-base)]">
    {page === "goals" ? <GoalsSkeleton /> : page === "insights" ? <InsightsSkeleton /> : <SettingsSkeleton />}
  </LoadingRegion>;
}

function GoalsSkeleton() {
  return <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6" data-skeleton-page="goals">
    <Block width={100} height={44} className="mb-3 ml-auto" />
    <Block width={165} height={14} /><Block width={260} className="mb-5 mt-2" />
    <div className="mb-5 flex flex-wrap gap-3"><Block width="40%" height={44} className="min-w-32 flex-1" /><Block width={230} height={44} /><Block width={130} height={44} /></div>
    <Block height={64} className="mb-5" />
    {[0, 1, 2].map((row) => <div key={row} className="border-t border-line-subtle py-5">
      <div className="flex flex-wrap justify-between gap-4"><div className="min-w-0 flex-1 basis-64"><Block width={`${65 - row * 10}%`} height={22} /><Block width="75%" className="mt-3" /><Block width={150} className="mt-3" /></div><Block width={220} height={44} /></div>
      <Block height={4} className="mt-4" /><Block width="55%" className="mt-4" />
    </div>)}
  </div>;
}

function InsightsSkeleton() {
  return <div className="mx-auto w-full max-w-5xl px-6 pt-5" data-skeleton-page="insights">
    <div className="mb-6 flex flex-wrap justify-between gap-3"><Block width={220} /><Block width={165} height={36} /></div>
    <Block width={150} className="mb-3" />
    <div className="rounded-2xl border border-line-subtle bg-[var(--color-bg-elevated)] p-5">
      <div className="mb-6 flex gap-10">{[0, 1, 2].map((item) => <div key={item} className="min-w-0 flex-1 space-y-3"><Block width={75} /><Block width={90} height={28} /></div>)}</div>
      <Block height={180} />
    </div>
    <Block width={160} className="mb-3 mt-8" />
    <div className="rounded-2xl border border-line-subtle bg-[var(--color-bg-elevated)] p-5"><Block height={130} /></div>
    <Block width={140} className="mb-3 mt-8" /><Block height={120} />
  </div>;
}

function SettingsSkeleton() {
  return <div className="mx-auto w-full px-7 py-6" style={{ maxWidth: 1120 }} data-skeleton-page="settings">
    <div className="mb-5 flex items-center gap-3"><Block width={36} height={36} /><div className="flex-1 space-y-2"><Block width={110} height={24} /><Block width={210} height={9} /></div><Block width={36} height={36} /></div>
    <div className="grid items-start gap-4" style={{ gridTemplateColumns: "288px minmax(0, 1fr)" }}>
      <div className="overflow-hidden rounded-[14px] border border-line-subtle bg-[var(--color-bg-elevated)]">{Array.from({ length: 9 }, (_, row) => <div key={row} className="flex items-center gap-3 border-b border-line-subtle p-4"><Block width={32} height={32} /><div className="min-w-0 flex-1 space-y-2"><Block width="65%" height={14} /><Block width="85%" height={9} /></div></div>)}</div>
      <div className="min-w-0 space-y-4"><Block width={160} height={24} /><Block width="70%" /><div className="rounded-[14px] border border-line-subtle bg-[var(--color-bg-elevated)] p-5"><Block width="40%" height={16} /><Block height={44} className="mt-5" /><Block height={44} className="mt-4" /><Block width={100} height={40} className="mt-5" /></div></div>
    </div>
  </div>;
}
