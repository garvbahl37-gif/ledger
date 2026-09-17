"""
A10 — Visual Analyst: Senior Data Scientist Dashboard
=======================================================
NATURE: Fully deterministic Plotly + pandas
ROLE: Generates a complete, beautiful data visualization dashboard
     automatically when a CSV/Excel is uploaded.
     Mimics the workflow of a senior data scientist:
     1. Data quality overview
     2. Univariate distributions for all columns
     3. Correlation heatmap (numeric columns)
     4. Categorical breakdown charts
     5. Time series detection and plotting
     6. Outlier detection visualization
"""
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from core.ledger import Ledger, VisualizationDashboard
from observability.telemetry import timed_agent

logger = logging.getLogger(__name__)

# Color palette from DESIGN_SYSTEM.md
ROYAL_BLUE   = "#1E3A8A"
EMERALD      = "#059669"
CRIMSON      = "#E11D48"
AMBER        = "#D97706"
SLATE        = "#64748B"
PEARL        = "#FCFCFD"
SILVER       = "#E2E8F0"

# `gridcolor` is an axis property, not a Layout one — putting it at the layout
# level makes every update_layout() call raise, which silently disabled this
# whole dashboard. Axis styling is applied separately in _style().
PLOTLY_TEMPLATE = {
    "layout": {
        "paper_bgcolor": PEARL,
        "plot_bgcolor":  PEARL,
        "font": {"family": "Inter, sans-serif", "color": "#0F172A", "size": 12},
        "colorway": [ROYAL_BLUE, EMERALD, AMBER, CRIMSON, SLATE, "#7C3AED", "#DB2777"],
        "title": {"font": {"size": 16, "color": "#0F172A"}},
    }
}

AXIS_STYLE = {
    "gridcolor": SILVER,
    "zerolinecolor": SILVER,
    "linecolor": SILVER,
}


def _style(fig, **layout_overrides):
    """
    Apply the house template to a figure, axes included.

    Overrides are merged rather than splatted alongside the template: both carry
    a `title` key, and passing them as two keyword sets raises a duplicate-argument
    TypeError. A plain title string is folded into the template's title font so
    callers can pass `title="..."` without losing the styling.
    """
    layout = {**PLOTLY_TEMPLATE["layout"]}

    override_title = layout_overrides.pop("title", None)
    if override_title is not None:
        base_title = dict(layout.get("title") or {})
        if isinstance(override_title, str):
            base_title["text"] = override_title
        else:
            base_title.update(override_title)
        layout["title"] = base_title

    layout.update(layout_overrides)

    fig.update_layout(**layout)
    fig.update_xaxes(**AXIS_STYLE)
    fig.update_yaxes(**AXIS_STYLE)
    return fig


def _to_json(fig) -> dict:
    """Serialize Plotly figure to JSON-safe dict."""
    return json.loads(fig.to_json())


def _data_quality_chart(df: pd.DataFrame) -> dict:
    """Missing values and data quality overview."""
    missing = df.isnull().sum()
    missing_pct = (missing / len(df) * 100).round(2)
    dtypes = df.dtypes.astype(str)

    quality_df = pd.DataFrame({
        "Column": df.columns,
        "Missing %": missing_pct.values,
        "Data Type": dtypes.values,
        "Unique Values": [df[c].nunique() for c in df.columns],
    })

    fig = px.bar(
        quality_df,
        x="Column",
        y="Missing %",
        color="Missing %",
        color_continuous_scale=[[0, EMERALD], [0.3, AMBER], [1, CRIMSON]],
        title="Data Quality Overview — Missing Values by Column",
        hover_data=["Data Type", "Unique Values"],
    )
    _style(fig)
    fig.update_xaxes(tickangle=45, **AXIS_STYLE)
    return _to_json(fig)


def _distribution_charts(df: pd.DataFrame) -> List[dict]:
    """Distribution plots for all columns (histograms + box for numeric, bar for categorical)."""
    charts = []
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    cat_cols = [c for c in df.columns if df[c].nunique() < 30 and not pd.api.types.is_numeric_dtype(df[c])]

    # Numeric distributions — histogram + box in one figure
    for col in numeric_cols[:10]:   # Cap at 10 for performance
        clean = df[col].dropna()
        if len(clean) < 2:
            continue

        fig = make_subplots(rows=1, cols=2, column_widths=[0.7, 0.3])
        fig.add_trace(
            go.Histogram(x=clean, name=col, marker_color=ROYAL_BLUE, opacity=0.85),
            row=1, col=1
        )
        fig.add_trace(
            go.Box(y=clean, name=col, marker_color=ROYAL_BLUE, boxmean="sd"),
            row=1, col=2
        )
        _style(fig, title=f"Distribution: {col}", showlegend=False)
        charts.append({"type": "numeric", "column": col, "spec": _to_json(fig)})

    # Categorical distributions — bar charts
    for col in cat_cols[:8]:
        vc = df[col].value_counts().head(15)
        fig = px.bar(
            x=vc.index.astype(str),
            y=vc.values,
            title=f"Value Counts: {col}",
            color=vc.values,
            color_continuous_scale=[[0, PEARL], [1, ROYAL_BLUE]],
        )
        _style(fig)
        fig.update_traces(showlegend=False)
        charts.append({"type": "categorical", "column": col, "spec": _to_json(fig)})

    return charts


def _correlation_heatmap(df: pd.DataFrame) -> Optional[dict]:
    """Pearson correlation heatmap for numeric columns."""
    numeric_df = df.select_dtypes(include=np.number)
    if len(numeric_df.columns) < 2:
        return None

    corr = numeric_df.corr(method="pearson").round(3)

    fig = go.Figure(data=go.Heatmap(
        z=corr.values,
        x=corr.columns.tolist(),
        y=corr.columns.tolist(),
        colorscale=[[0, CRIMSON], [0.5, PEARL], [1, ROYAL_BLUE]],
        zmin=-1, zmax=1,
        text=corr.round(2).values,
        texttemplate="%{text}",
        textfont={"size": 10},
        hoverongaps=False,
    ))
    _style(fig, title="Pearson Correlation Heatmap")
    return _to_json(fig)


# A chart is for the eye, and no eye resolves 659,087 overplotted points. Past a
# few tens of thousands the picture stops changing and only the cost keeps
# growing: every point is serialised into the figure's JSON, held in memory and
# then parsed again by the browser. A 669k-row upload OOM-killed the 512MB
# instance here — A0 finished, A10 began, and the process was restarted mid-run.
#
# Only the presentational charts are sampled. Nothing A5 decides with is touched,
# and the aggregate charts below (missingness, cardinality, correlation) still
# read the whole frame, because those are cheap to compute exactly and it would
# be wrong to estimate them.
CHART_SAMPLE_MAX = 20_000


def _for_charts(df: pd.DataFrame) -> Tuple[pd.DataFrame, bool]:
    """Down-sample a frame for plotting. Deterministic, so the dashboard for a
    given table is the same every time it is built."""
    if len(df) <= CHART_SAMPLE_MAX:
        return df, False
    return df.sample(CHART_SAMPLE_MAX, random_state=0).sort_index(), True


def _time_series_charts(df: pd.DataFrame) -> List[dict]:
    """Auto-detect temporal columns and plot time series."""
    charts = []
    datetime_cols = df.select_dtypes(include=["datetime64"]).columns.tolist()
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()

    for dt_col in datetime_cols[:2]:
        for num_col in numeric_cols[:3]:
            ts_df = df[[dt_col, num_col]].dropna().sort_values(dt_col)
            if len(ts_df) < 5:
                continue
            fig = px.line(
                ts_df, x=dt_col, y=num_col,
                title=f"Time Series: {num_col} over {dt_col}",
                color_discrete_sequence=[ROYAL_BLUE],
            )
            _style(fig)
            charts.append({"dt_col": dt_col, "num_col": num_col, "spec": _to_json(fig)})

    return charts


def run(ledger: Ledger) -> Ledger:
    """
    A10: Generate a complete data scientist-grade visualization dashboard.
    
    Args:
        ledger: Ledger with _cleaned_df set by A0.
    
    Returns:
        Updated ledger with visualization_dashboard populated.
    """
    with timed_agent(ledger.session_id, "A10_VISUAL_ANALYST") as ctx:
        df = getattr(ledger, "_cleaned_df", None)
        if df is None:
            raise ValueError("[A10] No DataFrame found. Run A0 first.")

        logger.info(f"[A10] Generating dashboard for {df.shape}")

        plot_df, sampled = _for_charts(df)
        if sampled:
            logger.info(
                "[A10] Plotting a %d-row sample of %d rows; aggregates still "
                "use the whole frame", len(plot_df), len(df))

        dashboard = VisualizationDashboard(
            summary_stats_chart=_data_quality_chart(df),      # exact, cheap
            distribution_charts=_distribution_charts(plot_df),
            correlation_heatmap=_correlation_heatmap(df),      # exact, cheap
            time_series_charts=_time_series_charts(plot_df),
        )

        ledger.visualization_dashboard = dashboard

        total_charts = (
            len(dashboard.distribution_charts) +
            (1 if dashboard.correlation_heatmap else 0) +
            len(dashboard.time_series_charts) + 1
        )
        ctx["output"] = f"Generated {total_charts} charts"
        logger.info(f"[A10] Dashboard complete: {total_charts} charts")

    return ledger
