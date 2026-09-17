import { cn } from '../../lib/cn'

/**
 * A figure and its label.
 *
 * The figure is set in the mono face at a large optical size. That is not a
 * stylistic tic: these are measurements, they are frequently compared down a
 * column, and tabular figures keep the digits aligned. A proportional sans
 * would shuffle them about and make two numbers harder to compare than they
 * need to be.
 */
export default function Stat({ value, label, hint, tone = 'default', icon: Icon, className }) {
  const tones = {
    default:   'text-ink',
    brand:     'text-brand-text',
    supported: 'text-supported-text',
    rejected:  'text-slate',
    error:     'text-error-text',
    warn:      'text-warn-text',
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'font-mono text-[30px] font-medium leading-none tracking-[-0.045em]',
            tones[tone],
          )}
          style={{ fontFeatureSettings: "'tnum' 1, 'zero' 1" }}
        >
          {value}
        </span>
        {Icon && <Icon size={13} className="shrink-0 text-slate/70" aria-hidden="true" />}
      </div>
      <div className="mt-2.5 text-[12.5px] font-medium tracking-[-0.01em] text-graphite">
        {label}
      </div>
      {hint && (
        <div className="mt-1 text-[11.5px] leading-snug text-slate/90">{hint}</div>
      )}
    </div>
  )
}
