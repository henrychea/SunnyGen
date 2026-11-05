import { createFileRoute, Link } from '@tanstack/react-router'
import { APP_NAME } from '@sunnygen/core'
import { Badge, Card } from '@sunnygen/ui'
import { ArrowUpRight, Images, LayoutGrid, MessageSquare, Shirt, Upload } from 'lucide-react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { GalleryCard } from '~/components/gallery-card'
import { loadDashboard } from '~/server/dashboard.functions'

export const Route = createFileRoute('/')({
  loader: () => loadDashboard(),
  component: HomePage,
})

function HomePage() {
  const data = Route.useLoaderData()

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome to ${APP_NAME}`}
        description="Local-first image and video studio. Your models, keys, and renders stay on this machine."
        actions={
          <Badge tone={data.configuredProviders > 0 ? 'success' : 'warning'}>
            {data.configuredProviders > 0
              ? `${data.configuredProviders} provider${data.configuredProviders === 1 ? '' : 's'} ready`
              : 'Add a provider key'}
          </Badge>
        }
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="relative overflow-hidden p-6">
            <div
              className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full opacity-70 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(163,22,33,0.18), transparent 65%)' }}
            />
            <p className="text-accent/75 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
              Start here
            </p>
            <h2 className="font-display mt-2 max-w-md text-[28px] font-semibold leading-[1.08] tracking-tight">
              Make the next frame.
            </h2>
            <p className="text-ink/50 mt-2 max-w-md text-[12.5px] leading-relaxed">
              Build a pipeline on the canvas, or let Studio dress an avatar for a full lookbook.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/canvas"
                className="bg-accent inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[12.5px] font-medium text-white"
              >
                <LayoutGrid size={14} /> Open canvas
              </Link>
              <Link
                to="/studio"
                className="border-line bg-surface inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[12.5px] font-medium"
              >
                <Shirt size={14} /> Build a look
              </Link>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Renders"
              value={data.renders}
              detail={`${data.images} images · ${data.videos} videos`}
            />
            <Stat label="Assets" value={data.assets} detail="uploads and references" />
            <Stat label="Avatars" value={data.avatars} detail={`${data.garments} garments`} />
            <Stat
              label="Libraries"
              value={data.poses + data.scenes}
              detail={`${data.poses} poses · ${data.scenes} scenes`}
            />
          </div>
        </div>

        <div className="mt-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-[17px] font-semibold tracking-tight">Recent renders</h2>
            <p className="text-ink/45 mt-1 text-[12px]">The last six finished generations.</p>
          </div>
          <Link
            to="/gallery"
            className="text-ink/50 hover:text-ink inline-flex items-center gap-1 text-[11.5px] font-medium"
          >
            View gallery <ArrowUpRight size={12} />
          </Link>
        </div>

        {data.recent.length === 0 ? (
          <div className="border-line bg-surface/40 mt-4 rounded-2xl border border-dashed px-6 py-12 text-center">
            <p className="text-ink/45 text-[12.5px]">Nothing rendered yet. The canvas is waiting.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {data.recent.map((item) => (
              <GalleryCard key={item.id} item={item} onOpen={() => undefined} />
            ))}
          </div>
        )}

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink to="/gallery" icon={Images} label="Gallery" detail="Every finished render" />
          <QuickLink to="/assets" icon={Upload} label="Assets" detail="Uploads and references" />
          <QuickLink to="/studio" icon={Shirt} label="Studio" detail="Avatars, wardrobe, looks" />
          <QuickLink to="/chat" icon={MessageSquare} label="Assistant" detail="Prompt help and ideas" />
        </div>
      </PageBody>
    </PageScroll>
  )
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <Card className="flex flex-col justify-between p-4">
      <p className="text-ink/40 text-[10px] font-semibold uppercase tracking-[0.1em]">{label}</p>
      <div>
        <p className="font-display text-[26px] font-semibold leading-none tracking-tight">{value}</p>
        <p className="text-ink/40 mt-1.5 text-[10.5px]">{detail}</p>
      </div>
    </Card>
  )
}

function QuickLink({
  to,
  icon: Icon,
  label,
  detail,
}: {
  to: string
  icon: typeof Images
  label: string
  detail: string
}) {
  return (
    <Link
      to={to}
      className="border-line bg-surface hover:border-ink/20 group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors"
    >
      <span className="bg-accent/[0.07] text-accent grid size-8 place-items-center rounded-lg">
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="text-ink/80 block text-[12px] font-medium">{label}</span>
        <span className="text-ink/40 block truncate text-[10.5px]">{detail}</span>
      </span>
      <ArrowUpRight size={13} className="text-ink/25 group-hover:text-ink/55 ml-auto transition-colors" />
    </Link>
  )
}
