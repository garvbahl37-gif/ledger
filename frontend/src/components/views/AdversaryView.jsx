import { useMemo } from 'react'
import { ShieldAlert, ShieldCheck, GitBranch, Ghost, TrendingUp, Globe } from 'lucide-react'
import { cn } from '../../lib/cn'
import Markdown from '../Markdown'
import { useSession } from '../../lib/store'
import { Card } from '../ui/Card'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Stat from '../ui/Stat'

/**
 * What the red team found.
 *
 * The point of showing this screen at all: a system that quietly passed its own
 * audit would be indistinguishable from one that never ran it. Flags are
 * displayed whether or not the rewrite resolved them.
 */

const KINDS = {
  CAUSAL_LANGUAGE: {
    icon: GitBranch,
    label: 'Causal language',
    why: 'The report implied one thing caused another where the test only established an association. Nothing in this pipeline can establish causation.',
  },
  EFFECT_SIZE_OVERSTATEMENT: {
    icon: TrendingUp,
    label: 'Overstated effect',
    why: 'The wording made an effect sound larger than the computed magnitude supports.',
  },
  PHANTOM_FINDING: {
    icon: Ghost,
    label: 'Phantom finding',
    why: 'A relationship was mentioned that has no entry in the registry. This is the failure mode the whole architecture exists to prevent.',
  },
  OVERGENERALIZATION: {
    icon: Globe,
    label: 'Overgeneralisation',
    why: 'A claim about this sample was written as a claim about the population it was drawn from.',
  },
}

const SEVERITY = {
  HIGH:   { label: 'High',   cls: 'bg-error-tint text-error-text ring-error-edge' },
  MEDIUM: { label: 'Medium', cls: 'bg-warn-tint text-warn-text ring-warn-edge' },
  LOW:    { label: 'Low',    cls: 'bg-mist text-slate ring-silver' },
}

export default function AdversaryView({ onNavigate }) {
  const report = useSession((s) => s.report)
  const violations = report?.adversary_violations ?? []

  const bySeverity = useMemo(() => ({
    HIGH:   violations.filter((v) => v.severity === 'HIGH').length,
    MEDIUM: violations.filter((v) => v.severity === 'MEDIUM').length,
    LOW:    violations.filter((v) => v.severity === 'LOW').length,
  }), [violations])

  if (!report) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Nothing has been audited yet"
        body="The red team reads the draft report before you do. Run an analysis to see what it found."
        action={<Button variant="primary" onClick={() => onNavigate?.('setup')}>Load a table</Button>}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header>
        <h2 className="text-[22px] font-bold tracking-tight text-ink">The red team's audit</h2>
        <p className="measure mt-1.5 text-[14px] leading-relaxed text-slate">
          Before the report reached you, an adversarial reader went through it looking for claims
          the statistics do not support. Where it found them, the reporter was sent back to rewrite —
          up to twice. Anything still standing is shown here rather than quietly dropped.
        </p>
      </header>

      <Card className={cn(
        'mt-6 flex flex-wrap items-center gap-4',
        report.report_validated ? 'bg-supported-tint ring-supported-edge' : 'bg-warn-tint ring-warn-edge',
      )}>
        {report.report_validated
          ? <ShieldCheck size={22} className="shrink-0 text-supported-text" aria-hidden="true" />
          : <ShieldAlert size={22} className="shrink-0 text-warn-text" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-[14px] font-semibold',
            report.report_validated ? 'text-supported-text' : 'text-warn-text',
          )}>
            {report.report_validated ? 'Cleared' : 'Emitted with flags'}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-graphite">
            {report.report_validated
              ? `${violations.length === 0 ? 'The draft came back clean.' : `${violations.length} issue${violations.length === 1 ? ' was' : 's were'} raised and resolved in the rewrite.`}`
              : 'The rewrite budget ran out with issues outstanding. Read them before quoting the report.'}
          </p>
        </div>
      </Card>

      {violations.length > 0 && (
        <Card className="mt-4 grid grid-cols-3 gap-5">
          <Stat value={bySeverity.HIGH} label="High" tone={bySeverity.HIGH ? 'error' : 'default'} />
          <Stat value={bySeverity.MEDIUM} label="Medium" tone={bySeverity.MEDIUM ? 'warn' : 'default'} />
          <Stat value={bySeverity.LOW} label="Low" />
        </Card>
      )}

      {violations.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={ShieldCheck}
            title="No violations recorded"
            body="The draft contained no causal language, no overstated effects and no findings outside the registry."
            className="py-10"
          />
        </Card>
      ) : (
        <ol className="mt-5 space-y-3">
          {violations.map((v, i) => {
            const kind = KINDS[v.violation_type] ?? {
              icon: ShieldAlert, label: v.violation_type, why: '',
            }
            const sev = SEVERITY[v.severity] ?? SEVERITY.LOW
            const Icon = kind.icon

            return (
              <Card key={i} flush className="overflow-hidden">
                <div className="flex items-start gap-3 border-b border-silver-sub px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mist ring-1 ring-silver">
                    <Icon size={15} className="text-graphite" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[13.5px] font-semibold text-ink">{kind.label}</h3>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                        sev.cls,
                      )}>
                        {sev.label} severity
                      </span>
                    </div>
                    {kind.why && (
                      <p className="mt-1 text-[12px] leading-relaxed text-slate">{kind.why}</p>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3.5">
                  <p className="text-[10.5px] font-medium tracking-wide text-slate">THE SENTENCE</p>
                  <blockquote className="mt-1.5 border-l-2 border-error-edge pl-3 text-[13.5px] leading-relaxed text-ink">
                    {v.sentence}
                  </blockquote>

                  {v.explanation && (
                    <>
                      <p className="mt-3.5 text-[10.5px] font-medium tracking-wide text-slate">
                        WHY IT WAS FLAGGED
                      </p>
                      <div className="mt-1 text-[13px] leading-relaxed text-graphite">
                        <Markdown text={v.explanation} />
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </ol>
      )}
    </div>
  )
}
