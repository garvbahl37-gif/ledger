"""
Ledger Core Data Model
=======================
The single source of truth for every analysis session.
All agents READ from and WRITE to this object — never plain text.
This is the structural guarantee that prevents hallucination.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class HypothesisStatus(str, Enum):
    PENDING   = "PENDING"
    EXECUTING = "EXECUTING"
    SUPPORTED = "SUPPORTED"
    REJECTED  = "REJECTED"
    ERROR     = "ERROR"

class AgentStatus(str, Enum):
    IDLE      = "IDLE"
    RUNNING   = "RUNNING"
    DONE      = "DONE"
    FAILED    = "FAILED"

class PipelineStage(str, Enum):
    INIT        = "INIT"
    JANITOR     = "A0_JANITOR"
    PROFILER    = "A1_PROFILER"
    PROPOSER    = "A2_PROPOSER"
    REGISTRAR   = "A3_REGISTRAR"      # FREEZE point — nothing can be added after this
    EXECUTOR    = "A4_EXECUTOR"
    STATISTICIAN= "A5_STATISTICIAN"
    REPORTER    = "A6_REPORTER"
    ADVERSARY   = "A7_ADVERSARY"
    COMPLETE    = "COMPLETE"
    FAILED      = "FAILED"


# ─── Sub-models ───────────────────────────────────────────────────────────────

class ColumnProfile(BaseModel):
    name: str
    dtype: str
    n_unique: int
    n_missing: int
    missing_pct: float
    is_numeric: bool
    is_categorical: bool
    is_temporal: bool
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean: Optional[float] = None
    std: Optional[float] = None
    median: Optional[float] = None
    top_values: Optional[List[Any]] = None
    domain_hint: Optional[str] = None          # Injected by A0 (e.g., "medical", "financial")


class AssumptionCheck(BaseModel):
    name: str                                   # e.g., "Shapiro-Wilk Normality"
    passed: bool
    statistic: Optional[float] = None
    p_value: Optional[float] = None
    note: str = ""


class StatisticalResult(BaseModel):
    test_name: str
    statistic: float
    raw_p_value: float
    fdr_adjusted_p_value: Optional[float] = None
    effect_size: Optional[float] = None
    effect_size_label: Optional[str] = None     # e.g., "small", "medium", "large"
    alpha: float = 0.05
    decision: HypothesisStatus = HypothesisStatus.PENDING
    assumptions: List[AssumptionCheck] = []
    licensed_text: str = ""                     # THE ONLY text A6 is allowed to use


class ExecutionAttempt(BaseModel):
    attempt_number: int
    code: str
    stdout: str
    stderr: str
    success: bool
    data_extracted: Optional[Dict[str, Any]] = None


class AdversaryViolation(BaseModel):
    violation_type: str                         # "CAUSAL_LANGUAGE" | "EFFECT_SIZE_OVERSTATEMENT" | "PHANTOM_FINDING"
    sentence: str
    explanation: str
    severity: str                               # "HIGH" | "MEDIUM" | "LOW"


class HypothesisEntry(BaseModel):
    """The atomic unit of the Ledger. One entry per hypothesis, forever immutable after A3."""
    id: str                                     # e.g., "H01"
    statement: str                              # Plain English hypothesis
    columns_involved: List[str]
    test_type_hint: Optional[str] = None        # LLM hint, overridden by A5
    registered_at: Optional[datetime] = None   # Set by A3 — immutable after this
    status: HypothesisStatus = HypothesisStatus.PENDING
    execution_attempts: List[ExecutionAttempt] = []
    raw_data: Optional[Dict[str, Any]] = None  # Data extracted by A4
    statistical_result: Optional[StatisticalResult] = None
    chart_spec: Optional[Dict[str, Any]] = None # Plotly JSON spec
    adversary_violations: List[AdversaryViolation] = []
    user_defined: bool = False                  # True if user supplied this hypothesis
    # Why this entry reached no verdict. A registered hypothesis that cannot be
    # adjudicated still counts toward the correction, so the reader is owed the
    # reason — "one group holds a single row" and "the generated code crashed"
    # are very different facts about the analysis, and without this they looked
    # identical.
    failure_reason: Optional[str] = None


class DatasetMeta(BaseModel):
    filename: str
    n_rows: int
    n_cols: int
    size_bytes: int
    upload_time: datetime = Field(default_factory=datetime.utcnow)
    columns: List[ColumnProfile] = []
    rag_context: Optional[str] = None          # Retrieved from data dictionary


class SQLConversionResult(BaseModel):
    """Result from the A9 SQL Converter agent."""
    natural_language_query: str
    sql_query: str
    explanation: str
    flowchart_mermaid: str                      # Mermaid.js diagram of the query plan
    estimated_rows: Optional[int] = None


class VisualizationDashboard(BaseModel):
    """Result from the A10 Visual Analyst agent."""
    summary_stats_chart: Optional[Dict] = None
    distribution_charts: List[Dict] = []
    correlation_heatmap: Optional[Dict] = None
    pairplot_data: Optional[Dict] = None
    time_series_charts: List[Dict] = []
    data_quality_report: Optional[Dict] = None


# ─── The Central Ledger ───────────────────────────────────────────────────────

class Ledger(BaseModel):
    """
    THE CENTRAL LEDGER.
    The single source of truth for an analysis session.
    No agent may emit output outside this structure.
    """
    session_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Pipeline state
    current_stage: PipelineStage = PipelineStage.INIT
    stage_history: List[str] = []
    is_frozen: bool = False                    # True after A3 completes — no new hypotheses

    # Dataset
    dataset: Optional[DatasetMeta] = None
    secondary_dataset: Optional[DatasetMeta] = None  # For multi-CSV comparison

    # The hypothesis registry — THE core artifact
    hypotheses: List[HypothesisEntry] = []

    # The Registrar's immutable hash — computed after A3
    registry_hash: Optional[str] = None
    # When the freeze happened. Set by freeze(); part of the provenance record,
    # and declaring it here is what lets freeze() assign it at all — pydantic
    # rejects attributes that are not declared fields.
    registered_at: Optional[datetime] = None

    # Final outputs
    report_html: Optional[str] = None
    report_validated: bool = False             # True only after A7 approves
    notebook_json: Optional[Dict] = None       # Jupyter notebook export
    adversary_violations: List[AdversaryViolation] = []

    # New agent outputs
    sql_result: Optional[SQLConversionResult] = None
    visualization_dashboard: Optional[VisualizationDashboard] = None

    # Observability
    agent_timings: Dict[str, float] = {}       # Agent name -> seconds taken
    total_tokens_used: int = 0
    llm_call_count: int = 0
    self_repair_count: int = 0                 # How many times A4 self-repaired
    reproducibility_warning: bool = False

    # Session memory for multi-turn conversations
    conversation_history: List[Dict[str, str]] = []

    def advance_stage(self, stage: PipelineStage) -> None:
        self.stage_history.append(self.current_stage.value)
        self.current_stage = stage
        self.updated_at = datetime.utcnow()

    def freeze(self) -> str:
        """Called by A3. Locks the hypothesis registry and returns a deterministic hash."""
        if self.is_frozen:
            return self.registry_hash
        payload = json.dumps(
            [h.id + h.statement for h in self.hypotheses],
            sort_keys=True
        )
        self.registry_hash = hashlib.sha256(payload.encode()).hexdigest()[:16]
        self.is_frozen = True
        self.registered_at = datetime.utcnow()
        return self.registry_hash

    def add_hypothesis(self, entry: HypothesisEntry) -> None:
        """Only works before freeze. Raises after A3 completes."""
        if self.is_frozen:
            raise ValueError(
                "Ledger is frozen. No hypotheses can be added after A3 (Registrar) completes. "
                "This is a structural guarantee against selective reporting."
            )
        self.hypotheses.append(entry)

    def get_hypothesis(self, h_id: str) -> Optional[HypothesisEntry]:
        return next((h for h in self.hypotheses if h.id == h_id), None)

    def get_supported_hypotheses(self) -> List[HypothesisEntry]:
        return [h for h in self.hypotheses if h.status == HypothesisStatus.SUPPORTED]

    def get_licensed_texts(self) -> List[str]:
        """Returns the ONLY texts the Reporter (A6) is allowed to use."""
        return [
            h.statistical_result.licensed_text
            for h in self.hypotheses
            if h.statistical_result and h.statistical_result.licensed_text
        ]

    def compute_final_hash(self) -> str:
        """Reproducibility check: same CSV + same session = same hash."""
        payload = json.dumps({
            "registry_hash": self.registry_hash,
            "decisions": {h.id: h.status.value for h in self.hypotheses},
            "p_values": {
                h.id: h.statistical_result.raw_p_value
                for h in self.hypotheses
                if h.statistical_result
            }
        }, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    class Config:
        use_enum_values = False
