import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileDown, FileCode, NotebookPen, Link as LinkIcon, ShieldCheck, ShieldAlert,
  Search, SlidersHorizontal, Fingerprint,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/store'
import { linkClaims } from '../../lib/report'
import { formatInt, formatDuration, pct } from '../../lib/format'
import * as api from '../../lib/api'
import LedgerCard from '../LedgerCard'
import BHStaircase from '../charts/BHStaircase'
import EffectForest from '../charts/EffectForest'
import PValueHistogram from '../charts/PValueHistogram'
import Donut from '../charts/Donut'
import Button from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import Stat from '../ui/Stat'
import CopyButton from '../ui/CopyButton'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'

const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'SUPPORTED', label: 'Supported' },
  { id: 'REJECTED',  label: 'Not supported' },
  { id: 'ERROR',     label: 'Failed to run' },
]

export default function DashboardView({ onNavigate }) {
  const report   = useSession((s) => s.report)
  const loading  = useSession((s) => s.reportLoading)
  const sessionId= useSession((s) => s.sessionId)
  const activeClaim = useSession((s) => s.activeClaim)
  const setActiveClaim = useSession((s) => s.setActiveClaim)

  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const proseRef = useRef(null)

  const entries = report?.ledger_entries ?? []

  const counts = useMemo(() => ({
    total:     entries.length,
    supported: entries.filter((e) => e.status === 'SUPPORTED').length,
    rejected:  entries.filter((e) => e.status === 'REJECTED').length,
    error:     entries.filter((e) => e.status === 'ERROR').length,
  }), [entries])

  const { html, linked, total: sentences } = useMemo(() => {
    if (!report?.report_html) return { html: '', linked: 0, total: 0 }
    try {
      return linkClaims(report.report_html, entries)
    } catch {
      return { html: '', linked: 0, total: 0 }
    }
  }, [report?.report_html, entries])

  // Clicking a sentence opens the entry that licensed it.
  useEffect(() => {
    const node = proseRef.current
    if (!node) return

    const open = (id) => {
      if (!id) return
      setActiveClaim(id)
      const card = document.getElementById(`ledger-${id}`)
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const button = card.querySelector('button[aria-expanded="false"]')
        button?.click()
      }
    }

    const onClick = (e) => {
      const claim = e.target.closest?.('.claim')
      if (claim) open(claim.dataset.claim)
    }
    const onKey = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const claim = e.target.closest?.('.claim')
      if (claim) { e.preventDefault(); open(claim.dataset.claim) }
    }

    node.addEventListener('click', onClick)
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('click', onClick)
      node.removeEventListener('keydown', onKey)
    }
  }, [html, setActiveClaim])

  // Reflect which claim is active.
  useEffect(() => {
    const node = proseRef.current
    if (!node) return
    node.querySelectorAll('.claim').forEach((el) => {
      el.dataset.active = String(el.dataset.claim === activeClaim)
    })
  }, [activeClaim, html])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (filter !== 'all' && e.status !== filter) return false
      if (!q) return true
      return (
        e.statement.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.statistical_result?.test_name?.toLowerCase().includes(q) ||
        e.columns_involved?.some((c) => c.toLowerCase().includes(q))
      )
    })
  }, [entries, filter, query])

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }

  if (!report) {
    return (
      <EmptyState
        icon={Search}
        title="No analysis yet"
        body="Load a table and run the pipeline. The report and its ledger appear here once the red team has signed off."
        action={<Button variant="primary" onClick={() => onNavigate?.('setup')}>Load a table</Button>}
      />
    )
  }

  const donutData = [
    { name: 'Supported',     value: counts.supported, fill: 'var(--color-supported)' },
    { name: 'Not supported', value: counts.rejected,  fill: 'var(--color-muted-mark)' },
    { name: 'Failed to run', value: counts.error,     fill: 'var(--color-error)' },
  ].filter((d) => d.value > 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* ── Verdict banner ──────────────────────────────────── */}
      <div className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl p-4 ring-1',
        report.report_validated
          ? 'bg-supported-tint ring-supported-edge'
          : 'bg-warn-tint ring-warn-edge',
      )}>
        {report.report_validated
          ? <ShieldCheck size={20} className="shrink-0 text-supported-text" aria-hidden="true" />
          : <ShieldAlert size={20} className="shrink-0 text-warn-text" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-[13.5px] font-semibold',
            report.report_validated ? 'text-supported-text' : 'text-warn-text',
          )}>
            {report.report_validated
              ? 'The red team cleared this report'
              : `The red team left ${report.adversary_violations?.length ?? 0} flag${report.adversary_violations?.length === 1 ? '' : 's'} on this report`}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-graphite">
            {report.report_validated
              ? 'No causal language, overstated effects or phantom findings survived the audit.'
              : 'The flags are shown rather than hidden — read them before you quote anything here.'}
          </p>
        </div>
        {!report.report_validated && (
          <Button variant="secondary" size="sm" onClick={() => onNavigate?.('adversary')}>
            See the flags
          </Button>
        )}
      </div>

      {/* ── The numbers ─────────────────────────────────────── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto]">
        <Card className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat value={counts.total} label="Registered" hint="Fixed before any test ran" />
          <Stat value={counts.supported} label="Supported" tone="supported" hint={`${pct(counts.supported, counts.total)} of the registry`} />
          <Stat value={counts.rejected} label="Not supported" tone="rejected" hint="Kept, not discarded" />
          <Stat
            value={sentences ? pct(linked, sentences) : '—'}
            label="Groundedness"
            tone={linked === sentences && sentences > 0 ? 'supported' : 'warn'}
            hint={`${linked}/${sentences} sentences trace to an entry`}
          />
        </Card>

        {donutData.length > 0 && (
          <Card className="flex items-center justify-center">
            <Donut
              data={donutData}
              config={{
                Supported:       { label: 'Supported' },
                'Not supported': { label: 'Not supported' },
                'Failed to run': { label: 'Failed to run' },
              }}
              centerValue={counts.total}
              centerLabel="registered"
              size={158}
            />
          </Card>
        )}
      </div>

      {/* ── The report ──────────────────────────────────────── */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card flush className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-silver px-5 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-ink">The report</h2>
              {linked > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[10.5px] font-medium text-brand-text">
                  <LinkIcon size={9} aria-hidden="true" />
                  {linked} linked {linked === 1 ? 'claim' : 'claims'}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => window.open(api.pdfUrl(sessionId), '_blank')}>
                <FileDown size={13} /> PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open(api.reportUrl(sessionId), '_blank')}>
                <FileCode size={13} /> HTML
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open(api.notebookUrl(sessionId), '_blank')}>
                <NotebookPen size={13} /> Notebook
              </Button>
            </div>
          </div>

          {linked > 0 && (
            <p className="border-b border-silver-sub bg-mist px-5 py-2 text-[12px] leading-relaxed text-slate">
              Sentences with a dotted underline trace to a ledger entry. Click one to open the code,
              the assumptions and the test behind it.
            </p>
          )}

          <div
            ref={proseRef}
            className={cn(
              'measure px-5 py-6 text-[14.5px] leading-[1.75] text-graphite',
              '[&_h1]:mb-3 [&_h1]:text-[21px] [&_h1]:text-ink',
              '[&_h2]:mb-2.5 [&_h2]:mt-7 [&_h2]:text-[17px] [&_h2]:text-ink',
              '[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-[15px] [&_h3]:text-ink',
              '[&_p]:mb-4',
              '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5',
              '[&_li]:mb-1.5',
              '[&_code]:rounded [&_code]:bg-fog [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
              '[&_table]:mb-4 [&_table]:w-full [&_table]:text-[13px]',
              '[&_th]:border-b [&_th]:border-silver [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink',
              '[&_td]:border-b [&_td]:border-silver-sub [&_td]:py-1.5',
              '[&_blockquote]:border-l-2 [&_blockquote]:border-silver [&_blockquote]:pl-3 [&_blockquote]:text-slate',
              '[&_a]:text-brand-text [&_a]:underline',
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>

        {/* ── Provenance rail ─────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <div className="flex items-center gap-1.5">
              <Fingerprint size={13} className="text-slate" aria-hidden="true" />
              <h3 className="text-[12.5px] font-semibold text-ink">Reproducibility</h3>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate">
              The same table through the same pipeline produces this hash again. A different one
              means something changed.
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 rounded-lg bg-mist px-2 py-1.5 ring-1 ring-silver">
              <code className="truncate font-mono text-[11px] text-graphite">
                {report.reproducibility_hash}
              </code>
              <CopyButton value={report.reproducibility_hash} label="" size={11} />
            </div>
          </Card>

          {report.dataset && (
            <Card>
              <h3 className="text-[12.5px] font-semibold text-ink">The table</h3>
              <dl className="mt-2 space-y-1.5 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate">File</dt>
                  <dd className="truncate font-mono text-graphite">{report.dataset.filename}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate">Rows</dt>
                  <dd className="tnum font-mono text-graphite">{formatInt(report.dataset.n_rows)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate">Columns</dt>
                  <dd className="tnum font-mono text-graphite">{formatInt(report.dataset.n_cols)}</dd>
                </div>
                {report.agent_timings && (
                  <div className="flex justify-between">
                    <dt className="text-slate">Wall clock</dt>
                    <dd className="tnum font-mono text-graphite">
                      {formatDuration(Object.values(report.agent_timings).reduce((a, b) => a + b, 0))}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          )}
        </aside>
      </div>

      {/* ── The evidence ────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">How the cut was made</h2>
        <p className="measure mt-1 text-[13.5px] leading-relaxed text-slate">
          Three views of the same family of tests: which survived correction, how large the effects
          are, and whether the p-values look like signal or like noise.
        </p>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Benjamini–Hochberg correction"
              hint="Every registered hypothesis, sorted by p-value, against the critical line."
            />
            <div className="mt-4">
              <BHStaircase entries={entries} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Effect sizes" hint="Magnitude, ordered. Significance alone is not a finding." />
            <div className="mt-4">
              <EffectForest entries={entries} />
            </div>
          </Card>

          <Card>
            <CardHeader title="p-value distribution" hint="Under a true null this is flat." />
            <div className="mt-4">
              <PValueHistogram entries={entries} />
            </div>
          </Card>
        </div>
      </section>

      {/* ── The ledger ──────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">The ledger</h2>
            <p className="mt-1 text-[13.5px] text-slate">
              All {counts.total} registered hypotheses, including the ones that failed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by statement, test or column"
                aria-label="Filter ledger entries"
                className="w-60 rounded-lg border border-silver bg-paper py-1.5 pl-8 pr-3 text-[12.5px] text-ink outline-none transition-colors placeholder:text-slate/60 focus:border-brand"
              />
            </div>

            <div className="flex rounded-lg bg-fog p-0.5" role="group" aria-label="Filter by verdict">
              {FILTERS.map((f) => {
                const n = f.id === 'all' ? counts.total
                  : f.id === 'SUPPORTED' ? counts.supported
                  : f.id === 'REJECTED' ? counts.rejected : counts.error
                if (n === 0 && f.id !== 'all') return null
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={cn(
                      'rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-all',
                      filter === f.id ? 'bg-paper text-ink shadow-hair' : 'text-slate hover:text-ink',
                    )}
                  >
                    {f.label} <span className="tnum text-slate">{n}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {visible.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title="Nothing matches that filter"
              body="Clear the search or pick a different verdict."
              action={
                <Button variant="secondary" size="sm" onClick={() => { setQuery(''); setFilter('all') }}>
                  Show all {counts.total}
                </Button>
              }
            />
          ) : (
            visible.map((entry) => (
              <LedgerCard
                key={entry.id}
                entry={entry}
                highlighted={activeClaim === entry.id}
                onOpen={setActiveClaim}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
