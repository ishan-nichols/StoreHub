import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  stats,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <section className="glass-panel motion-card rounded-[36px] p-6 md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-stone-950 md:text-5xl">{title}</h1>
          <p className="mt-3 text-base leading-7 text-stone-600 md:text-lg">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
      {stats && <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stats}</div>}
    </section>
  );
}

export function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="motion-card rounded-[24px] bg-white/72 p-4">
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-400">{hint}</div>}
    </div>
  );
}

export function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`soft-panel motion-card rounded-[32px] p-5 md:p-6 ${className}`}>{children}</section>;
}

export function SectionTitle({ title, description, aside }: { title: string; description?: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {aside}
    </div>
  );
}

export function ActionPill({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="motion-button inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-white"
    >
      {children}
    </Tag>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f1e7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_24%),linear-gradient(180deg,_#fbf7f1_0%,_#efe6d8_100%)]" />
      <div className="premium-grid absolute inset-0 opacity-35" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="glass-panel motion-card rounded-[32px] p-6 sm:p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                StoreHub
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-stone-950">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-stone-500">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
