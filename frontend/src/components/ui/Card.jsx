import { cn } from '../../lib/cn'

/**
 * A surface.
 *
 * Three variants rather than one, because giving every block the same border,
 * radius and shadow is what makes an interface read as a template. The rule
 * here follows the design system: information density comes from weight and
 * contrast, not from drawing a box around everything.
 *
 *   elevated  a genuine object that sits above the page   (default)
 *   flat      grouped content that needs an edge, not lift
 *   inset     a well, for content that belongs *inside* something
 */
const SURFACES = {
  elevated: 'bg-paper ring-1 ring-silver/80 shadow-card',
  flat:     'bg-paper ring-1 ring-silver/70',
  inset:    'bg-mist ring-1 ring-silver/60',
}

export function Card({ className, flush, variant = 'elevated', children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl',
        SURFACES[variant] ?? SURFACES.elevated,
        !flush && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, hint, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        {hint && <p className="measure mt-1 text-[13px] leading-relaxed text-slate">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
