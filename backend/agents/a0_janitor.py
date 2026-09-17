"""
A0 — Data Janitor
==================
NATURE: Hybrid (Deterministic Pandas + LLM for semantic type guessing)
ROLE: Cleans raw CSVs/Excel files before analysis begins.
     - Type coercion
     - Missing value imputation
     - Date parsing
     - Domain hint annotation (e.g., "medical", "financial")
     - Duplicate removal
"""
import io
import json
import logging
import time
from typing import Optional

import numpy as np
import pandas as pd

from core.ledger import Ledger, DatasetMeta, ColumnProfile, PipelineStage
from core.llm_client import call_llm
from observability.telemetry import timed_agent

logger = logging.getLogger(__name__)

_DOMAIN_HINTS = {
    "medical":    ["bp_", "systolic", "diastolic", "glucose", "cholesterol", "bmi", "age", "diagnosis", "icd"],
    "financial":  ["revenue", "profit", "salary", "income", "price", "cost", "credit", "loan", "balance"],
    "temporal":   ["date", "time", "timestamp", "year", "month", "day", "created_at", "updated_at"],
    "identity":   ["id", "uuid", "user_id", "customer_id", "record_id", "index"],
    "geographic": ["city", "state", "country", "zip", "latitude", "longitude", "region"],
}


def _guess_domain(col_name: str) -> Optional[str]:
    """Rule-based domain detection by column name."""
    col_lower = col_name.lower()
    for domain, keywords in _DOMAIN_HINTS.items():
        if any(kw in col_lower for kw in keywords):
            return domain
    return None


def _build_column_profile(series: pd.Series, domain: Optional[str]) -> ColumnProfile:
    """Build a ColumnProfile from a pandas Series."""
    is_numeric = pd.api.types.is_numeric_dtype(series)
    is_temporal = pd.api.types.is_datetime64_any_dtype(series)
    n_unique = series.nunique()
    n_total = len(series)
    n_missing = series.isna().sum()

    profile = ColumnProfile(
        name=series.name,
        dtype=str(series.dtype),
        n_unique=int(n_unique),
        n_missing=int(n_missing),
        missing_pct=round(float(n_missing / n_total * 100), 2) if n_total > 0 else 0.0,
        is_numeric=is_numeric,
        is_categorical=not is_numeric and not is_temporal and n_unique < 50,
        is_temporal=is_temporal,
        domain_hint=domain,
    )

    if is_numeric:
        clean = series.dropna()
        if len(clean) > 0:
            profile.min_val  = float(clean.min())
            profile.max_val  = float(clean.max())
            profile.mean     = float(clean.mean())
            profile.std      = float(clean.std())
            profile.median   = float(clean.median())

    if not is_numeric and not is_temporal:
        top = series.value_counts().head(5).index.tolist()
        profile.top_values = [str(v) for v in top]

    return profile


def run(ledger: Ledger, file_bytes: bytes, filename: str) -> Ledger:
    """
    A0: Ingest, clean, and annotate the uploaded dataset.
    
    Args:
        ledger: Current session ledger.
        file_bytes: Raw bytes of the uploaded file.
        filename: Original filename (.csv or .xlsx).
    
    Returns:
        Updated ledger with dataset and column profiles.
    """
    with timed_agent(ledger.session_id, "A0_JANITOR") as ctx:
        ledger.advance_stage(PipelineStage.JANITOR)
        start = time.perf_counter()

        # ── 1. Load file ───────────────────────────────────────────────────
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(file_bytes))
        else:
            # Try UTF-8 first, then latin-1 (robust for messy CSVs)
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding="latin-1")

        logger.info(f"[A0] Loaded {filename}: {df.shape}")

        # ── 2. Remove fully duplicate rows ─────────────────────────────────
        n_rows_raw = len(df)
        df.drop_duplicates(inplace=True)
        dropped = n_rows_raw - len(df)
        if dropped:
            logger.info(f"[A0] Dropped {dropped} duplicate rows")

        # ── 3. Normalize column names ──────────────────────────────────────
        df.columns = [c.strip().lower().replace(" ", "_").replace("-", "_") for c in df.columns]

        # ── 4. Attempt smart type coercion ────────────────────────────────
        for col in df.columns:
            # Try parsing date columns
            if any(kw in col for kw in ["date", "time", "timestamp", "created", "updated"]):
                try:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
                    logger.info(f"[A0] Parsed {col} as datetime")
                except Exception:
                    pass
            # Try converting object columns that look numeric
            elif df[col].dtype == object:
                converted = pd.to_numeric(df[col], errors="coerce")
                if converted.notna().mean() > 0.8:  # >80% parseable = numeric
                    df[col] = converted
                    logger.info(f"[A0] Coerced {col} to numeric")

        # ── 5. Build column profiles with domain hints ────────────────────
        profiles = []
        for col in df.columns:
            domain = _guess_domain(col)
            profile = _build_column_profile(df[col], domain)
            profiles.append(profile)

        # ── 6. Populate ledger ────────────────────────────────────────────
        ledger.dataset = DatasetMeta(
            filename=filename,
            n_rows=len(df),
            n_cols=len(df.columns),
            size_bytes=len(file_bytes),
            n_rows_raw=n_rows_raw,
            n_duplicates_removed=dropped,
            columns=profiles,
        )

        # Attach the cleaned dataframe to the ledger for downstream agents
        # (We store it as a JSON-serializable representation + keep in memory)
        ledger._cleaned_df = df  # Runtime-only attribute

        ctx["output"] = f"Cleaned dataset: {len(df)} rows x {len(df.columns)} cols"
        logger.info(f"[A0] Done in {(time.perf_counter()-start)*1000:.0f}ms")

    return ledger
