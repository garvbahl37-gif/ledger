import { useEffect, useRef, useState } from 'react'
import Skeleton from '../ui/Skeleton'

/**
 * Renders a Plotly spec produced by A10.
 *
 * plotly.js is ~1MB, so it is imported dynamically — the report and ledger are
 * readable long before the exploratory dashboard is needed, and most sessions
 * never open that tab. The backend's own layout is preserved and only the
 * chrome is overridden, so its colourway stays intact.
 */
export default function PlotlyChart({ spec, height = 340, className }) {
  const ref = useRef(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    let observer
    const node = ref.current
    if (!spec || !node) return

    ;(async () => {
      try {
        const Plotly = (await import('plotly.js/dist/plotly')).default
        if (cancelled || !ref.current) return

        await Plotly.react(
          ref.current,
          spec.data ?? [],
          {
            ...(spec.layout ?? {}),
            autosize: true,
            height,
            margin: { l: 56, r: 34, t: spec.layout?.title ? 44 : 16, b: 48 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: 'Inter, system-ui, sans-serif', size: 11.5, color: '#334155' },
            xaxis: { ...(spec.layout?.xaxis ?? {}), gridcolor: '#eef2f6', zerolinecolor: '#e2e8f0' },
            yaxis: { ...(spec.layout?.yaxis ?? {}), gridcolor: '#eef2f6', zerolinecolor: '#e2e8f0' },
            title: spec.layout?.title
              ? { ...spec.layout.title, font: { size: 13, color: '#0f172a' }, x: 0, xanchor: 'left' }
              : undefined,
          },
          { displayModeBar: false, responsive: true },
        )
        if (cancelled) return
        setState('ready')

        // The node is laid out during loading (opacity, not display:none), so
        // Plotly measures a real width. This second pass covers the container
        // settling after the skeleton is removed, and the observer covers a
        // sidebar opening or the window changing later. Without it the figure
        // keeps the width it was first given and the last category is cut off.
        Plotly.Plots.resize(ref.current)
        observer = new ResizeObserver(() => {
          if (ref.current) Plotly.Plots.resize(ref.current)
        })
        observer.observe(ref.current)
      } catch {
        if (!cancelled) setState('error')
      }
    })()

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [spec, height])

  if (!spec) return null

  return (
    <div className={className} style={{ position: 'relative', minHeight: height }}>
      {state === 'loading' && (
        <Skeleton
          className="absolute inset-0 w-full"
          style={{ height }}
        />
      )}
      {state === 'error' && (
        <p className="px-3 py-8 text-center text-[12.5px] text-slate">
          This chart could not be drawn. The underlying numbers are still in the ledger.
        </p>
      )}
      <div
        ref={ref}
        style={{
          height,
          // Laid out from the first render so Plotly has a real width to
          // measure. Hiding it with display:none gave it a width of zero.
          opacity: state === 'ready' ? 1 : 0,
          transition: 'opacity .18s ease',
          pointerEvents: state === 'ready' ? 'auto' : 'none',
        }}
      />
    </div>
  )
}
