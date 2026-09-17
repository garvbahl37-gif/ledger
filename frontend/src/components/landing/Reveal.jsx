import { cn } from '../../lib/cn'
import { useReveal } from '../../lib/useReveal'

/**
 * A block that announces itself with a rule before its content settles.
 *
 * The chain is short and fixed rather than staggered per child: a long cascade
 * of entrances on every element is the thing that reads as generated. One rule
 * draws, and the block arrives behind it.
 */
export function RuledBlock({ children, className, delay = 0 }) {
  const [ref, shown] = useReveal()
  return (
    <div ref={ref} className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className={cn('absolute -top-px left-0 right-0 h-px bg-rule', shown && 'reveal-rule')}
        style={{ animationDelay: `${delay}ms`, transform: shown ? undefined : 'scaleX(0)' }}
      />
      <div
        className={shown ? 'reveal-entry' : 'opacity-0'}
        style={{ animationDelay: `${delay + 120}ms` }}
      >
        {children}
      </div>
    </div>
  )
}

/** Content that settles into place, with no rule of its own. */
export function Entry({ children, className, delay = 0 }) {
  const [ref, shown] = useReveal()
  return (
    <div
      ref={ref}
      className={cn(shown ? 'reveal-entry' : 'opacity-0', className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}
