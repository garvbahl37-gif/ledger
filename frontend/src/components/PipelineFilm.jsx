import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Play, Pause, RotateCcw, Check, X } from 'lucide-react'

/**
 * How Ledger works, for someone who has never heard of a p-value.
 *
 * An earlier version of this showed eleven hypotheses with their p-values and
 * BH critical values. It was accurate and nobody who wasn't already a
 * statistician could read it. This one drops every number and keeps the one
 * idea the whole product rests on: write the questions down before you look,
 * because if you ask enough of them something will look interesting by luck.
 *
 * Four beats, six plain-English questions, no jargon on screen.
 */

const QUESTIONS = [
  { q: 'Do customers who leave stay for a shorter time?', holds: true },
  { q: 'Do month-to-month customers pay more each month?', holds: true },
  { q: 'Do people in some regions leave more often?', holds: false },
  { q: 'Do happier customers call support less?', holds: false },
  { q: 'Do paperless customers leave more often?', holds: false },
  { q: 'Do people who pay more stay longer?', holds: false },
]

const STEPS = [
  { at: 0.00, title: 'Write the questions down',  say: 'Ledger reads your spreadsheet and writes out what it wants to check.' },
  { at: 0.30, title: 'Lock the list',             say: 'The list is sealed. Nothing can be added once the checking starts.' },
  { at: 0.48, title: 'Check every one',           say: 'All six get tested. None are skipped, including the ones that look boring.' },
  { at: 0.72, title: 'Keep only what holds up',   say: 'Four could easily be coincidence, so they are dropped. Two survive.' },
]

const DURATION_MS = 16000

export default function PipelineFilm() {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [seen, setSeen] = useState(false)
  const raf = useRef(0)
  const started = useRef(0)
  const host = useRef(null)

  const reduced = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    const node = host.current
    if (!node || typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } },
      { threshold: 0.3 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (reduced) { setT(1); return }
    if (!seen || !playing) return
    started.current = performance.now() - t * DURATION_MS
    const tick = (now) => {
      setT(((now - started.current) % DURATION_MS) / DURATION_MS)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [seen, playing, reduced])    // eslint-disable-line react-hooks/exhaustive-deps

  const step = STEPS.reduce((acc, s, i) => (t >= s.at ? i : acc), 0)
  const locked = t >= 0.30
  const checking = t >= 0.48
  const judged = t >= 0.72

  const written = t < 0.02 ? 0
    : Math.min(QUESTIONS.length,
        Math.ceil(((t - 0.02) / (0.30 - 0.02)) * QUESTIONS.length))
  const checked = !checking ? 0
    : Math.min(QUESTIONS.length,
        Math.ceil(((t - 0.48) / (0.72 - 0.48)) * QUESTIONS.length))

  const kept = QUESTIONS.filter((q) => q.holds).length

  return (
    <section
      ref={host}
      id="how-it-runs"
      className="scroll-mt-[64px] w-full bg-[#0f172a] px-[24px] py-[84px]"
      aria-label="How Ledger works"
    >
      <div className="mx-auto max-w-[900px]">
        <header className="mb-[36px] max-w-[60ch]">
          <h2 className="m-0 text-[clamp(26px,3.1vw,36px)] font-bold leading-[1.15] tracking-[-0.035em] text-white">
            We write the questions down before we look.
          </h2>
          <p className="mt-[14px] mb-0 text-[15.5px] leading-[1.65] text-white/60">
            Ask a spreadsheet enough questions and one of them will look
            interesting by pure luck. So Ledger decides what it is asking first,
            seals the list, then checks every single one.
          </p>
        </header>

        {/* ── Four steps ─────────────────────────────────────── */}
        <ol className="m-0 mb-[22px] grid list-none gap-[10px] p-0 sm:grid-cols-4">
          {STEPS.map((s, i) => {
            const on = i <= step
            const now = i === step
            return (
              <li
                key={s.title}
                className="rounded-[11px] border px-[13px] py-[11px] transition-all duration-400"
                style={{
                  borderColor: now ? 'rgba(45,212,191,.45)' : on ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.07)',
                  background: now ? 'rgba(45,212,191,.07)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-[7px]">
                  <span
                    className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-400"
                    style={{
                      background: on ? '#2dd4bf' : 'rgba(255,255,255,.12)',
                      color: on ? '#0f172a' : 'rgba(255,255,255,.5)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[13px] font-semibold leading-[1.2] tracking-[-0.02em] transition-colors duration-400"
                    style={{ color: on ? '#fff' : 'rgba(255,255,255,.4)' }}
                  >
                    {s.title}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>

        {/* ── The questions ──────────────────────────────────── */}
        <div className="overflow-hidden rounded-[15px] border border-white/10 bg-white/[0.035]">
          <div className="flex items-center justify-between gap-[10px] border-b border-white/10 px-[17px] py-[12px]">
            <span className="flex items-center gap-[8px] text-[13px] text-white/70">
              {locked && <Lock className="h-[13px] w-[13px] text-[#f87171]" />}
              {locked ? 'List sealed. No new questions allowed.' : 'Writing the list…'}
            </span>
            <span className="shrink-0 text-[12.5px] text-white/45">
              {locked ? QUESTIONS.length : written} question{(locked ? QUESTIONS.length : written) === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="m-0 list-none p-0">
            {QUESTIONS.map((row, i) => {
              const shown = i < written || locked
              const done = checked > i
              const dropped = judged && !row.holds
              const held = judged && row.holds
              return (
                <li
                  key={row.q}
                  className="flex items-center gap-[12px] border-b border-white/[0.05] px-[17px] py-[11px] transition-all duration-500 last:border-0"
                  style={{
                    opacity: !shown ? 0 : dropped ? 0.35 : 1,
                    transform: shown ? 'none' : 'translateY(6px)',
                  }}
                >
                  <span
                    className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full transition-all duration-500"
                    style={{
                      background: held ? '#34d399' : dropped ? 'rgba(255,255,255,.1)'
                        : done ? 'rgba(45,212,191,.22)' : 'rgba(255,255,255,.07)',
                    }}
                  >
                    {held && <Check className="h-[11px] w-[11px] text-[#0f172a]" strokeWidth={3.5} />}
                    {dropped && <X className="h-[10px] w-[10px] text-white/50" strokeWidth={3} />}
                  </span>

                  <span
                    className="min-w-0 flex-1 text-[14px] leading-[1.35] transition-colors duration-500"
                    style={{ color: held ? '#fff' : dropped ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.8)' }}
                  >
                    {row.q}
                  </span>

                  <span
                    className="shrink-0 text-[12px] transition-opacity duration-500"
                    style={{
                      opacity: judged ? 1 : 0,
                      color: held ? '#34d399' : 'rgba(255,255,255,.4)',
                    }}
                  >
                    {held ? 'Holds up' : 'Could be luck'}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-white/10 px-[17px] py-[13px]">
            <p className="m-0 text-[13.5px] leading-[1.55] text-white/60">
              {STEPS[step].say}
            </p>
          </div>
        </div>

        <p className="mt-[18px] mb-0 max-w-[62ch] text-[13.5px] leading-[1.6] text-white/45">
          {judged
            ? `Ledger reports those ${kept} and stays quiet about the rest. Most tools would have reported all six.`
            : 'Because the list was sealed first, Ledger cannot quietly drop the questions it did not like the answer to.'}
        </p>

        {/* ── Transport ──────────────────────────────────────── */}
        <div className="mt-[20px] flex items-center gap-[12px]">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-[29px] w-[29px] items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-[12px] w-[12px]" /> : <Play className="h-[12px] w-[12px]" />}
          </button>
          <button
            type="button"
            onClick={() => { setT(0); started.current = performance.now() }}
            className="inline-flex h-[29px] w-[29px] items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Start again"
          >
            <RotateCcw className="h-[12px] w-[12px]" />
          </button>
          <input
            type="range" min={0} max={1} step={0.001} value={t}
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value)) }}
            aria-label="Move through the steps"
            className="h-[3px] flex-1 cursor-pointer appearance-none rounded-full bg-white/12 accent-teal-400"
          />
          <span className="w-[130px] shrink-0 text-right text-[12px] text-white/40">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </div>
    </section>
  )
}
