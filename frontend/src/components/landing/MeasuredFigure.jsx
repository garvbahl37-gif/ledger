import { useReveal, useCountUp } from '../../lib/useReveal'

/**
 * A measured result, counted up on arrival.
 *
 * The count-up is reserved for these figures alone. They are the evidence the
 * whole page rests on, so watching the number arrive is worth the motion;
 * applying the same effect to every statistic on the page would spend the
 * attention it buys.
 */
export default function MeasuredFigure({ value, suffix = '', decimals = 0, label, tone = 'soft' }) {
  const [ref, shown] = useReveal({ threshold: 0.5 })
  const n = useCountUp(value, { decimals, start: shown, duration: 1200 })

  const color = tone === 'accent' ? 'text-[#2dd4bf]' : 'text-[rgba(242,246,251,0.45)]'
  const labelColor = tone === 'accent' ? 'text-[rgba(45,212,191,0.75)]' : 'text-[rgba(242,246,251,0.35)]'

  return (
    <div ref={ref} className="min-w-0">
      <div
        className={`font-mono text-[clamp(30px,4.4vw,52px)] font-medium leading-[0.95] tracking-[-0.06em] ${color}`}
        style={{ fontFeatureSettings: "'tnum' 1, 'zero' 1" }}
      >
        {n.toFixed(decimals)}{suffix}
      </div>
      <p className={`m-0 mt-[10px] text-[12.5px] leading-[1.45] ${labelColor}`}>{label}</p>
    </div>
  )
}
