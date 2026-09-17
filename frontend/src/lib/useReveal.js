import { useEffect, useRef, useState } from 'react'

/**
 * Reveal-on-scroll, once, with reduced-motion honoured.
 *
 * Deliberately not a fade-and-slide on every element: that reads as generated.
 * Here a rule draws first and the content settles after it, which is the motion
 * a ruled page suggests, and it only ever happens once per element.
 */
export function useReveal({ threshold = 0.18, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect() } },
      { threshold, rootMargin },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [threshold, rootMargin])

  return [ref, shown]
}

/**
 * Count a number up when it comes into view.
 *
 * Used only on the measured results, where watching the figure arrive is the
 * point. Everything else stays still.
 */
export function useCountUp(target, { duration = 1100, decimals = 0, start = false } = {}) {
  const [value, setValue] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (!start) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1)
      // Ease out: the number decelerates into place rather than snapping.
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Number((target * eased).toFixed(decimals)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration, decimals, start])

  return value
}
