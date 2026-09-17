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

      {/* 4. PROBLEM STATEMENT */}
      <section id="the-problem" className="scroll-mt-[64px] bg-[#ffffff] py-[110px] px-[24px] w-full">
        <div className="max-w-[780px] mx-auto flex flex-col items-center text-center">
          <span className="text-[11px] font-bold tracking-[0.14em] text-[#0d9488] uppercase mb-[20px] block">
            The Problem
          </span>
          <h2 className="text-[clamp(36px,4.5vw,56px)] font-extrabold text-[#0f172a] tracking-[-0.03em] leading-[1.1] m-0 block">
            The Multiple Comparisons Problem.
          </h2>
          <span className="text-[clamp(36px,4.5vw,56px)] font-extrabold text-[#0d9488] italic tracking-[-0.03em] leading-[1.1] mt-[4px] block">
            Solved.
          </span>
          
          <p className="mt-[28px] max-w-[620px] text-[17px] text-[#64748b] leading-[1.8] font-normal tracking-[-0.01em] text-center">
            LLMs are eager to please. When handed a dataset and asked for insights,
            they will test thousands of combinations and only report the statistically
            significant ones — guaranteeing false discoveries. Ledger eliminates
            p-hacking by explicitly separating hypothesis generation from testing,
            enforced structurally by the pipeline architecture.
          </p>

          <div className="mt-[56px] mb-[56px] w-[64px] h-[2px] bg-gradient-to-r from-[#0d9488] to-[#99f6e4] rounded-[2px] self-center" />

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-0 w-full max-w-[640px] mx-auto border border-[#e2e8f0] rounded-[16px] overflow-hidden bg-white"
          >
            {[
              { target: 14, label: "False findings by LLM agents on pure noise", prefix: "~", color: "#0d9488" },
              { target: 0, label: "False findings by Ledger (NULLSET target)", prefix: "", color: "#ef4444" },
              { target: 1.00, label: "Groundedness — every claim auditable", prefix: "", color: "#10b981", isFloat: true }
            ].map((stat, i) => (
              <div key={i} className="px-[24px] py-[32px] flex flex-col items-center text-center md:border-r border-b md:border-b-0 border-[#e2e8f0] last:border-0 transition-colors duration-200 hover:bg-[#f0fdfa]">
                <div 
                  className="text-[52px] font-extrabold tracking-[-0.04em] leading-[1] mb-[10px] tabular-nums"
                  style={{ color: stat.color }}
                >
                  {stat.prefix}<Counter to={stat.target} duration={1.8} isFloat={stat.isFloat} delay={i * 0.2} />
                </div>
                <div className="text-[12px] font-medium text-[#64748b] leading-[1.5] max-w-[120px] text-center">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 5. FEATURE CARDS */}
      <section id="how-it-works" className="scroll-mt-[64px] bg-[#f8fafc] py-[110px] px-[24px] w-full">
        <div className="max-w-[1160px] mx-auto">
          <div className="text-center mb-[64px]">
            <span className="text-[11px] font-bold tracking-[0.14em] text-[#0d9488] uppercase mb-[16px] block">
              How It Works
            </span>
            <h2 className="text-[clamp(32px,4vw,48px)] font-extrabold text-[#0f172a] tracking-[-0.03em] leading-[1.15] m-0">
              Six Agents. One Auditable Truth.
            </h2>
          </div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={{
              visible: { transition: { staggerChildren: 0.08 } },
              hidden: {}
            }}
            className="grid grid-cols-1 min-[900px]:grid-cols-2 lg:grid-cols-3 gap-[24px] w-full"
          >
            {[
              { icon: Lock, title: "Hypothesis Pre-registration", desc: "Hypotheses are frozen before any test executes. Post-hoc selection is structurally impossible — not just discouraged.", badge: "A3 REGISTRAR" },
              { icon: BarChart2, title: "Benjamini–Hochberg FDR Control", desc: "Every test is corrected across the full session family. The system refuses to report a finding it cannot statistically support.", badge: "A5 STATISTICIAN" },
              { icon: FileSearch, title: "Claim-Level Provenance", desc: "Every sentence in the report links to the exact code that ran, the values returned, and the test that licensed it. Unbacked narration is rejected.", badge: "A6 REPORTER" },
              { icon: Shield, title: "Sandboxed Code Execution", desc: "LLM-generated pandas code runs in an isolated subprocess with import blocklist, resource limits, and zero socket access.", badge: "A4 EXECUTOR" },
              { icon: RefreshCw, title: "Self-Improving Loop", desc: "A8 Meta-Agent mines LangSmith telemetry for failure patterns and generates prompt patches — improving accuracy without retraining weights.", badge: "A8 META-AGENT" },
              { icon: Database, title: "DPDPA-Compliant Local Analysis", desc: "No data leaves your machine. Run on clinical, financial, and student data that cannot legally be uploaded to cloud services.", badge: "LOCAL FIRST" }
            ].map((card, i) => (
              <motion.div 
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 32 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } }
                }}
                className="group relative bg-white border border-[#e2e8f0] rounded-[20px] px-[28px] py-[32px] flex flex-col items-start text-left cursor-default transition-all duration-300 overflow-hidden hover:-translate-y-[6px] hover:border-[#99f6e4] hover:shadow-[0_20px_48px_rgba(13,148,136,0.1),0_4px_12px_rgba(13,148,136,0.06)]"
              >
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#0d9488] to-[#99f6e4] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="w-[48px] h-[48px] bg-[#f0fdfa] rounded-[12px] flex items-center justify-center mb-[20px] border border-[#ccfbf1] transition-all duration-300 group-hover:bg-[#0d9488]">
                  <card.icon className="w-[22px] h-[22px] text-[#0d9488] group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-[16px] font-bold text-[#0f172a] tracking-[-0.02em] mb-[10px] leading-[1.3] text-left">
                  {card.title}
                </h3>
                <p className="text-[14px] text-[#64748b] leading-[1.7] font-normal flex-grow">
                  {card.desc}
                </p>
                <div className="mt-[20px] inline-flex items-center bg-[#f0fdfa] border border-[#99f6e4] rounded-[100px] px-[12px] py-[4px] text-[10px] font-bold text-[#0d9488] tracking-[0.08em] uppercase">
                  {card.badge}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 6. AGENT CARDS (Horizontal Auto-Scroll Carousel) */}
      <section id="the-pipeline" className="scroll-mt-[64px] bg-white py-[100px] w-full overflow-hidden">
        <div className="max-w-[780px] mx-auto mb-[56px] px-[24px] text-center">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-[#0d9488] uppercase block mb-[14px]">
            The Pipeline
          </span>
          <h2 className="text-[clamp(26px,3vw,38px)] font-bold text-[#0f172a] tracking-[-0.03em] leading-[1.2] m-0 mb-[12px]">
            The 6-Stage Autonomous State Machine
          </h2>
          <p className="text-[15px] font-normal text-[#94a3b8] leading-[1.6] tracking-[-0.01em]">
            A rigid, inspectable LangGraph pipeline where every transition is a correctness property — not a suggestion.
          </p>
        </div>

        <div className="relative w-full">
          {/* Left Fade */}
          <div className="absolute left-0 top-0 bottom-0 w-[80px] bg-gradient-to-r from-white to-transparent z-[2] pointer-events-none" />
          {/* Right Fade */}
          <div className="absolute right-0 top-0 bottom-0 w-[80px] bg-gradient-to-l from-white to-transparent z-[2] pointer-events-none" />

          {/* Scrolling Track */}
          <div className="flex gap-[20px] px-[80px] pt-[20px] pb-[32px] overflow-x-auto scroll-smooth cursor-grab active:cursor-grabbing hide-scrollbar animate-autoScroll hover:animate-pause">
            <style dangerouslySetInnerHTML={{__html: `
              .hide-scrollbar::-webkit-scrollbar { display: none; }
              .hide-scrollbar { scrollbar-width: none; }
              @keyframes autoScroll {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
              .animate-autoScroll {
                animation: autoScroll 30s linear infinite;
              }
              .animate-autoScroll:hover {
                animation-play-state: paused;
              }
            `}} />

            {/* Duplicate the array for seamless loop */}
            {[...pipelineStages, ...pipelineStages].map((stage, i) => (
              <div 
                key={i} 
                className="group min-w-[260px] max-w-[260px] bg-white border border-[#e2e8f0] rounded-[18px] p-[24px_22px] flex flex-col gap-0 shrink-0 relative overflow-hidden transition-all duration-[280ms] ease-out cursor-default hover:-translate-y-[8px] hover:shadow-[0_20px_48px_rgba(13,148,136,0.13),0_4px_12px_rgba(0,0,0,0.06)] hover:border-[#99f6e4]"
              >
                {/* Top Accent Bar */}
                <div 
                  className="absolute top-0 left-0 right-0 h-[3px] rounded-[18px_18px_0_0]"
                  style={{ backgroundColor: stage.color }}
                />

                {/* STAGE NUMBER + BADGE */}
                <div className="flex items-center justify-between mb-[18px] mt-[6px]">
                  <div 
                    className="w-[32px] h-[32px] rounded-[8px] flex items-center justify-center text-[13px] font-bold tracking-[-0.02em]"
                    style={{ backgroundColor: stage.numBg, color: stage.numColor }}
                  >
                    {stage.id}
                  </div>
                  <div 
                    className="font-bold text-[9px] tracking-[0.08em] uppercase px-[9px] py-[3px] rounded-[100px] border"
                    style={{ backgroundColor: stage.badgeBg, color: stage.badgeColor, borderColor: stage.badgeBorder }}
                  >
                    {stage.badge}
                  </div>
                </div>

                {/* AGENT NAME */}
                <h4 className="text-[15px] font-bold text-[#0f172a] tracking-[-0.03em] leading-[1.2] mb-[8px]">
                  {stage.name}
                </h4>

                {/* DESCRIPTION */}
                <p className="text-[12.5px] font-normal text-[#64748b] leading-[1.6] tracking-[-0.01em] flex-grow mb-[16px]">
                  {stage.desc}
                </p>

                {/* INPUT -> OUTPUT */}
                <div className="flex items-center gap-[6px] p-[8px_10px] bg-[#f8fafc] rounded-[8px] border border-[#f1f5f9]">
                  <span className="text-[10px] font-medium text-[#94a3b8] font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[85px]">
                    {stage.in}
                  </span>
                  <span className="text-[11px] font-bold text-[#0d9488] shrink-0">
                    →
                  </span>
                  <span className="text-[10px] font-semibold text-[#0d9488] font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[95px]">
                    {stage.out}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {/* Connecting Dots below */}
          <div className="flex justify-center items-center gap-[8px] mt-[8px]">
            {pipelineStages.map((stage, i) => (
              <React.Fragment key={i}>
                <div className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: stage.color }} />
                {i < pipelineStages.length - 1 && (
                  <div className="w-[24px] h-[1px] bg-[#e2e8f0]" />
                )}
              </React.Fragment>
            ))}
          </div>

        </div>
      </section>

      {/* 7. CTA FOOTER BANNER */}
      <section className="bg-gradient-to-br from-[#0d9488] via-[#0f766e] to-[#134e4a] py-[80px] w-full">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/70 font-semibold mb-4">Ready to Analyse?</div>
          <h2 className="text-[40px] font-extrabold text-white leading-tight tracking-[-0.03em] mb-4">
            Upload a CSV. Get an audited report in minutes.
          </h2>
          <p className="text-[16px] text-white/75 leading-relaxed max-w-2xl mx-auto mb-10">
            No API key for your data. No dark pattern. Every finding traceable.
          </p>
          <button onClick={onEnter} className="bg-white text-[#0d9488] rounded-xl px-[32px] py-[16px] text-[15px] font-bold hover:-translate-y-[2px] hover:shadow-[0_12px_32px_rgba(0,0,0,0.2)] transition-all duration-300 mb-8">
            Upload Your First CSV →
          </button>
          <div className="flex flex-wrap items-center justify-center gap-6 text-[13px] font-medium text-white/85">
            <span>✓ Free forever</span>
            <span>✓ No signup required</span>
            <span>✓ Data never leaves your device</span>
          </div>
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
              {['FastAPI', 'LangGraph', 'Groq API', 'LangSmith', 'React + Vite', 'Supabase'].map(link => (
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
