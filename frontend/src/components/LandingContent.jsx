import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView, useAnimation } from 'framer-motion';
import NullTestChart from './charts/NullTestChart';
import PipelineFilm from './PipelineFilm';
import { 
  ArrowRight, Upload, ShieldCheck, Activity, Search, 
  Lock, BarChart2, FileSearch, Shield, RefreshCw, Database 
} from 'lucide-react';

const Counter = ({ from = 0, to, duration = 1.5, isFloat = false, delay = 0 }) => {
  const nodeRef = useRef(null);
  const inView = useInView(nodeRef, { once: true, margin: "-50px" });
  
  useEffect(() => {
    if (inView) {
      let startTime;
      let animationFrameId;
      
      const updateCounter = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        // Handle delay
        if (elapsed < delay * 1000) {
          animationFrameId = requestAnimationFrame(updateCounter);
          return;
        }
        
        const activeElapsed = elapsed - (delay * 1000);
        const progress = Math.min(activeElapsed / (duration * 1000), 1);
        const current = progress * (to - from) + from;
        
        if (nodeRef.current) {
          nodeRef.current.textContent = isFloat || !Number.isInteger(to)
            ? current.toFixed(2)
            : Math.floor(current).toString();
        }
        
        if (progress < 1) {
          animationFrameId = requestAnimationFrame(updateCounter);
        }
      };
      
      animationFrameId = requestAnimationFrame(updateCounter);
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [inView, from, to, duration, isFloat, delay]);

  return <span ref={nodeRef}>{isFloat || !Number.isInteger(from) ? from.toFixed(2) : from}</span>;
};

const pipelineStages = [
  {
    id: 0,
    name: "A0 Janitor",
    color: "#6366f1",
    numBg: "#eef2ff",
    numColor: "#6366f1",
    badge: "DETERMINISTIC",
    badgeBg: "#eef2ff",
    badgeColor: "#4338ca",
    badgeBorder: "#c7d2fe",
    desc: "Type coercion, dedup, and rule-based domain annotation",
    in: "Raw CSV",
    out: "cleaned_df"
  },
  {
    id: 1,
    name: "A1 Profiler",
    color: "#0d9488",
    numBg: "#f0fdfa",
    numColor: "#0d9488",
    badge: "DETERMINISTIC",
    badgeBg: "#f0fdfa",
    badgeColor: "#0d9488",
    badgeBorder: "#99f6e4",
    desc: "Shapiro-Wilk, entropy, outlier detection. Zero LLM.",
    in: "cleaned_df",
    out: "profile_json"
  },
  {
    id: 2,
    name: "A2 Proposer",
    color: "#8b5cf6",
    numBg: "#ede9fe",
    numColor: "#7c3aed",
    badge: "LLM + RAG",
    badgeBg: "#ede9fe",
    badgeColor: "#5b21b6",
    badgeBorder: "#ddd6fe",
    desc: "Reads profile, proposes 5-12 testable hypotheses via RAG",
    in: "profile_json",
    out: "Hypotheses"
  },
  {
    id: 3,
    name: "A3 Registrar",
    color: "#ef4444",
    numBg: "#fef2f2",
    numColor: "#ef4444",
    badge: "🔒 FREEZE",
    badgeBg: "#fef2f2",
    badgeColor: "#991b1b",
    badgeBorder: "#fecaca",
    desc: "SHA-256 locks the registry. No new hypotheses after this point.",
    in: "Hypotheses",
    out: "Frozen ⟶ hash"
  },
  {
    id: 4,
    name: "A4 Executor",
    color: "#f59e0b",
    numBg: "#fffbeb",
    numColor: "#d97706",
    badge: "LLM + REACT",
    badgeBg: "#fff7ed",
    badgeColor: "#c2410c",
    badgeBorder: "#fed7aa",
    desc: "Writes pandas code, sandboxed run, 3-attempt repair loop",
    in: "Registry",
    out: "raw_data"
  },
  {
    id: 5,
    name: "A5 Statistician",
    color: "#10b981",
    numBg: "#f0fdf4",
    numColor: "#10b981",
    badge: "DETERMINISTIC",
    badgeBg: "#f0fdf4",
    badgeColor: "#166534",
    badgeBorder: "#bbf7d0",
    desc: "BH-FDR across full family, effect sizes, licensed_text",
    in: "raw_data",
    out: "LedgerEntry"
  }
];

export default function LandingContent({ onEnter }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] font-sans text-[var(--color-navy)] selection:bg-[var(--color-accent-light)] selection:text-[var(--color-navy)] overflow-hidden">
      
      {/* 1. NAVBAR */}
      <nav className="sticky top-0 z-50 w-full h-[64px] bg-white/85 backdrop-blur-md border-b border-[#e2e8f0] flex items-center justify-between px-[24px] md:px-[48px]">
        <button onClick={onEnter} className="flex items-center gap-[10px] bg-transparent border-none cursor-pointer p-0">
          <span className="w-[30px] h-[30px] rounded-[8px] bg-gradient-to-br from-[#0d9488] to-[#0f766e] flex items-center justify-center text-white text-[14px] font-bold">
            L
          </span>
          <span className="text-[17px] font-bold text-[#0f172a] tracking-[-0.03em]">Ledger</span>
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-[30px]">
          {[
            { label: 'How it works', href: '#how-it-works' },
            { label: 'The problem', href: '#the-problem' },
            { label: 'The pipeline', href: '#the-pipeline' },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="relative text-[14px] font-medium text-[#64748b] hover:text-[#0d9488] transition-colors duration-200 cursor-pointer pb-[2px] group no-underline"
            >
              {item.label}
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0d9488] scale-x-0 origin-left transition-transform duration-200 group-hover:scale-x-100" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-[14px]">
          <a
            href="https://github.com/garvbahl37-gif/Ledger_agent"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:block text-[14px] font-medium text-[#64748b] hover:text-[#0f172a] transition-colors duration-200 no-underline"
          >
            GitHub
          </a>
          <button onClick={onEnter} className="bg-[#0d9488] text-white border-none rounded-[8px] px-[18px] py-[9px] text-[14px] font-semibold tracking-[-0.01em] cursor-pointer transition-colors duration-200 hover:bg-[#0f766e]">
            Open the analyst
          </button>
        </div>
      </nav>

      {/* 2. HERO */}
      <section className="relative bg-gradient-to-b from-[#f0fdfa] to-white overflow-hidden">
        <div
          className="absolute inset-0 z-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #0d9488 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="relative z-10 max-w-[1180px] mx-auto px-[24px] pt-[64px] pb-[64px] grid lg:grid-cols-[1.12fr_0.88fr] gap-[52px] items-center">

          {/* ── The claim ─────────────────────────────────────── */}
          <div className="text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="text-[clamp(32px,3.85vw,50px)] font-bold text-[#0f172a] tracking-[-0.04em] leading-[1.1] mb-[20px] max-w-[15ch] lg:max-w-none"
            >
              Point it at a spreadsheet of<br />pure noise. It will tell<br />you nothing.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
              className="max-w-[54ch] text-[16px] font-normal text-[#475569] leading-[1.7] tracking-[-0.01em] mb-[14px]"
            >
              Every other automated analyst will find a page of insights in that
              spreadsheet, each with a plausible story attached. Search 30 columns
              hard enough and roughly 22 relationships clear p&nbsp;&lt;&nbsp;0.05 on
              data with no structure at all.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16, ease: 'easeOut' }}
              className="max-w-[54ch] text-[16px] font-normal text-[#475569] leading-[1.7] tracking-[-0.01em] mb-[30px]"
            >
              Ledger registers its hypotheses before it runs a single test, then hands
              the verdict to code that contains no language model. A sentence with no
              ledger entry behind it cannot be written.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24, ease: 'easeOut' }}
              className="flex flex-row items-center gap-[12px] mb-[26px] flex-wrap"
            >
              <button onClick={onEnter} className="inline-flex items-center gap-[8px] bg-[#0d9488] text-white border-none rounded-[10px] px-[26px] py-[14px] text-[15px] font-semibold tracking-[-0.01em] cursor-pointer whitespace-nowrap transition-all duration-200 hover:bg-[#0f766e] hover:-translate-y-[1px] hover:shadow-[0_8px_24px_rgba(13,148,136,0.3)]">
                <Upload className="w-[16px] h-[16px]" />
                Analyse a table
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-[8px] bg-white text-[#0f172a] border-[1.5px] border-[#e2e8f0] rounded-[10px] px-[26px] py-[14px] text-[15px] font-semibold tracking-[-0.01em] cursor-pointer whitespace-nowrap no-underline transition-all duration-200 hover:border-[#0d9488] hover:text-[#0d9488]"
              >
                See how it works
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.34 }}
              className="flex items-center gap-[18px] flex-wrap text-[13px] text-[#64748b]"
            >
              <span className="flex items-center gap-[6px]">
                <Lock className="w-[13px] h-[13px] text-[#0d9488]" />
                Runs against a local model
              </span>
              <span className="flex items-center gap-[6px]">
                <ShieldCheck className="w-[13px] h-[13px] text-[#0d9488]" />
                Benjamini–Hochberg at q = 0.05
              </span>
            </motion.div>
          </div>

          {/* ── The null-dataset result ───────────────────────── */}
          <motion.figure
            initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
            className="m-0 bg-white rounded-[18px] border border-[#e2e8f0] shadow-[0_20px_56px_rgba(15,23,42,0.09)] overflow-hidden"
          >
            <div className="px-[22px] pt-[20px] pb-[6px]">
              <h2 className="text-[15px] font-bold text-[#0f172a] tracking-[-0.02em] m-0">
                The null-dataset test
              </h2>
              <p className="text-[13px] text-[#64748b] leading-[1.6] mt-[6px] mb-0">
                Give each system a table drawn at random — realistic column names,
                types and missingness, and no real relationships anywhere in it.
                Then count what each one claims to have found.
              </p>
            </div>

            <div className="px-[22px] py-[18px]">
              <NullTestChart />
            </div>

            <figcaption className="px-[22px] py-[13px] bg-[#f8fafc] border-t border-[#f1f5f9] text-[11.5px] text-[#64748b] leading-[1.6]">
              Bars are drawn as outlines because these are the values the evaluation
              in the synopsis is designed to test — stated in advance, so the project
              can be judged against a prediction rather than a story told afterwards.
              If the full system does not land at or near zero, that is a reportable
              negative result about the architecture.
            </figcaption>
          </motion.figure>
        </div>
      </section>


      <PipelineFilm />

      {/* 4. THE MEASURED RESULT */}
      <section id="the-problem" className="scroll-mt-[64px] w-full bg-white px-[24px] py-[104px]">
        <div className="mx-auto max-w-[1080px]">
          <div className="grid gap-[56px] lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <h2 className="m-0 max-w-[15ch] text-[clamp(28px,3.4vw,40px)] font-bold leading-[1.12] text-[#0f172a]">
                We tested this on 510 tables where we already knew the answer.
              </h2>
              <p className="mt-[18px] mb-0 max-w-[46ch] text-[16px] leading-[1.7] text-[#475569]">
                Two hundred of them contained nothing at all. Every column drawn
                independently, so the right number of findings was exactly zero, by
                construction rather than by opinion.
              </p>
              <p className="mt-[14px] mb-0 max-w-[46ch] text-[16px] leading-[1.7] text-[#475569]">
                An analyst that tests every pair and reports whatever clears the
                usual threshold found something in four cases out of five. The same
                tests, corrected once across the sealed list, found something in one
                case in forty.
              </p>
            </div>

            <div>
              {/* Two measurements, set as a comparison rather than a card row. */}
              <div className="border-t-2 border-[#0f172a]">
                {[
                  {
                    label: 'Tables where a false finding was reported',
                    a: '81.0%', b: '2.5%',
                    aNote: 'testing everything, uncorrected',
                    bNote: 'sealed list, corrected once',
                  },
                  {
                    label: 'False findings per table',
                    a: '2.20', b: '0.03',
                    aNote: 'on data containing nothing',
                    bNote: 'a 32-fold reduction',
                  },
                ].map((row) => (
                  <div key={row.label} className="border-b border-[#e2e8f0] py-[22px]">
                    <p className="m-0 mb-[14px] text-[13px] font-medium text-[#64748b]">
                      {row.label}
                    </p>
                    <div className="flex items-end gap-[30px]">
                      <div className="flex-1">
                        <div className="font-mono text-[clamp(28px,3.6vw,40px)] font-medium leading-none tracking-[-0.07em] text-[#94a3b8]">
                          {row.a}
                        </div>
                        <p className="m-0 mt-[8px] text-[12px] leading-[1.4] text-[#94a3b8]">{row.aNote}</p>
                      </div>
                      <div aria-hidden="true" className="mb-[18px] h-px w-[26px] bg-[#cbd5e1]" />
                      <div className="flex-1">
                        <div className="font-mono text-[clamp(28px,3.6vw,40px)] font-medium leading-none tracking-[-0.07em] text-[#0d9488]">
                          {row.b}
                        </div>
                        <p className="m-0 mt-[8px] text-[12px] leading-[1.4] text-[#0f766e]">{row.bNote}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-[20px] mb-0 text-[13px] leading-[1.6] text-[#64748b]">
                Measured, not projected. Both arms run the same test-selection code
                on the same tables, so the only thing that differs between them is
                the discipline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. WHAT IS ACTUALLY DIFFERENT */}
      <section id="how-it-works" className="scroll-mt-[64px] w-full bg-[#f8fafc] px-[24px] py-[104px]">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="m-0 mb-[8px] max-w-[22ch] text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.1] text-[#0f172a]">
            Four things this does that other tools do not.
          </h2>
          <p className="m-0 mb-[44px] max-w-[52ch] text-[16px] leading-[1.7] text-[#475569]">
            None of them are new ideas. Statisticians have argued for all four for
            decades. What is new is a system that cannot ignore them.
          </p>

          <div className="border-t border-[#e2e8f0]">
            {[
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
                body: 'Each claim in the write-up links back to the code that produced it, the assumptions that were checked and the number that came out. Click any of them and read the whole chain.',
              },
            ].map((item) => (
              <article
                key={item.n}
                className="grid gap-[10px] border-b border-[#e2e8f0] py-[30px] md:grid-cols-[64px_1fr_1.15fr] md:gap-[28px]"
              >
                <span className="font-mono text-[13px] text-[#94a3b8] md:pt-[5px]">{item.n}</span>
                <h3 className="m-0 text-[19px] font-semibold leading-[1.25] text-[#0f172a]">
                  {item.title}
                </h3>
                <p className="m-0 text-[15px] leading-[1.65] text-[#475569]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 6. WHAT YOU GET BACK */}
      <section id="the-pipeline" className="scroll-mt-[64px] w-full bg-white px-[24px] py-[104px]">
        <div className="mx-auto max-w-[1080px]">
          <div className="grid gap-[44px] lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h2 className="m-0 mb-[16px] max-w-[20ch] text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.1] text-[#0f172a]">
                You get the working, not just the answer.
              </h2>
              <p className="m-0 mb-[26px] max-w-[48ch] text-[16px] leading-[1.7] text-[#475569]">
                Every run produces a report you can audit line by line, a notebook
                that reruns the whole thing, and a hash that tells you whether
                anything changed since last time.
              </p>
              <ul className="m-0 list-none p-0">
                {[
                  'A written report where each claim opens its own receipt',
                  'A Jupyter notebook that reproduces every number',
                  'A standalone HTML file with the ledger travelling beside the prose',
                  'A hash to check one run against another',
                ].map((line) => (
                  <li key={line} className="flex gap-[12px] border-b border-[#f1f5f9] py-[11px] last:border-0">
                    <span aria-hidden="true" className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#0d9488]" />
                    <span className="text-[15px] leading-[1.5] text-[#334155]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <figure className="m-0 rounded-[14px] border border-[#e2e8f0] bg-[#fcfcfd] p-[22px]">
              <figcaption className="m-0 mb-[14px] text-[12.5px] text-[#64748b]">
                One entry from a real run
              </figcaption>
              <div className="border-l-2 border-[#0d9488] pl-[14px]">
                <p className="m-0 text-[14.5px] leading-[1.55] text-[#0f172a]">
                  Tenure differs between churned and retained customers.
                </p>
              </div>
              <dl className="m-0 mt-[18px] grid grid-cols-2 gap-x-[20px] gap-y-[13px]">
                {[
                  ['Test chosen', 'Mann-Whitney U'],
                  ['Why that one', 'normality failed'],
                  ['Corrected p', '7.8e-101'],
                  ['Effect size', '-1.42, large'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="m-0 text-[11px] text-[#94a3b8]">{k}</dt>
                    <dd className="m-0 mt-[3px] font-mono text-[13px] text-[#0f172a]">{v}</dd>
                  </div>
                ))}
              </dl>
            </figure>
          </div>
        </div>
      </section>


      {/* 7. CLOSE */}
      <section className="w-full bg-[#0f172a] px-[24px] py-[96px]">
        <div className="mx-auto max-w-[760px]">
          <h2 className="m-0 max-w-[18ch] text-[clamp(30px,3.6vw,44px)] font-bold leading-[1.1] text-white">
            Point it at a spreadsheet and see what it refuses to say.
          </h2>
          <p className="mt-[18px] mb-[34px] max-w-[52ch] text-[16px] leading-[1.7] text-white/55">
            Drop in a CSV, or paste a link to one. You will get a report where every
            claim opens the code behind it, and the questions that found nothing
            listed alongside the ones that did.
          </p>

          <div className="flex flex-wrap items-center gap-[14px]">
            <button
              onClick={onEnter}
              className="rounded-[10px] bg-white px-[26px] py-[14px] text-[15px] font-semibold tracking-[-0.01em] text-[#0f172a] transition-colors duration-200 hover:bg-[#f0fdfa]"
            >
              Analyse a table
            </button>
            <a
              href="https://github.com/garvbahl37-gif/Ledger_agent"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[10px] border border-white/20 px-[26px] py-[14px] text-[15px] font-semibold tracking-[-0.01em] text-white/85 no-underline transition-colors duration-200 hover:border-white/45 hover:text-white"
            >
              Read the code
            </a>
          </div>

          {/*
            The previous version of this claimed "Data never leaves your device",
            which is not true of the hosted build: the table goes to the engine and
            the engine calls a model. It is true only when you run it yourself
            against a local model, so that is what it says now.
          */}
          <p className="mt-[30px] mb-0 max-w-[56ch] text-[13px] leading-[1.65] text-white/40">
            Using the hosted version, your table is sent to our engine and column
            summaries are sent to a language model. If the data cannot leave your
            machine, run it locally against a local model. Both paths are in the
            repository.
          </p>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="bg-[#0f172a] w-full p-0">
        {/* TOP FOOTER BAND */}
        <div className="pt-[56px] pb-[48px] border-b border-white/[0.06]">
          <div className="max-w-[1160px] mx-auto px-[48px] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-[48px] items-start">
            
            {/* COLUMN 1 — Brand */}
            <div>
              <div className="flex items-center gap-[8px] mb-[14px]">
                <div className="w-[32px] h-[32px] rounded-[8px] bg-gradient-to-br from-[#0d9488] to-[#0f766e] flex items-center justify-center">
                  <span className="text-white text-[15px] font-extrabold">L</span>
                </div>
                <span className="text-white text-[18px] font-bold tracking-[-0.02em]">
                  Ledger
                </span>
              </div>
              <p className="text-white/[0.45] text-[13px] font-normal leading-[1.6] mb-[20px] max-w-[220px]">
                The analyst that refuses to hallucinate.
              </p>
              <div className="text-white/30 text-[12px] leading-[1.6]">
                <p>Built at NSUT · CSE · BTP 2023–27</p>
                <p>Dhruv Kumar · Rahul · Garv Bahl</p>
              </div>
            </div>

            {/* COLUMN 2 — Project */}
            <div>
              <h4 className="text-white/[0.35] text-[10px] font-bold tracking-[0.12em] uppercase mb-[16px]">
                Project
              </h4>
              {['About', 'Research Paper', 'Evaluation Protocol', 'GitHub'].map(link => (
                <a key={link} className="text-white/60 text-[13px] font-normal leading-[1] mb-[12px] block text-decoration-none cursor-pointer transition-colors duration-150 hover:text-white">
                  {link}
                </a>
              ))}
            </div>

            {/* COLUMN 3 — Stack */}
            <div>
              <h4 className="text-white/[0.35] text-[10px] font-bold tracking-[0.12em] uppercase mb-[16px]">
                Stack
              </h4>
              {['FastAPI', 'pandas + SciPy', 'statsmodels', 'Ollama', 'React + Vite', 'Plotly'].map(link => (
                <a key={link} className="text-white/60 text-[13px] font-normal leading-[1] mb-[12px] block text-decoration-none cursor-pointer transition-colors duration-150 hover:text-white">
                  {link}
                </a>
              ))}
            </div>

            {/* COLUMN 4 — Agents */}
            <div>
              <h4 className="text-white/[0.35] text-[10px] font-bold tracking-[0.12em] uppercase mb-[16px]">
                Agents
              </h4>
              {['A0 Janitor', 'A1 Profiler', 'A2 Proposer', 'A3 Registrar', 'A4 Executor', 'A5 Statistician'].map(link => (
                <a key={link} className="text-white/60 text-[13px] font-normal leading-[1] mb-[12px] block text-decoration-none cursor-pointer transition-colors duration-150 hover:text-white">
                  {link}
                </a>
              ))}
            </div>

          </div>
        </div>

        {/* BOTTOM FOOTER BAR */}
        <div className="py-[20px] px-[48px] max-w-[1160px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-[8px] text-center sm:text-left">
          <div className="text-[12px] text-white/25 font-normal">
            © 2026 Ledger. NSUT Department of Computer Science & Engineering.
          </div>
          <div className="flex gap-[20px]">
            {['Privacy', 'Terms', 'Contact'].map(link => (
              <a key={link} className="text-[12px] text-white/25 hover:text-white/60 transition-colors duration-150 cursor-pointer text-decoration-none">
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>

    </div>
  );
}
