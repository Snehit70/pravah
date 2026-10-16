import type { AppPage } from "./TopNavbar";
import { TopNavbar } from "./TopNavbar";
import { readWorkspacePage } from "../lib/workspacePage";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";
import { LoadingRegion, SkeletonBlock as Block } from "./ui/Skeleton";
import { PageSkeleton } from "./loading/PageSkeleton";

function TimelineSkeleton() {
  return <div className="flex h-full min-w-0 flex-col" data-skeleton-page="timeline">
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-56 shrink-0 flex-col border-r border-line-subtle bg-[var(--color-bg-surface)]">
        <div className="border-b border-line-subtle px-4 py-4"><Block width={80} height={10} /><Block width={130} height={32} className="mt-2" /><Block width={150} className="mt-6" /><Block height={4} className="mt-2" /></div>
        <div className="px-4 py-4"><Block width={130} height={44} /><Block width={90} className="mt-6" /></div>
        <div className="mt-auto p-3"><Block height={38} /><Block width={80} className="mx-auto mt-3" /></div>
      </div>
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {Array.from({ length: 7 }, (_, day) => <div key={day} className="shrink-0 border-r border-line-subtle" style={{ width: TIMELINE_COL_WIDTH }}>
          <div className="flex h-[60px] items-center gap-2 border-b border-line-subtle px-3"><Block width={30} height={10} /><Block width={30} height={25} /></div>
          <div className="min-h-60 space-y-2 p-2">{Array.from({ length: day % 2 === 0 ? 2 : 1 }, (_, row) => <div key={row} className="rounded-[10px] border border-line-subtle bg-[var(--color-bg-elevated)] p-3"><Block width={row === 0 ? "80%" : "60%"} height={12} /><Block width={60} className="mt-2" /></div>)}</div>
          <div className="border-t border-dashed border-line-subtle p-3"><Block width="65%" /><Block width="45%" className="mt-3" /></div>
        </div>)}
      </div>
    </div>
    <div className="flex h-7 shrink-0 items-center border-t border-line-subtle bg-[var(--color-bg-surface)] px-4"><Block width={100} height={8} /></div>
  </div>;
}

function InboxSkeleton() {
  return <div className="flex w-[300px] shrink-0 flex-col border-l border-line-subtle bg-[var(--color-bg-surface)]" data-skeleton-inbox="true">
    <div className="border-b border-line-subtle px-4 py-4"><Block width={90} height={18} /><Block width={180} height={9} className="mt-2" /></div>
    <div className="border-b border-line-subtle p-3"><Block height={34} /><div className="mt-2 flex gap-1">{[0, 1, 2, 3, 4].map((item) => <Block key={item} width={42} height={22} />)}</div></div>
    <div className="flex-1 space-y-2 overflow-hidden p-3">{Array.from({ length: 8 }, (_, row) => <div key={row} className="rounded-[10px] border border-line-subtle bg-[var(--color-bg-elevated)] p-3"><Block width={`${85 - row % 3 * 15}%`} height={12} /><Block width="60%" className="mt-2" /></div>)}</div>
    <div className="border-t border-line-subtle p-3"><Block height={40} /></div>
  </div>;
}

export function LoadingSkeleton({ page = readWorkspacePage() }: { page?: AppPage } = {}) {
  return <LoadingRegion label={`Loading ${page} workspace`} className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg-base)] text-ink">
    <TopNavbar activePage={page} onNavigate={() => {}} disabled />
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1">{page === "timeline" ? <TimelineSkeleton /> : <PageSkeleton page={page} />}</div>
      {(page === "timeline" || page === "insights") && <InboxSkeleton />}
    </div>
  </LoadingRegion>;
}
