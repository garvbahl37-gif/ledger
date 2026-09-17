"""
Ledger Backend — FastAPI Entry Point
======================================
Production-ready REST + SSE API.
All routes are prefixed with /api.

Endpoints:
  POST /api/sessions/create          - Create a new analysis session
  POST /api/sessions/{id}/upload     - Upload CSV/Excel (triggers full pipeline via SSE)
  GET  /api/sessions/{id}/status     - Get current ledger state
  GET  /api/sessions/{id}/report     - Get final HTML report + dashboard
  POST /api/sessions/{id}/sql        - Run NL→SQL query
  POST /api/sessions/{id}/hypotheses - Add user-defined hypotheses
  POST /api/sessions/{id}/chat       - Multi-turn conversational follow-up
  GET  /api/admin/sessions           - List all active sessions
  POST /api/admin/meta-agent/run     - Trigger A8 self-improvement cycle manually
  GET  /api/sessions/{id}/telemetry  - Per-session agent/hypothesis/adversary events
  GET  /api/sessions/{id}/notebook   - Download the session as a Jupyter notebook
  GET  /api/sessions/{id}/export/report.html - Download a standalone HTML report
  GET  /api/sessions/{id}/export/report.pdf  - Download a print-ready PDF report
  GET  /api/admin/telemetry/overview - Cross-session telemetry + failure patterns
  GET  /api/admin/prompt-versions    - A8's prompt evolution history
  GET  /api/health                   - Health check
"""
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from core.ledger import PipelineStage
from core.session_store import session_store
from core.state_machine import run_pipeline
from agents.a9_sql_converter import run as run_sql
from agents.a8_meta_agent import run as run_meta_agent
from rag.document_ingestor import parse_document, build_rag_context
from connectors.google_sheets import fetch_from_url
from observability.models import (
    create_tables, SessionLocal, AgentEvent, HypothesisEvent,
    AdversaryEvent, PromptVersion,
)
from exports.notebook import build_notebook
from exports.html_report import build_html

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown tasks."""
    logger.info("Starting Ledger API...")
    create_tables()
    logger.info("Telemetry database initialized.")
    yield
    logger.info("Ledger API shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Ledger API",
    description=(
        "Multi-agent statistical analysis engine. "
        "LLM proposes, deterministic statistics decides. "
        "No hallucination. No p-hacking."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Browsers refuse "*" together with credentials, and a deployed engine is
# talking to exactly one known interface, so the allowed origins are read from
# the environment. ALLOWED_ORIGINS is a comma-separated list; unset means allow
# anything, which is the right default for local development only.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = (
    [o.strip().rstrip("/") for o in _origins_env.split(",") if o.strip()]
    if _origins_env else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=_origins_env != "",
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS allowed origins: %s", ALLOWED_ORIGINS)


# ─── Request/Response Models ───────────────────────────────────────────────────

class CreateSessionResponse(BaseModel):
    session_id: str
    message: str

class SQLQueryRequest(BaseModel):
    query: str

class HypothesesRequest(BaseModel):
    hypotheses: List[str]

class ChatRequest(BaseModel):
    message: str

class MetaAgentResponse(BaseModel):
    improvements_made: List[dict]
    total_improvements: int
    run_at: str

class ConnectSheetRequest(BaseModel):
    url: str
    user_hypotheses: Optional[List[str]] = None

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "Ledger API",
        "status": "running",
        "version": "1.0.0",
        "description": "Multi-agent statistical analysis. No hallucination.",
    }

@app.get("/api/health")
def health():
    """
    Liveness plus enough configuration detail for the interface to explain
    itself. `model_provider` is what the client needs most: a reachable engine
    with no provider configured looks healthy and fails at A2.
    """
    ollama_local = bool(os.getenv("OLLAMA_HOST"))
    ollama_cloud = bool(os.getenv("OLLAMA_API_KEY"))
    groq = bool(os.getenv("GROQ_API_KEY"))
    gemini = bool(os.getenv("GEMINI_API_KEY"))

    provider = (
        "ollama-local" if ollama_local
        else "ollama-cloud" if ollama_cloud
        else "groq" if groq
        else "gemini" if gemini
        else None
    )

    return {
        "status": "healthy",
        "model_provider": provider,
        "model_configured": provider is not None,
        "ollama_configured": ollama_local or ollama_cloud,
        "groq_configured": groq,
        "gemini_configured": gemini,
        "active_sessions": len(session_store.list_sessions()),
        "version": app.version,
    }


# ─── Sessions ─────────────────────────────────────────────────────────────────

@app.post("/api/sessions/create", response_model=CreateSessionResponse)
def create_session():
    """Create a new analysis session."""
    ledger = session_store.create()
    logger.info(f"Created session: {ledger.session_id}")
    return CreateSessionResponse(
        session_id=ledger.session_id,
        message="Session created. Upload a CSV or Excel file to begin analysis.",
    )


# The ceiling the container can actually survive, enforced where the bytes
# arrive. A0 checks this too, but by the time an agent runs the body has already
# been pulled into memory in full, so a check there cannot prevent the
# exhaustion it describes — it only reports it afterwards.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 40_000_000))
_UPLOAD_CHUNK = 1 << 20


async def _read_capped(upload: UploadFile, limit: int = MAX_UPLOAD_BYTES) -> bytes:
    """
    Read an upload, refusing past `limit` without buffering the whole body.

    await upload.read() with no argument materialises the entire request, so a
    file far larger than the instance can hold is fully resident before anything
    gets to object to it. Reading in chunks and stopping at the limit means an
    oversized upload costs one chunk more than the limit rather than all of it.
    """
    chunks, total = [], 0
    while True:
        chunk = await upload.read(_UPLOAD_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"This file is larger than the {limit / 1e6:.0f}MB this "
                    f"deployment can hold in memory. Upload a subset, or drop "
                    f"columns you are not testing."
                ),
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _assert_unused(ledger) -> None:
    """
    Refuse to run a second analysis over a ledger that has already been sealed.

    Re-running one is not a harmless convenience. freeze() is a no-op once
    is_frozen is set and add_hypothesis() rejects everything after it, so the
    second run profiles the new table, has its proposals turned away, and then
    tests the *previous* run's hypotheses against data they were never written
    for. Every one errors, while the earlier run's statistical results and
    report text stay attached to the entries and go on rendering. The reader
    ends up looking at one dataset's name above another dataset's findings.

    A frozen registry is the one thing this engine promises is immutable, so
    the refusal is structural here rather than a convention the client is
    trusted to keep.
    """
    if ledger.is_frozen or ledger.hypotheses:
        raise HTTPException(
            status_code=409,
            detail=(
                "This session has already run and its registry is sealed. "
                "Create a new session for a new analysis — a sealed registry "
                "cannot be reused without invalidating the pre-registration."
            ),
        )


@app.post("/api/sessions/{session_id}/upload")
async def upload_and_analyze(
    session_id: str,
    file: UploadFile = File(...),
    user_hypotheses: Optional[str] = Form(None),   # JSON-encoded list
    data_dict: Optional[UploadFile] = File(None),  # Optional data dictionary
):
    """
    Upload a file and stream the full pipeline as Server-Sent Events.
    
    The response is an SSE stream. Connect with EventSource in the frontend.
    Each event has a `stage` and `message` field.
    """
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    _assert_unused(ledger)

    # Read file bytes
    file_bytes = await _read_capped(file)
    filename = file.filename or "upload.csv"

    # Parse user hypotheses if provided
    parsed_hypotheses = None
    if user_hypotheses:
        try:
            parsed_hypotheses = json.loads(user_hypotheses)
        except json.JSONDecodeError:
            parsed_hypotheses = [user_hypotheses]

    # Ingest optional data dictionary for RAG
    if data_dict:
        dict_bytes = await _read_capped(data_dict, 5_000_000)
        dict_content = dict_bytes.decode("utf-8", errors="replace")
        chunks = parse_document(dict_content, data_dict.filename or "dict.txt")
        rag_context = build_rag_context(chunks, query="column descriptions")
        if ledger.dataset:
            ledger.dataset.rag_context = rag_context
        else:
            # Store for use once dataset is loaded
            ledger._pending_rag_context = rag_context

    session_store.update(ledger)

    async def event_stream():
        async for event in run_pipeline(ledger, file_bytes, filename, parsed_hypotheses):
            session_store.update(ledger)   # Persist state after each step
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",    # Needed for Nginx/Render
        },
    )


@app.post("/api/sessions/{session_id}/connect-sheet")
async def connect_google_sheet(session_id: str, request: ConnectSheetRequest):
    """
    Connect to a Google Sheet or Drive CSV via URL.
    Streams the full pipeline as Server-Sent Events.
    """
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    _assert_unused(ledger)

    try:
        # Fetch file bytes and inferred filename from the connector
        file_bytes, filename = fetch_from_url(request.url)
    except Exception as e:
        logger.error(f"Failed to fetch sheet: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    async def event_stream():
        async for event in run_pipeline(ledger, file_bytes, filename, request.user_hypotheses):
            session_store.update(ledger)   # Persist state after each step
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/sessions/{session_id}/status")
def get_session_status(session_id: str):
    """Get the current stage and summary of a session."""
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return {
        "session_id": ledger.session_id,
        "stage": ledger.current_stage.value,
        "is_frozen": ledger.is_frozen,
        "hypothesis_count": len(ledger.hypotheses),
        "supported_count": len(ledger.get_supported_hypotheses()),
        "report_validated": ledger.report_validated,
        "total_tokens": ledger.total_tokens_used,
        "self_repairs": ledger.self_repair_count,
        "reproducibility_hash": ledger.registry_hash,
    }


@app.get("/api/sessions/{session_id}/report")
def get_report(session_id: str):
    """Get the final analysis report, visualizations, and ledger entries."""
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    if ledger.current_stage not in [PipelineStage.COMPLETE, PipelineStage.ADVERSARY]:
        raise HTTPException(status_code=400, detail="Analysis not yet complete")

    return {
        "session_id": ledger.session_id,
        "report_html": ledger.report_html,
        "report_validated": ledger.report_validated,
        "adversary_violations": [
            v.dict() for v in ledger.adversary_violations
        ],
        "reproducibility_hash": ledger.compute_final_hash(),
        "ledger_entries": [
            {
                "id": h.id,
                "statement": h.statement,
                "status": h.status.value,
                "user_defined": h.user_defined,
                "columns_involved": h.columns_involved,
                "statistical_result": h.statistical_result.dict() if h.statistical_result else None,
                "chart_spec": h.chart_spec,
                "repair_count": len(h.execution_attempts) - 1 if h.execution_attempts else 0,
                "failure_reason": h.failure_reason,
            }
            for h in ledger.hypotheses
        ],
        "visualization_dashboard": ledger.visualization_dashboard.dict() if ledger.visualization_dashboard else None,
        "agent_timings": ledger.agent_timings,
        "dataset": ledger.dataset.dict() if ledger.dataset else None,
    }


@app.post("/api/sessions/{session_id}/sql")
def run_sql_query(session_id: str, request: SQLQueryRequest):
    """Convert a natural language question to SQL + Mermaid flowchart."""
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    if not hasattr(ledger, "_cleaned_df") or ledger._cleaned_df is None:
        detail = (
            "The table for this session is no longer held in memory — only the most "
            "recent analyses keep theirs. The report, the register and every export "
            "still work; re-run the file to query it again."
            if ledger.hypotheses else
            "No dataset loaded. Upload a file first."
        )
        raise HTTPException(status_code=400, detail=detail)

    ledger = run_sql(ledger, request.query)
    session_store.update(ledger)

    result = getattr(ledger, "_sql_query_result", {})
    return {
        "sql_query": ledger.sql_result.sql_query,
        "explanation": ledger.sql_result.explanation,
        "flowchart_mermaid": ledger.sql_result.flowchart_mermaid,
        "query_result": result,
    }


@app.post("/api/sessions/{session_id}/hypotheses")
def add_user_hypotheses(session_id: str, request: HypothesesRequest):
    """Add user-defined natural language hypotheses before the ledger is frozen."""
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    if ledger.is_frozen:
        raise HTTPException(
            status_code=409,
            detail="Ledger is frozen. User hypotheses must be submitted before analysis begins."
        )

    from core.ledger import HypothesisEntry
    added = []
    for i, stmt in enumerate(request.hypotheses):
        entry = HypothesisEntry(
            id=f"UH{len(ledger.hypotheses)+1:02d}",
            statement=stmt,
            columns_involved=[],
            user_defined=True,
        )
        ledger.add_hypothesis(entry)
        added.append(entry.id)

    session_store.update(ledger)
    return {"added": added, "total_hypotheses": len(ledger.hypotheses)}


@app.post("/api/sessions/{session_id}/chat")
def chat_followup(session_id: str, request: ChatRequest):
    """
    Multi-turn conversational follow-up.
    Routes questions about the analysis to the appropriate handler.
    """
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    message = request.message.strip()
    ledger.conversation_history.append({"role": "user", "content": message})

    # Check if user is asking about a specific hypothesis
    import re
    h_match = re.search(r'\b(H\d+|UH\d+)\b', message.upper())
    if h_match:
        h_id = h_match.group(1)
        hypothesis = ledger.get_hypothesis(h_id)
        if hypothesis:
            reply = (
                f"**{h_id}: {hypothesis.statement}**\n\n"
                f"Status: {hypothesis.status.value}\n"
            )
            if hypothesis.statistical_result:
                r = hypothesis.statistical_result
                reply += (
                    f"Test: {r.test_name}\n"
                    f"Raw p-value: {r.raw_p_value:.4f}\n"
                    f"FDR-adjusted p-value: {r.fdr_adjusted_p_value:.4f}\n"
                    f"Effect size: {r.effect_size_label} ({r.effect_size:.3f})\n\n"
                    f"**Authoritative conclusion:** {r.licensed_text}"
                )
        else:
            reply = f"I couldn't find hypothesis {h_id} in this session."
    else:
        # General grounded Q&A — only cite from licensed texts
        from core.llm_client import call_llm
        licensed = ledger.get_licensed_texts()
        system = (
            "You are a data analysis assistant. "
            "Answer ONLY using the findings listed below. "
            "Do not invent new findings. "
            "If the answer is not in the findings, say so clearly.\n\n"
            "FINDINGS:\n" + "\n".join(f"- {t}" for t in licensed)
        )
        reply, tokens = call_llm(
            system_prompt=system,
            user_prompt=message,
            temperature=0.3,
            max_tokens=500,
        )
        ledger.total_tokens_used += tokens
        ledger.llm_call_count += 1

    ledger.conversation_history.append({"role": "assistant", "content": reply})
    session_store.update(ledger)
    return {"reply": reply}


# ─── Exports ──────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_id}/notebook")
def export_notebook(session_id: str):
    """
    Download the session as a runnable Jupyter notebook.

    Includes every registered hypothesis, not just the supported ones — the BH
    correction was computed across the whole family, so a notebook containing
    only the survivors would not reproduce the adjusted p-values.
    """
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if not ledger.hypotheses:
        raise HTTPException(status_code=400, detail="Nothing to export yet — run an analysis first.")

    notebook = build_notebook(ledger)
    ledger.notebook_json = notebook
    session_store.update(ledger)

    stem = (ledger.dataset.filename.rsplit(".", 1)[0] if ledger.dataset else "analysis")
    return JSONResponse(
        content=notebook,
        headers={"Content-Disposition": f'attachment; filename="ledger_{stem}.ipynb"'},
    )


@app.get("/api/sessions/{session_id}/export/report.html", response_class=HTMLResponse)
def export_report_html(session_id: str):
    """Download a standalone HTML report with the ledger travelling alongside the prose."""
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if not ledger.hypotheses:
        raise HTTPException(status_code=400, detail="Nothing to export yet — run an analysis first.")

    return HTMLResponse(content=build_html(ledger))


@app.get("/api/sessions/{session_id}/export/report.pdf")
def export_report_pdf(session_id: str):
    """
    Download the analysis as a print-ready PDF.

    fpdf2 is imported here rather than at module scope so that a container
    without it still serves every other route — the export degrades to the HTML
    one instead of taking the service down at boot.
    """
    ledger = session_store.get(session_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if not ledger.hypotheses:
        raise HTTPException(status_code=400, detail="Nothing to export yet — run an analysis first.")

    try:
        from exports.pdf_report import build_pdf, pdf_filename
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="PDF export is unavailable on this server. The HTML report has the same content.",
        )

    try:
        payload = build_pdf(ledger)
    except Exception as exc:                                   # pragma: no cover
        logger.exception("PDF export failed for session %s", session_id)
        raise HTTPException(status_code=500, detail=f"The PDF could not be rendered: {exc}")

    return Response(
        content=payload,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{pdf_filename(ledger)}"',
            "Content-Length": str(len(payload)),
        },
    )


# ─── Telemetry ────────────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_id}/telemetry")
def get_session_telemetry(session_id: str):
    """
    Every logged event for one session.

    Reads straight from the telemetry database rather than the in-memory ledger,
    so failed agent invocations — which never made it into the ledger — are
    visible too. Those are the rows A8 learns from.
    """
    db = SessionLocal()
    try:
        agent_events = (
            db.query(AgentEvent)
            .filter(AgentEvent.session_id == session_id)
            .order_by(AgentEvent.timestamp.asc())
            .all()
        )
        # Telemetry rows outlive the in-memory session, so a live session is not
        # required — but an id with neither is a typo, not an empty session.
        if not agent_events and session_store.get(session_id) is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        hypothesis_events = (
            db.query(HypothesisEvent)
            .filter(HypothesisEvent.session_id == session_id)
            .order_by(HypothesisEvent.timestamp.asc())
            .all()
        )
        adversary_events = (
            db.query(AdversaryEvent)
            .filter(AdversaryEvent.session_id == session_id)
            .order_by(AdversaryEvent.timestamp.asc())
            .all()
        )

        ledger = session_store.get(session_id)

        return {
            "session_id": session_id,
            "total_tokens": sum(e.tokens_used or 0 for e in agent_events),
            "total_duration_ms": sum(e.duration_ms or 0.0 for e in agent_events),
            "self_repairs": ledger.self_repair_count if ledger else 0,
            "agent_events": [
                {
                    "agent_name": e.agent_name,
                    "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                    "success": e.success,
                    "duration_ms": e.duration_ms,
                    "tokens_used": e.tokens_used,
                    "output_summary": e.output_summary,
                    "error_message": e.error_message,
                }
                for e in agent_events
            ],
            "hypothesis_events": [
                {
                    "hypothesis_id": e.hypothesis_id,
                    "statement": e.statement,
                    "test_selected": e.test_selected,
                    "raw_p_value": e.raw_p_value,
                    "fdr_p_value": e.fdr_p_value,
                    "decision": e.decision,
                    "repair_count": e.repair_count,
                }
                for e in hypothesis_events
            ],
            "adversary_events": [
                {
                    "violation_type": e.violation_type,
                    "sentence": e.sentence,
                    "severity": e.severity,
                }
                for e in adversary_events
            ],
        }
    finally:
        db.close()


@app.get("/api/admin/telemetry/overview")
def telemetry_overview():
    """
    Cross-session telemetry, plus the recurring failure patterns A8 acts on.

    Failures are grouped by agent and by the first line of the error, because
    the same root cause tends to surface with slightly different tracebacks —
    grouping on the whole message would scatter one pattern across many rows.
    """
    db = SessionLocal()
    try:
        agent_events = db.query(AgentEvent).all()
        hypothesis_events = db.query(HypothesisEvent).all()

        failures = {}
        for e in agent_events:
            if e.success or not e.error_message:
                continue
            head = e.error_message.strip().splitlines()[0][:160]
            key = (e.agent_name, head)
            failures.setdefault(key, {"agent_name": e.agent_name, "sample_error": head, "count": 0})
            failures[key]["count"] += 1

        patterns = sorted(failures.values(), key=lambda f: f["count"], reverse=True)[:8]

        by_agent = {}
        for e in agent_events:
            slot = by_agent.setdefault(
                e.agent_name, {"agent_name": e.agent_name, "calls": 0, "failures": 0, "total_ms": 0.0, "tokens": 0}
            )
            slot["calls"] += 1
            slot["failures"] += 0 if e.success else 1
            slot["total_ms"] += e.duration_ms or 0.0
            slot["tokens"] += e.tokens_used or 0
        for slot in by_agent.values():
            slot["avg_ms"] = round(slot["total_ms"] / slot["calls"], 1) if slot["calls"] else 0.0

        return {
            "total_sessions": len({e.session_id for e in agent_events}),
            "active_sessions": len(session_store.list_sessions()),
            "total_agent_events": len(agent_events),
            "failed_agent_events": sum(1 for e in agent_events if not e.success),
            "total_tokens": sum(e.tokens_used or 0 for e in agent_events),
            "total_hypotheses": len(hypothesis_events),
            "supported_hypotheses": sum(1 for e in hypothesis_events if e.decision == "SUPPORTED"),
            "total_self_repairs": sum(e.repair_count or 0 for e in hypothesis_events),
            "failure_patterns": patterns,
            "by_agent": sorted(by_agent.values(), key=lambda a: a["agent_name"]),
        }
    finally:
        db.close()


@app.get("/api/admin/prompt-versions")
def list_prompt_versions():
    """A8's prompt evolution history — what changed, and the reason recorded for it."""
    db = SessionLocal()
    try:
        versions = (
            db.query(PromptVersion)
            .order_by(PromptVersion.created_at.desc())
            .limit(50)
            .all()
        )
        return {
            "versions": [
                {
                    "id": v.id,
                    "agent_name": v.agent_name,
                    "version": v.version,
                    "template": v.template,
                    "rationale": v.rationale,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                    "is_active": v.is_active,
                }
                for v in versions
            ]
        }
    finally:
        db.close()


# ─── Admin ────────────────────────────────────────────────────────────────────

@app.get("/api/admin/sessions")
def list_sessions():
    """List all active sessions."""
    return {"sessions": session_store.list_sessions()}


@app.post("/api/admin/meta-agent/run", response_model=MetaAgentResponse)
def trigger_meta_agent():
    """Manually trigger the A8 Self-Improving Meta-Agent cycle."""
    logger.info("Manual A8 Meta-Agent trigger via API")
    result = run_meta_agent()
    return MetaAgentResponse(
        improvements_made=result.get("improvements_made", []),
        total_improvements=result.get("total_improvements", 0),
        run_at=result.get("run_at", ""),
    )
