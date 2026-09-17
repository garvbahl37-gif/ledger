import { useEffect, useState } from 'react'
import { ArrowUpRight, Lock } from 'lucide-react'
import PipelineFilm from './PipelineFilm'
import { RuledBlock, Entry } from './landing/Reveal'
import MeasuredFigure from './landing/MeasuredFigure'

/**
 * The landing page, on ink.
 *
 * The concept is the name. A ledger is a ruled book in which every entry is
 * accounted for, which is exactly what this product is, so rules do the
 * structural work that borders and cards do elsewhere and content sits on
 * lines rather than inside boxes. The mono face is a display element here, not
 * a device for code snippets: the numbers are the argument.
 *
 * Two clichés this deliberately avoids. It is not cream paper with a
 * high-contrast serif, and it is not charcoal with one acid accent — the
 * ground is genuinely blue-black and the teal does data work (what survived,
 * what is live) rather than decoration.
 */

const MECHANISMS = [
  {
    n: '01',
    title: 'The questions are sealed before any test runs',
    body: 'Adding one afterwards raises an error, not a warning. That is what makes the correction mean anything: the number it divides by was fixed before a single result existed.',
  },
  {
    n: '02',
    title: 'No language model decides what is true',
    body: 'The step that picks the test contains no model at all. It checks whether the data is normal, whether the variances match, and lets those answers choose. You can read why it picked what it picked.',
  },
  {
    n: '03',
    title: 'Every question is reported, including the dull ones',
    body: 'The ones that found nothing stay in the report. Quietly dropping them would shrink the list and make the threshold more forgiving for everything left.',
  },
  {
    n: '04',
    title: 'A sentence with no receipt cannot be written',
    body: 'Each claim links back to the code that produced it, the assumptions that were checked and the number that came out. Click any of them and read the whole chain.',
  },
]

const DELIVERABLES = [
  'A written report where every claim opens its own receipt',
  'A Jupyter notebook that reproduces every number',
  'A standalone HTML file with the ledger beside the prose',
  'A hash to check one run against another',
]

function Nav({ onEnter }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`sticky top-0 z-50 flex h-[62px] w-full items-center justify-between px-[22px] transition-colors duration-300 md:px-[44px] ${
        scrolled ? 'border-b border-rule bg-[#080d18]/85 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <button onClick={onEnter} className="flex items-center gap-[10px] border-none bg-transparent p-0">
        <span className="flex h-[27px] w-[27px] items-center justify-center rounded-[7px] bg-[#2dd4bf] text-[13px] font-bold text-[#080d18]">
          L
        </span>
        <span className="text-[16px] font-semibold tracking-[-0.03em] on-ink">Ledger</span>
      </button>

      <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[30px] md:flex">
        {[['How it runs', '#how-it-runs'], ['The evidence', '#the-evidence'], ['What it does', '#mechanisms']].map(
          ([label, href]) => (
            <a
              key={label}
              href={href}
              className="text-[13.5px] no-underline transition-colors duration-200 on-ink-soft hover:text-[#2dd4bf]"
            >
              {label}
            </a>
          ),
        )}
      </div>

      <div className="flex items-center gap-[16px]">
        <a
          href="https://github.com/garvbahl37-gif/Ledger_agent"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-[13.5px] no-underline transition-colors duration-200 on-ink-soft hover:text-[#f2f6fb] sm:block"
        >
          GitHub
        </a>
        <button
          onClick={onEnter}
          className="rounded-[8px] border border-rule bg-white/[0.06] px-[16px] py-[8px] text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200 on-ink hover:bg-white/[0.12]"
        >
          Open the analyst
        </button>
      </div>
    </nav>
  )
}

export default function LandingContent({ onEnter }) {
  return (
    <div className="min-h-screen bg-[#080d18] antialiased">
      <Nav onEnter={onEnter} />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden px-[22px] pb-[92px] pt-[72px] md:px-[44px]">
        {/* The feint of a ruled page, barely there, fading out downward. */}
        <div
          aria-hidden="true"
          className="ruled pointer-events-none absolute inset-0"
          style={{ maskImage: 'linear-gradient(to bottom, black, transparent 78%)' }}
        />

        <div className="relative mx-auto max-w-[1100px]">
          <Entry>
            <p className="m-0 mb-[24px] font-mono text-[12.5px] tracking-[-0.01em] text-[#2dd4bf]">
              510 tables · 23,901 tests · measured, not projected
            </p>
          </Entry>

          <Entry delay={90}>
            <h1 className="m-0 max-w-[17ch] text-[clamp(38px,6.6vw,84px)] font-bold leading-[0.98] tracking-[-0.05em] on-ink">
              Point it at a spreadsheet of pure noise.
            </h1>
          </Entry>

          <Entry delay={170}>
            <p className="m-0 mt-[22px] max-w-[54ch] text-[clamp(16px,1.6vw,19px)] leading-[1.6] on-ink-soft">
              It will tell you nothing. Every other automated analyst will hand you a
              page of findings, because if you ask a spreadsheet enough questions one
              of them always looks interesting.
            </p>
          </Entry>

          <Entry delay={250}>
            <div className="mt-[36px] flex flex-wrap items-center gap-[12px]">
              <button
                onClick={onEnter}
                className="group inline-flex items-center gap-[9px] rounded-[10px] bg-[#2dd4bf] px-[24px] py-[14px] text-[15px] font-semibold tracking-[-0.015em] text-[#080d18] transition-colors duration-200 hover:bg-[#5eead4]"
              >
                Analyse a table
                <ArrowUpRight className="h-[16px] w-[16px] transition-transform duration-200 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
              </button>
              <a
                href="#how-it-runs"
                className="rounded-[10px] border border-rule px-[24px] py-[14px] text-[15px] font-medium tracking-[-0.015em] no-underline transition-colors duration-200 on-ink hover:border-[rgba(45,212,191,0.4)]"
              >
                See how it runs
              </a>
            </div>
          </Entry>

          {/* The null-dataset result, as a ledger entry rather than a chart card */}
          <Entry delay={340}>
            <div className="mt-[68px] border-t border-rule pt-[26px]">
              <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
                <p className="m-0 text-[13.5px] on-ink-faint">
                  Given 200 tables containing nothing at all
                </p>
                <p className="m-0 font-mono text-[12px] text-[#2dd4bf]">ground truth = 0</p>
              </div>

              <div className="mt-[26px] grid gap-x-[40px] gap-y-[30px] sm:grid-cols-2 lg:grid-cols-4">
                <MeasuredFigure value={81} suffix="%" decimals={1} label="of tables where an uncorrected analyst reported a false finding" />
                <MeasuredFigure value={2.5} suffix="%" decimals={1} tone="accent" label="of tables where Ledger did" />
                <MeasuredFigure value={2.2} decimals={2} label="false findings per table, uncorrected" />
                <MeasuredFigure value={0.03} decimals={2} tone="accent" label="false findings per table, corrected once" />
              </div>
            </div>
          </Entry>
        </div>
      </header>

      {/* ── The run, animated ────────────────────────────────────── */}
      <PipelineFilm />

      {/* ── The evidence ─────────────────────────────────────────── */}
      <section id="the-evidence" className="scroll-mt-[62px] px-[22px] py-[104px] md:px-[44px]">
        <div className="mx-auto max-w-[1100px]">
          <RuledBlock className="pt-[34px]">
            <div className="grid gap-[48px] lg:grid-cols-[1fr_1fr]">
              <div>
                <h2 className="m-0 max-w-[15ch] text-[clamp(28px,3.6vw,44px)] font-bold leading-[1.08] tracking-[-0.04em] on-ink">
                  We tested it on data where we already knew the answer.
                </h2>
              </div>
              <div className="max-w-[50ch]">
                <p className="m-0 text-[16px] leading-[1.7] on-ink-soft">
                  Two hundred tables of pure noise, every column drawn independently,
                  so the right number of findings was exactly zero by construction
                  rather than by opinion. Then 240 more with real relationships
                  planted at known strengths, to check it had not simply gone quiet.
                </p>
                <p className="m-0 mt-[16px] text-[16px] leading-[1.7] on-ink-soft">
                  Discipline costs six points of sensitivity overall, and under one
                  point once an effect is of moderate size. Both arms run the same
                  test-selection code on the same tables, so the only thing that
                  differs between them is the discipline.
                </p>
              </div>
            </div>
          </RuledBlock>
        </div>
      </section>

      {/* ── Mechanisms ───────────────────────────────────────────── */}
      <section id="mechanisms" className="scroll-mt-[62px] px-[22px] pb-[104px] md:px-[44px]">
        <div className="mx-auto max-w-[1100px]">
          <Entry>
            <h2 className="m-0 mb-[10px] max-w-[20ch] text-[clamp(28px,3.6vw,44px)] font-bold leading-[1.08] tracking-[-0.04em] on-ink">
              Four things this does that other tools do not.
            </h2>
            <p className="m-0 mb-[44px] max-w-[54ch] text-[16px] leading-[1.7] on-ink-soft">
              None of them are new ideas. Statisticians have argued for all four for
              decades. What is new is a system that cannot ignore them.
            </p>
          </Entry>

          <div>
            {MECHANISMS.map((m, i) => (
              <RuledBlock key={m.n} delay={i * 70} className="py-[30px]">
                <article className="grid gap-[10px] md:grid-cols-[60px_1fr_1.1fr] md:gap-[28px]">
                  <span className="font-mono text-[13px] text-[#2dd4bf] md:pt-[4px]">{m.n}</span>
                  <h3 className="m-0 text-[19px] font-semibold leading-[1.25] tracking-[-0.025em] on-ink">
                    {m.title}
                  </h3>
                  <p className="m-0 text-[15px] leading-[1.65] on-ink-soft">{m.body}</p>
                </article>
              </RuledBlock>
            ))}
          </div>
        </div>
      </section>

      {/* ── What comes back ──────────────────────────────────────── */}
      <section className="px-[22px] pb-[104px] md:px-[44px]">
        <div className="mx-auto max-w-[1100px]">
          <RuledBlock className="pt-[34px]">
            <div className="grid gap-[48px] lg:grid-cols-[1fr_0.9fr] lg:items-start">
              <div>
                <h2 className="m-0 mb-[18px] max-w-[16ch] text-[clamp(28px,3.6vw,44px)] font-bold leading-[1.08] tracking-[-0.04em] on-ink">
                  You get the working, not just the answer.
                </h2>
                <ul className="m-0 list-none p-0">
                  {DELIVERABLES.map((line) => (
                    <li key={line} className="flex gap-[13px] border-b border-rule py-[13px] last:border-0">
                      <span aria-hidden="true" className="mt-[9px] h-[4px] w-[4px] shrink-0 rounded-full bg-[#2dd4bf]" />
                      <span className="text-[15px] leading-[1.5] on-ink-soft">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* One real entry, set as it appears in the product */}
              <figure className="m-0 rounded-[13px] border border-rule bg-white/[0.025] p-[22px]">
                <div className="mb-[16px] flex items-center gap-[8px]">
                  <Lock className="h-[12px] w-[12px] text-[#2dd4bf]" />
                  <figcaption className="m-0 font-mono text-[11.5px] on-ink-faint">
                    one entry from a real run
                  </figcaption>
                </div>
                <p className="m-0 border-l-2 border-[#2dd4bf] pl-[14px] text-[15px] leading-[1.5] on-ink">
                  Tenure differs between churned and retained customers.
                </p>
                <dl className="m-0 mt-[20px] grid grid-cols-2 gap-x-[20px] gap-y-[15px]">
                  {[
                    ['Test chosen', 'Mann-Whitney U'],
                    ['Why that one', 'normality failed'],
                    ['Corrected p', '7.8e-101'],
                    ['Effect size', '-1.42, large'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="m-0 text-[11px] on-ink-faint">{k}</dt>
                      <dd className="m-0 mt-[4px] font-mono text-[13px] on-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </figure>
            </div>
          </RuledBlock>
        </div>
      </section>

      {/* ── Close ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-[22px] py-[104px] md:px-[44px]">
        <div
          aria-hidden="true"
          className="ruled pointer-events-none absolute inset-0"
          style={{ maskImage: 'linear-gradient(to top, black, transparent 82%)' }}
        />
        <div className="relative mx-auto max-w-[1100px]">
          <Entry>
            <h2 className="m-0 max-w-[16ch] text-[clamp(30px,4.4vw,58px)] font-bold leading-[1.02] tracking-[-0.045em] on-ink">
              See what it refuses to say.
            </h2>
            <p className="m-0 mt-[20px] max-w-[52ch] text-[16px] leading-[1.7] on-ink-soft">
              Drop in a CSV, or paste a link to one. You will get a report where every
              claim opens the code behind it, and the questions that found nothing
              listed beside the ones that did.
            </p>
            <div className="mt-[34px] flex flex-wrap items-center gap-[12px]">
              <button
                onClick={onEnter}
                className="group inline-flex items-center gap-[9px] rounded-[10px] bg-[#2dd4bf] px-[26px] py-[15px] text-[15px] font-semibold tracking-[-0.015em] text-[#080d18] transition-colors duration-200 hover:bg-[#5eead4]"
              >
                Analyse a table
                <ArrowUpRight className="h-[16px] w-[16px] transition-transform duration-200 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
              </button>
              <a
                href="https://github.com/garvbahl37-gif/Ledger_agent"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[10px] border border-rule px-[26px] py-[15px] text-[15px] font-medium no-underline transition-colors duration-200 on-ink hover:border-[rgba(45,212,191,0.4)]"
              >
                Read the code
              </a>
            </div>
            {/*
              The previous copy here claimed data never leaves your device, which
              is untrue of the hosted build. It says what actually happens now.
            */}
            <p className="m-0 mt-[30px] max-w-[56ch] text-[13px] leading-[1.65] on-ink-faint">
              On the hosted version your table is sent to our engine and column
              summaries are sent to a language model. If the data cannot leave your
              machine, run it locally against a local model. Both paths are in the
              repository.
            </p>
          </Entry>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-rule px-[22px] py-[52px] md:px-[44px]">
        <div className="mx-auto grid max-w-[1100px] gap-[36px] md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <div className="mb-[13px] flex items-center gap-[9px]">
              <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] bg-[#2dd4bf] text-[12px] font-bold text-[#080d18]">
                L
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.02em] on-ink">Ledger</span>
            </div>
            <p className="m-0 mb-[16px] max-w-[30ch] text-[13px] leading-[1.6] on-ink-faint">
              The analyst that reports what it can support, and says so when it
              cannot.
            </p>
            <p className="m-0 font-mono text-[11.5px] leading-[1.7] on-ink-faint">
              Built at NSUT · CSE · BTP 2023–27
              <br />
              Dhruv Kumar · Rahul · Garv Bahl
            </p>
          </div>

          {[
            ['Project', ['About', 'Research paper', 'Evaluation protocol', 'GitHub']],
            ['Built with', ['FastAPI', 'pandas + SciPy', 'statsmodels', 'Ollama', 'React + Vite']],
          ].map(([heading, items]) => (
            <div key={heading}>
              <h4 className="m-0 mb-[14px] text-[12px] font-semibold tracking-[-0.01em] on-ink-faint">
                {heading}
              </h4>
              {items.map((item) => (
                <p key={item} className="m-0 mb-[9px] text-[13px] on-ink-soft">
                  {item}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className="mx-auto mt-[44px] flex max-w-[1100px] flex-wrap items-center justify-between gap-[10px] border-t border-rule pt-[22px]">
          <p className="m-0 text-[12px] on-ink-faint">
            © 2026 Ledger · NSUT Department of Computer Science &amp; Engineering
          </p>
          <p className="m-0 font-mono text-[11.5px] on-ink-faint">Benjamini–Hochberg at q = 0.05</p>
        </div>
      </footer>
    </div>
  )
}
