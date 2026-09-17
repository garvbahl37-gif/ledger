"""
A1 — Profiler (Fully Deterministic, No LLM)
============================================
NATURE: 100% deterministic — no LLM involved
ROLE: Generates deep statistical marginal summaries for every column.
     The LLM (A2) reads this profile — it never sees raw data.
     This is the structural guarantee that prevents hypothesis fishing.
"""
import json
import logging
import time
from typing import Dict, Any

import numpy as np
import pandas as pd
from scipy import stats

from core.dtypes import is_effectively_categorical
from core.ledger import Ledger, PipelineStage
from observability.telemetry import timed_agent

logger = logging.getLogger(__name__)


def _numeric_stats(series: pd.Series) -> Dict[str, Any]:
    """Deep numeric statistics for a single column."""
    clean = series.dropna()
    if len(clean) < 2:
        return {}

    q1, q3 = clean.quantile(0.25), clean.quantile(0.75)
    skew_val = float(clean.skew())
    kurt_val = float(clean.kurtosis())

    # Normality test (only if n < 5000 for performance)
    sw_stat, sw_p = None, None
    if len(clean) <= 5000:
        try:
            sw_stat, sw_p = stats.shapiro(clean.sample(min(500, len(clean)), random_state=42))
            sw_stat, sw_p = float(sw_stat), float(sw_p)
        except Exception:
            pass

    return {
        "count": int(len(clean)),
        "mean": float(clean.mean()),
        "std": float(clean.std()),
        "min": float(clean.min()),
        "q25": float(q1),
        "median": float(clean.median()),
        "q75": float(q3),
        "max": float(clean.max()),
        "iqr": float(q3 - q1),
        "skewness": skew_val,
        "kurtosis": kurt_val,
        "is_normal_shapiro": bool(sw_p > 0.05) if sw_p is not None else None,
        "shapiro_p": sw_p,
        "outlier_count": int(((clean < q1 - 1.5*(q3-q1)) | (clean > q3 + 1.5*(q3-q1))).sum()),
    }


def _categorical_stats(series: pd.Series) -> Dict[str, Any]:
    """Categorical column profile."""
    vc = series.value_counts()
    return {
        "n_unique": int(series.nunique()),
        "top_5": {str(k): int(v) for k, v in vc.head(5).items()},
        "mode": str(vc.index[0]) if len(vc) > 0 else None,
        "entropy": float(stats.entropy(vc.values)) if len(vc) > 0 else 0.0,
        "is_binary": bool(series.nunique() == 2),
    }


def _temporal_stats(series: pd.Series) -> Dict[str, Any]:
    """Datetime column profile."""
    clean = series.dropna()
    if len(clean) == 0:
        return {}
    return {
        "min_date": str(clean.min()),
        "max_date": str(clean.max()),
        "date_range_days": int((clean.max() - clean.min()).days) if len(clean) > 1 else 0,
    }


def build_profile_json(df: pd.DataFrame) -> str:
    """
    Build a complete JSON profile of the DataFrame.
    This is what A2 reads — never the raw data.
    """
    profile = {
        "shape": {"rows": len(df), "cols": len(df.columns)},
        "columns": {}
    }

    for col in df.columns:
        s = df[col]
        col_info = {
            "dtype": str(s.dtype),
            "n_missing": int(s.isna().sum()),
            "missing_pct": round(s.isna().mean() * 100, 2),
            "n_unique": int(s.nunique()),
            "is_id_like": bool(s.nunique() / max(len(s), 1) > 0.95),
        }

        if pd.api.types.is_datetime64_any_dtype(s):
            col_info["type"] = "temporal"
            col_info.update(_temporal_stats(s))
        elif is_effectively_categorical(s):
            # Stored as a number, used as a label. Profiling it as numeric would
            # put a mean and a standard deviation of Gender in front of the
            # proposer and invite hypotheses that cannot mean anything.
            col_info["type"] = "categorical"
            col_info["numeric_coded"] = True
            col_info.update(_categorical_stats(s))
        elif pd.api.types.is_numeric_dtype(s):
            col_info["type"] = "numeric"
            col_info.update(_numeric_stats(s))
        else:
            col_info["type"] = "categorical"
            col_info.update(_categorical_stats(s))

        profile["columns"][col] = col_info

    return json.dumps(profile, indent=2, default=str)


def run(ledger: Ledger) -> Ledger:
    """
    A1: Generate the full statistical profile of the cleaned dataset.
    Deterministic — no LLM, no randomness.
    
    Args:
        ledger: Ledger with _cleaned_df attached by A0.
    
    Returns:
        Updated ledger with profile_json stored for A2.
    """
    with timed_agent(ledger.session_id, "A1_PROFILER") as ctx:
        ledger.advance_stage(PipelineStage.PROFILER)
        start = time.perf_counter()

        df = getattr(ledger, "_cleaned_df", None)
        if df is None:
            raise ValueError("A1 requires _cleaned_df to be set by A0 first.")

        profile_json = build_profile_json(df)
        ledger._profile_json = profile_json   # Runtime-only, for A2

        ctx["output"] = f"Profiled {len(df.columns)} columns"
        logger.info(f"[A1] Profiled {df.shape} in {(time.perf_counter()-start)*1000:.0f}ms")

    return ledger
