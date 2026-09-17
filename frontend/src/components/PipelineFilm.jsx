import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Play, Pause, RotateCcw } from 'lucide-react'

/**
 * The pipeline, animated — with the registry as the subject rather than the
 * agents.
 *
 * The obvious version of this is eight boxes lighting up left to right with a
 * dot travelling between them. It looks like every other pipeline animation and
 * teaches nothing, because the interesting thing about Ledger is not that
 * stages run in order. It is what happens to the hypotheses: they are written,
 * then locked, then tested, then cut by a threshold that depends on how many of
 * them there were. So the hypotheses stay on screen the whole time and change
 * state, and the agents are a narrow rail alongside.
 *
 * Every stage is derived from one normalised clock, which is what makes the
 * scrubber, pause and reduced-motion states nearly free: they all just set or
 * freeze `t`.
 */

// The arithmetic shown is real: these are the BH critical values i·q/m for
// m = 11 at q = 0.05, and the two survivors are the ones that clear them.
const Q = 0.05

const ROWS = [
  { id: 'H01', text: 'monthly_charges differs by churn',      p: 0.486,    agent: 'model' },
  { id: 'H02', text: 'contract_type is associated with churn', p: 0.762,   agent: 'model' },
  { id: 'H03', text: 'tenure_months differs by contract',      p: 0.316,   agent: 'model' },
  { id: 'H04', text: 'satisfaction differs by paperless',      p: 0.871,   agent: 'model' },
  { id: 'H05', text: 'support_calls differs by churn',         p: 0.476,   agent: 'model' },
  { id: 'H06', text: 'tenure_months tracks monthly_charges',   p: 0.275,   agent: 'model' },
  { id: 'H07', text: 'region is associated with churn',        p: 0.306,   agent: 'model' },
  { id: 'H08', text: 'monthly_charges differs by contract',    p: 3.6e-25, agent: 'model' },
  { id: 'H09', text: 'paperless is associated with contract',  p: 0.123,   agent: 'model' },
  { id: 'H10', text: 'satisfaction tracks support_calls',      p: 0.534,   agent: 'model' },
  { id: 'UH01', text: 'tenure differs by churn',               p: 7.1e-102, agent: 'you' },
]

const STAGES = [
  { key: 'A0', name: 'Janitor',      does: 'types coerced, duplicates dropped',        model: false, at: 0.00 },
  { key: 'A1', name: 'Profiler',     does: 'one column at a time, never a pair',       model: false, at: 0.08 },
  { key: 'A2', name: 'Proposer',     does: 'writes hypotheses from the profile',       model: true,  at: 0.18 },
  { key: 'A3', name: 'Registrar',    does: 'hashes the list and locks it',             model: false, at: 0.40, freeze: true },
  { key: 'A4', name: 'Executor',     does: 'writes pandas, runs it sandboxed',         model: true,  at: 0.50 },
  { key: 'A5', name: 'Statistician', does: 'checks assumptions, applies the cut',      model: false, at: 0.66 },
  { key: 'A6', name: 'Reporter',     does: 'may only use what survived',               model: true,  at: 0.84 },
  { key: 'A7', name: 'Adversary',    does: 'reads it back looking for overreach',      model: true,  at: 0.92 },
]

const DURATION_MS = 21000
const HEX = '0123456789abcdef'
const HASH = 'c0d465c9d17e8553'

const fmtP = (p) => {
  if (p >= 1e-3) return p.toFixed(3)
  const e = Math.floor(Math.log10(p))
  return `${(p / 10 ** e).toFixed(1)}e${e}`
}

// Rank ascending by p, so the BH critical value i·q/m can be read off directly.
const RANKED = [...ROWS].sort((a, b) => a.p - b.p)
const M = ROWS.length
const CRIT = (i) => ((i + 1) / M) * Q
const SURVIVES = (i) => RANKED[i].p <= CRIT(i)

export default function PipelineFilm() {
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [seen, setSeen] = useState(false)
  const raf = useRef(0)
  const startedAt = useRef(0)
  const hostRef = useRef(null)

  const reduced = useMemo(
    () => typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  // Hold until it is actually on screen, so the freeze does not happen to
  // someone scrolled three sections away.
  useEffect(() => {
    const node = hostRef.current
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
    startedAt.current = performance.now() - t * DURATION_MS
    const tick = (now) => {
      const next = ((now - startedAt.current) % DURATION_MS) / DURATION_MS
      setT(next)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [seen, playing, reduced])   // eslint-disable-line react-hooks/exhaustive-deps

  const stageIndex = STAGES.reduce((acc, s, i) => (t >= s.at ? i : acc), 0)
  const frozen = t >= 0.40
  const executing = t >= 0.50
  const adjudicated = t >= 0.66
  const reported = t >= 0.84

  // How far through the proposing beat, so rows appear one at a time.
  const proposed = t < 0.18 ? 0
    : Math.min(M, Math.floor(((t - 0.18) / (0.40 - 0.18)) * (M + 1)))
  const tested = !executing ? 0
    : Math.min(M, Math.floor(((t - 0.50) / (0.66 - 0.50)) * (M + 1)))

  const hash = frozen
    ? HASH.slice(0, Math.min(16, Math.floor((t - 0.40) / 0.02 * 4)))
        .padEnd(16, '').split('').join('') +
      Array.from({ length: Math.max(0, 16 - Math.floor((t - 0.40) / 0.02 * 4)) },
        () => HEX[Math.floor(Math.random() * 16)]).join('')
    : ''

  const survivors = adjudicated ? RANKED.filter((_, i) => SURVIVES(i)).length : null

  return (
    <section
      ref={hostRef}
      id="how-it-runs"
      className="scroll-mt-[64px] w-full bg-[#0f172a] py-[86px] px-[24px]"
      aria-label="How a run proceeds"
    >
      <div className="mx-auto max-w-[1080px]">
        <header className="mb-[34px] max-w-[62ch]">
          <h2 className="m-0 text-[clamp(26px,3vw,34px)] font-bold leading-[1.15] tracking-[-0.035em] text-white">
            Watch a run decide what it is allowed to say.
          </h2>
          <p className="mt-[14px] mb-0 text-[15px] leading-[1.65] text-white/55">
            Eleven hypotheses go in. Two come out. What happens in between is the
            whole argument: the list is locked before a single test runs, so the
            threshold that cuts it cannot be chosen after the results are in.
          </p>
        </header>

        <div className="grid gap-[22px] lg:grid-cols-[210px_1fr]">
          {/* ── The agents, kept deliberately small ─────────────── */}
          <ol className="m-0 list-none p-0">
            {STAGES.map((s, i) => {
              const active = i === stageIndex
              const done = i < stageIndex
              return (
                <li key={s.key} className="relative pl-[20px] pb-[13px]">
                  {i < STAGES.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[4px] top-[14px] bottom-0 w-px"
                      style={{ background: done ? 'rgba(45,212,191,.45)' : 'rgba(255,255,255,.11)' }}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-[5px] h-[9px] w-[9px] rounded-full transition-all duration-300"
                    style={{
                      background: s.freeze && (active || done) ? '#f87171'
                        : (active || done) ? '#2dd4bf' : 'rgba(255,255,255,.2)',
                      boxShadow: active ? `0 0 0 4px ${s.freeze ? 'rgba(248,113,113,.18)' : 'rgba(45,212,191,.16)'}` : 'none',
                    }}
                  />
                  <div className="flex items-baseline gap-[7px]">
                    <span className="font-mono text-[10.5px] text-white/35">{s.key}</span>
                    <span
                      className="text-[13px] font-semibold tracking-[-0.02em] transition-colors duration-300"
                      style={{ color: active ? '#fff' : done ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.3)' }}
                    >
                      {s.name}
                    </span>
                    {!s.model && (
                      <span className="rounded-[4px] bg-teal-400/12 px-[5px] py-px text-[8.5px] font-semibold tracking-[0.06em] text-teal-300/90">
                        NO MODEL
                      </span>
                    )}
                  </div>
                  <p
                    className="m-0 mt-[2px] text-[11.5px] leading-[1.45] transition-colors duration-300"
                    style={{ color: active ? 'rgba(255,255,255,.62)' : 'rgba(255,255,255,.3)' }}
                  >
                    {s.does}
                  </p>
                </li>
              )
            })}
          </ol>

          {/* ── The registry: the actual subject ─────────────────── */}
          <div className="min-w-0 rounded-[16px] border border-white/10 bg-white/[0.035]">
            <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-white/10 px-[16px] py-[11px]">
              <div className="flex items-center gap-[9px]">
                {frozen ? (
                  <>
                    <Lock className="h-[13px] w-[13px] text-[#f87171]" />
                    <span className="text-[12.5px] font-semibold text-white">
                      Registry frozen
                    </span>
                    <code className="font-mono text-[10.5px] text-teal-300/80">{hash}</code>
                  </>
                ) : (
                  <span className="text-[12.5px] text-white/50">
                    {proposed > 0 ? 'Writing hypotheses…' : 'Reading the table…'}
                  </span>
                )}
              </div>
              <span className="font-mono text-[11px] text-white/45">
                m = {frozen ? M : proposed}
                {frozen && <span className="ml-[7px] text-white/30">fixed</span>}
              </span>
            </div>

            <ul className="m-0 list-none p-0">
              {RANKED.map((row, i) => {
                const shown = i < proposed || frozen
                const hasP = executing && i < tested
                const cut = adjudicated
                const lives = cut && SURVIVES(i)
                const dead = cut && !SURVIVES(i)
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-[10px] border-b border-white/[0.05] px-[16px] py-[7px] transition-all duration-500 last:border-0"
                    style={{
                      opacity: !shown ? 0 : dead ? 0.32 : 1,
                      transform: shown ? 'none' : 'translateY(5px)',
                    }}
                  >
                    <span
                      className="w-[34px] shrink-0 font-mono text-[10.5px]"
                      style={{ color: row.agent === 'you' ? '#5eead4' : 'rgba(255,255,255,.4)' }}
                    >
                      {row.id}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[12.5px] transition-colors duration-500"
                      style={{
                        color: lives ? '#fff' : 'rgba(255,255,255,.6)',
                        textDecorationLine: dead ? 'line-through' : 'none',
                        textDecorationColor: 'rgba(255,255,255,.28)',
                      }}
                    >
                      {row.text}
                    </span>

                    {/* p against its own critical value — the arithmetic, shown */}
                    <span className="hidden w-[132px] shrink-0 items-baseline justify-end gap-[7px] font-mono text-[10.5px] sm:flex">
                      <span style={{ color: hasP ? 'rgba(255,255,255,.72)' : 'transparent' }}>
                        {hasP ? fmtP(row.p) : '·'}
                      </span>
                      <span style={{ color: cut ? 'rgba(255,255,255,.28)' : 'transparent' }}>
                        ≤ {fmtP(CRIT(i))}
                      </span>
                    </span>

                    <span
                      className="w-[15px] shrink-0 text-center text-[12px] transition-opacity duration-500"
                      style={{ opacity: cut ? 1 : 0, color: lives ? '#34d399' : 'rgba(255,255,255,.3)' }}
                    >
                      {lives ? '✓' : '✕'}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-white/10 px-[16px] py-[10px]">
              <p className="m-0 max-w-[52ch] text-[11.5px] leading-[1.5] text-white/45">
                {!frozen && 'Nothing has been tested yet. The list is still open.'}
                {frozen && !adjudicated && 'The list is closed. m is what the threshold will be divided by.'}
                {adjudicated && !reported &&
                  `Benjamini–Hochberg at q = ${Q}: each p-value is compared with i·q/m, not with ${Q}.`}
                {reported && `${survivors} of ${M} survived. The report may use those and nothing else.`}
              </p>
              <span className="font-mono text-[11px] text-white/40">
                {adjudicated ? `${survivors} / ${M}` : `— / ${M}`}
              </span>
            </div>
          </div>
        </div>

        {/* ── Transport ───────────────────────────────────────── */}
        <div className="mt-[18px] flex items-center gap-[12px]">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={playing ? 'Pause the run' : 'Play the run'}
          >
            {playing ? <Pause className="h-[12px] w-[12px]" /> : <Play className="h-[12px] w-[12px]" />}
          </button>
          <button
            type="button"
            onClick={() => { setT(0); startedAt.current = performance.now() }}
            className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Restart the run"
          >
            <RotateCcw className="h-[12px] w-[12px]" />
          </button>

          <input
            type="range" min={0} max={1} step={0.001} value={t}
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value)) }}
            aria-label="Scrub through the run"
            className="h-[3px] flex-1 cursor-pointer appearance-none rounded-full bg-white/12 accent-teal-400"
          />
          <span className="w-[74px] shrink-0 text-right font-mono text-[10.5px] text-white/40">
            {STAGES[stageIndex].key} {STAGES[stageIndex].name}
          </span>
        </div>
      </div>
    </section>
  )
}
