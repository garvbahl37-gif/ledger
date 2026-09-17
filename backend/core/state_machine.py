"""
State Machine Orchestrator
============================
The hand-written pipeline that routes agents in strict order.
Streams progress events via an async generator for SSE.

PIPELINE ORDER:
A0 → A1 → A2 → [A3 FREEZE] → A4 ↔ A5 → A6 ↔ A7 → COMPLETE

A10 (Visual Analyst) runs in parallel after A0.
A9 (SQL Converter) runs on-demand per user query.
A8 (Meta-Agent) runs as a background scheduled task.
"""
import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Optional

from core.ledger import Ledger, PipelineStage
from agents import (
    a0_janitor, a1_profiler, a2_proposer,
    a3_registrar, a4_executor, a5_statistician,
    a6_reporter, a7_adversary, a10_visual_analyst,
)

logger = logging.getLogger(__name__)


def _make_event(stage: str, message: str, data: dict = None) -> str:
    """Format a Server-Sent Event (SSE) string."""
    payload = {"stage": stage, "message": message, **(data or {})}
    return f"data: {json.dumps(payload)}\n\n"


async def run_pipeline(
    ledger: Ledger,
    file_bytes: bytes,
    filename: str,
    user_hypotheses: Optional[list] = None,
) -> AsyncGenerator[str, None]:
    """
    Async generator that runs the full agent pipeline and yields SSE events.
    The React frontend consumes these events to show real-time progress.
    
    Args:
        ledger: Fresh session ledger.
        file_bytes: Raw uploaded file bytes.
        filename: Original file name.
        user_hypotheses: Optional user-provided hypotheses.
    
    Yields:
        SSE-formatted event strings.
    """
    try:
        # ── A0: Data Janitor ──────────────────────────────────────────────
        yield _make_event("A0_JANITOR", "🧹 Cleaning and profiling your data...")
        await asyncio.sleep(0)   # Yield control to event loop
        start = time.perf_counter()
        ledger = a0_janitor.run(ledger, file_bytes, filename)
        ledger.agent_timings["A0"] = time.perf_counter() - start

        dataset = ledger.dataset
        _loaded = f"✅ Loaded {dataset.n_rows:,} rows × {dataset.n_cols} columns"
        if dataset.n_duplicates_removed:
            _loaded += (
                f" — {dataset.n_duplicates_removed:,} duplicate "
                f"{'row' if dataset.n_duplicates_removed == 1 else 'rows'} removed "
                f"from {dataset.n_rows_raw:,}"
            )
        yield _make_event("A0_JANITOR", _loaded, {
            "rows": dataset.n_rows,
            "rows_raw": dataset.n_rows_raw,
            "duplicates_removed": dataset.n_duplicates_removed,
            "cols": dataset.n_cols,
            "filename": filename,
        })
        await asyncio.sleep(0)

        # ── A10: Visual Dashboard (runs after A0, non-blocking to main pipeline) ──
        yield _make_event("A10_VISUAL", "📊 Generating visual dashboard...")
        await asyncio.sleep(0)
        try:
            start = time.perf_counter()
            ledger = a10_visual_analyst.run(ledger)
            ledger.agent_timings["A10"] = time.perf_counter() - start
            yield _make_event("A10_VISUAL", "✅ Dashboard ready")
        except Exception as e:
            logger.warning(f"[Orchestrator] A10 failed (non-critical): {e}")
            yield _make_event("A10_VISUAL", f"⚠️ Dashboard generation skipped: {str(e)[:100]}")
        await asyncio.sleep(0)

        # ── A1: Profiler ──────────────────────────────────────────────────
        yield _make_event("A1_PROFILER", "🔬 Computing statistical profiles...")
        await asyncio.sleep(0)
        start = time.perf_counter()
        ledger = a1_profiler.run(ledger)
        ledger.agent_timings["A1"] = time.perf_counter() - start
        yield _make_event("A1_PROFILER", f"✅ Profiled {dataset.n_cols} columns")
        await asyncio.sleep(0)

        # ── A2: Proposer ─────────────────────────────────────────────────
        yield _make_event("A2_PROPOSER", "🤔 LLM proposing testable hypotheses...")
        await asyncio.sleep(0)
        start = time.perf_counter()
        ledger = a2_proposer.run(ledger, user_hypotheses=user_hypotheses)
        ledger.agent_timings["A2"] = time.perf_counter() - start
        yield _make_event("A2_PROPOSER", f"✅ {len(ledger.hypotheses)} hypotheses proposed", {
            "hypotheses": [{"id": h.id, "statement": h.statement} for h in ledger.hypotheses]
        })
        await asyncio.sleep(0)

        # ── A3: Registrar (FREEZE) ────────────────────────────────────────
        yield _make_event("A3_REGISTRAR", "🔒 Freezing hypothesis registry (selective reporting now impossible)...")
        await asyncio.sleep(0)
        start = time.perf_counter()
        ledger = a3_registrar.run(ledger)
        ledger.agent_timings["A3"] = time.perf_counter() - start
        yield _make_event("A3_REGISTRAR", f"✅ Registry frozen. Hash: {ledger.registry_hash}", {
            "registry_hash": ledger.registry_hash,
            "frozen": True,
        })
        await asyncio.sleep(0)

        # ── A4 + A5: Execute + Adjudicate (per hypothesis) ────────────────
        yield _make_event("A4_EXECUTOR", f"⚙️ Executing tests for {len(ledger.hypotheses)} hypotheses...")
        await asyncio.sleep(0)
        start = time.perf_counter()
        ledger = a4_executor.run(ledger)
        ledger.agent_timings["A4"] = time.perf_counter() - start

        yield _make_event("A4_EXECUTOR", "✅ Code execution complete. Running statistical adjudication...")
        await asyncio.sleep(0)

        # ── A5: Statistician ──────────────────────────────────────────────
        start = time.perf_counter()
        ledger = a5_statistician.run(ledger)
        ledger.agent_timings["A5"] = time.perf_counter() - start

        supported = ledger.get_supported_hypotheses()
        yield _make_event("A5_STATISTICIAN", f"✅ FDR correction applied. {len(supported)}/{len(ledger.hypotheses)} hypotheses supported", {
            "supported": len(supported),
            "total": len(ledger.hypotheses),
            "fdr_method": "Benjamini-Hochberg",
        })
        await asyncio.sleep(0)

        # ── A6: Reporter ──────────────────────────────────────────────────
        yield _make_event("A6_REPORTER", "📝 Writing grounded statistical report...")
        await asyncio.sleep(0)
        start = time.perf_counter()
        ledger = a6_reporter.run(ledger)
        ledger.agent_timings["A6"] = time.perf_counter() - start
        yield _make_event("A6_REPORTER", "✅ Report drafted. Sending to Red Team...")
        await asyncio.sleep(0)

        # ── A7: Adversary ─────────────────────────────────────────────────
        yield _make_event("A7_ADVERSARY", "🔴 Red Team auditing report for statistical violations...")
        await asyncio.sleep(0)
        start = time.perf_counter()
        ledger = a7_adversary.run(ledger)
        ledger.agent_timings["A7"] = time.perf_counter() - start

        violations = ledger.adversary_violations
        if ledger.report_validated:
            yield _make_event("A7_ADVERSARY", f"✅ Report approved by Red Team ({len(violations)} minor issues resolved)")
        else:
            yield _make_event("A7_ADVERSARY", f"⚠️ Report emitted with {len(violations)} unresolved flags", {
                "violations": [v.violation_type for v in violations]
            })
        await asyncio.sleep(0)

        # ── COMPLETE ──────────────────────────────────────────────────────
        ledger.advance_stage(PipelineStage.COMPLETE)
        final_hash = ledger.compute_final_hash()
        total_time = sum(ledger.agent_timings.values())

        yield _make_event("COMPLETE", "🎉 Analysis complete!", {
            "session_id": ledger.session_id,
            "reproducibility_hash": final_hash,
            "total_time_s": round(total_time, 2),
            "total_tokens": ledger.total_tokens_used,
            "llm_calls": ledger.llm_call_count,
            "self_repairs": ledger.self_repair_count,
            "report_validated": ledger.report_validated,
        })

    except Exception as e:
        logger.exception(f"[Orchestrator] Pipeline failed: {e}")
        ledger.advance_stage(PipelineStage.FAILED)
        yield _make_event("ERROR", f"❌ Pipeline error: {str(e)}", {"error": str(e)})
