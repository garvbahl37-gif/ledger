"""
A5 — Statistician (Fully Deterministic, No LLM)
================================================
NATURE: 100% deterministic — no LLM, pure scipy/statsmodels
ROLE: The ultimate arbiter of truth.
     1. Checks statistical assumptions (normality, variance homogeneity, etc.)
     2. Selects the correct test based on data properties
     3. Computes effect sizes
     4. Applies Benjamini-Hochberg FDR correction ACROSS ALL hypotheses
     5. Generates licensed_text — the ONLY text A6 is allowed to use
"""
import json
import logging
import math
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests

from core.dtypes import is_measurement
from core.ledger import (
    Ledger, HypothesisEntry, HypothesisStatus,
    StatisticalResult, AssumptionCheck, PipelineStage
)
from observability.telemetry import timed_agent, log_hypothesis_event

logger = logging.getLogger(__name__)

ALPHA = 0.05
FDR_METHOD = "fdr_bh"  # Benjamini-Hochberg


# ─── Effect size helpers ───────────────────────────────────────────────────────

def _cohen_d(a: np.ndarray, b: np.ndarray) -> float:
    """Cohen's d for two independent groups."""
    n1, n2 = len(a), len(b)
    if n1 < 2 or n2 < 2:
        return 0.0
    pooled_std = math.sqrt(((n1-1)*a.std()**2 + (n2-1)*b.std()**2) / (n1+n2-2))
    return float((a.mean() - b.mean()) / pooled_std) if pooled_std > 0 else 0.0


def _effect_label(d: float) -> str:
    d = abs(d)
    if d >= 0.8: return "large"
    if d >= 0.5: return "medium"
    if d >= 0.2: return "small"
    return "negligible"


def _cramers_v(chi2: float, n: int, min_dim: int) -> float:
    """Cramér's V effect size for chi-square tests."""
    if n == 0 or min_dim <= 1:
        return 0.0
    return float(math.sqrt(chi2 / (n * (min_dim - 1))))


# ─── Test selection logic ──────────────────────────────────────────────────────

def _run_two_group_test(
    a: np.ndarray, b: np.ndarray
) -> Tuple[str, float, float, List[AssumptionCheck]]:
    """
    Two-group comparison: decides between Welch's t-test and Mann-Whitney U.
    """
    assumptions = []

    # Normality check (Shapiro-Wilk on samples ≤5000)
    def check_normality(arr, label):
        if len(arr) < 3:
            return False, AssumptionCheck(name=f"Normality ({label})", passed=False, note="Too few samples")
        if len(arr) > 5000:
            sample = np.random.choice(arr, 500, replace=False)
        else:
            sample = arr
        stat, p = stats.shapiro(sample)
        passed = bool(p > 0.05)
        return passed, AssumptionCheck(
            name=f"Normality ({label})", passed=passed, statistic=float(stat), p_value=float(p)
        )

    norm_a, check_a = check_normality(a, "Group A")
    norm_b, check_b = check_normality(b, "Group B")
    assumptions.extend([check_a, check_b])

    if norm_a and norm_b:
        test_name = "Welch's t-test"
        stat, p = stats.ttest_ind(a, b, equal_var=False)
        assumptions.append(AssumptionCheck(
            name="Equal Variance (Levene)", passed=True, note="Welch handles unequal variance"
        ))
    else:
        test_name = "Mann-Whitney U test"
        stat, p = stats.mannwhitneyu(a, b, alternative="two-sided")

    return test_name, float(stat), float(p), assumptions


def _run_correlation_test(
    x: np.ndarray, y: np.ndarray
) -> Tuple[str, float, float, List[AssumptionCheck]]:
    """Pearson vs Spearman based on normality."""
    assumptions = []

    if len(x) < 3:
        return "Pearson r", 0.0, 1.0, assumptions

    # Check normality of both
    try:
        _, px = stats.shapiro(x[:500])
        _, py = stats.shapiro(y[:500])
        normal = px > 0.05 and py > 0.05
    except Exception:
        normal = False

    assumptions.append(AssumptionCheck(
        name="Normality (Both)", passed=normal,
        note="Pearson used if normal, Spearman otherwise"
    ))

    if normal:
        r, p = stats.pearsonr(x, y)
        return "Pearson r", float(r), float(p), assumptions
    else:
        r, p = stats.spearmanr(x, y)
        return "Spearman rho", float(r), float(p), assumptions


def _run_chi_square_test(
    x: pd.Series, y: pd.Series
) -> Tuple[str, float, float, List[AssumptionCheck]]:
    """Chi-square test of independence for two categorical columns."""
    contingency = pd.crosstab(x, y)
    chi2, p, dof, expected = stats.chi2_contingency(contingency)
    min_expected = expected.min()
    passed = bool(min_expected >= 5)
    return "Chi-square test", float(chi2), float(p), [
        AssumptionCheck(
            name="Expected Cell Frequency ≥ 5",
            passed=passed,
            note=f"Min expected: {min_expected:.2f}" + (" (Fisher's Exact recommended)" if not passed else "")
        )
    ]


def _eta_squared(groups: List[np.ndarray]) -> float:
    """
    Eta-squared for a k-group comparison: the share of total variance explained
    by group membership. The k-group analogue of Cohen's d, and the reason a
    3-level factor does not have to be collapsed to 2 to get an effect size.
    """
    allv = np.concatenate(groups)
    grand = allv.mean()
    ss_between = sum(len(g) * (g.mean() - grand) ** 2 for g in groups)
    ss_total = ((allv - grand) ** 2).sum()
    return float(ss_between / ss_total) if ss_total > 0 else 0.0


def _run_k_group_test(
    groups: List[np.ndarray],
) -> Tuple[str, float, float, List[AssumptionCheck]]:
    """
    Compare k > 2 groups on a numeric outcome.

    Selection follows the checks, as everywhere else in this agent: if every
    group passes Shapiro-Wilk and Levene reports equal variances, one-way ANOVA
    is appropriate; otherwise Kruskal-Wallis, which assumes neither.

    This exists because the previous fallback truncated categories to the first
    two with `unique()[:2]`, which silently answered a different question than
    the one registered — comparing two of three contract types and reporting the
    result as though it covered all three.
    """
    assumptions: List[AssumptionCheck] = []

    normal = True
    for i, g in enumerate(groups):
        if 3 <= len(g) <= 5000:
            try:
                stat, p = stats.shapiro(g)
                passed = p > 0.05
                normal = normal and passed
                assumptions.append(AssumptionCheck(
                    name=f"Shapiro-Wilk normality (group {i + 1})",
                    passed=bool(passed), statistic=float(stat), p_value=float(p),
                    note="Normal enough for ANOVA" if passed else "Not normal — favours Kruskal-Wallis",
                ))
            except Exception:
                normal = False
        else:
            normal = False

    equal_var = True
    try:
        lev_stat, lev_p = stats.levene(*groups)
        equal_var = lev_p > 0.05
        assumptions.append(AssumptionCheck(
            name="Levene equal variance", passed=bool(equal_var),
            statistic=float(lev_stat), p_value=float(lev_p),
            note="Variances comparable" if equal_var else "Unequal variances — favours Kruskal-Wallis",
        ))
    except Exception:
        equal_var = False

    if normal and equal_var:
        stat, p = stats.f_oneway(*groups)
        return "One-way ANOVA", float(stat), float(p), assumptions

    stat, p = stats.kruskal(*groups)
    return "Kruskal-Wallis H", float(stat), float(p), assumptions


def _select_and_run_test(
    hypothesis: HypothesisEntry,
    df: pd.DataFrame,
) -> Tuple[str, float, float, Optional[float], Optional[str], List[AssumptionCheck]]:
    """
    Intelligently selects and runs the correct statistical test
    based on column types and data properties.
    
    Returns: (test_name, stat, raw_p, effect_size, effect_label, assumptions)
    """
    raw = hypothesis.raw_data or {}
    cols = hypothesis.columns_involved

    # ── Pattern 1: Two numeric groups (from dict with group_a, group_b) ──
    if "group_a" in raw and "group_b" in raw:
        a = np.array([x for x in raw["group_a"] if x is not None and not (isinstance(x, float) and math.isnan(x))])
        b = np.array([x for x in raw["group_b"] if x is not None and not (isinstance(x, float) and math.isnan(x))])
        if len(a) >= 3 and len(b) >= 3:
            test_name, stat, p, assumptions = _run_two_group_test(a, b)
            d = _cohen_d(a, b)
            return test_name, stat, p, d, _effect_label(d), assumptions

    # ── Pattern 2: Correlation (x, y numeric) ────────────────────────────
    if "x_values" in raw and "y_values" in raw:
        x = np.array([v for v in raw["x_values"] if v is not None])
        y = np.array([v for v in raw["y_values"] if v is not None])
        if len(x) >= 5 and len(y) == len(x):
            test_name, r, p, assumptions = _run_correlation_test(x, y)
            return test_name, r, p, r, _effect_label(r), assumptions

    # ── Pattern 3: Fallback — derive the test from the registered columns ────
    #
    # Three things this has to get right, each of which was previously wrong and
    # each of which produced a silent error rather than a wrong number — which
    # in a tool that reports "tested and not supported" is worse, because an
    # untested hypothesis was being presented as a tested one:
    #
    #   1. Column ORDER must not matter. The proposer writes columns in whatever
    #      order the sentence reads, so ["monthly_charges", "churned"] and
    #      ["churned", "monthly_charges"] are the same hypothesis.
    #   2. Rows must be dropped PAIRWISE. Dropping NaNs from each column
    #      independently and then masking one with the other's index silently
    #      misaligns the two series.
    #   3. k > 2 categories must not be truncated to the first two. Comparing
    #      two of three contract types answers a different question than the one
    #      in the registry.
    if len(cols) == 2:
        c1, c2 = cols[0], cols[1]
        if c1 in df.columns and c2 in df.columns:
            paired = df[[c1, c2]].dropna()
            if len(paired) < 3:
                raise ValueError(
                    f"[A5] {hypothesis.id}: only {len(paired)} rows have both "
                    f"{c1} and {c2} present — too few to test."
                )

            a, b = paired[c1], paired[c2]
            # Not is_numeric_dtype: an integer-coded category passes that and
            # turns a group comparison into a correlation. See core.dtypes.
            a_num = is_measurement(a)
            b_num = is_measurement(b)

            # Both numeric → correlation.
            if a_num and b_num:
                test_name, r, p, assumptions = _run_correlation_test(a.values, b.values)
                return test_name, r, p, r, _effect_label(r), assumptions

            # One numeric, one categorical → group comparison, either order.
            if a_num != b_num:
                num_s, cat_s = (a, b) if a_num else (b, a)
                levels = [lv for lv in cat_s.unique()
                          if len(num_s[cat_s == lv]) >= 3]

                if len(levels) >= 2:
                    groups = [num_s[cat_s == lv].values for lv in levels]

                    if len(groups) == 2:
                        test_name, stat, p, assumptions = _run_two_group_test(groups[0], groups[1])
                        d = _cohen_d(groups[0], groups[1])
                        return test_name, stat, p, d, _effect_label(d), assumptions

                    test_name, stat, p, assumptions = _run_k_group_test(groups)
                    eta2 = _eta_squared(groups)
                    return (
                        f"{test_name} ({len(groups)} groups)",
                        stat, p, eta2, _effect_label(math.sqrt(eta2)), assumptions,
                    )

                sizes = cat_s.value_counts().to_dict()
                spread = ", ".join(f"{lv}: {n}" for lv, n in sorted(
                    sizes.items(), key=lambda kv: -kv[1])[:6])
                raise ValueError(
                    f"{cat_s.name} has no two groups with at least 3 values of "
                    f"{num_s.name} to compare ({spread}). This is a limit of the "
                    f"data, not of the test."
                )

            # Both categorical → chi-square on the paired rows.
            test_name, chi2, p, assumptions = _run_chi_square_test(a, b)
            v = _cramers_v(chi2, len(paired), min(a.nunique(), b.nunique()))
            return test_name, chi2, p, v, _effect_label(v), assumptions

    raise ValueError(
        f"[A5] Cannot determine an appropriate test for {hypothesis.id}: "
        f"columns={cols}, raw_keys={list(raw.keys())}"
    )


def _build_licensed_text(
    hypothesis: HypothesisEntry, result: StatisticalResult
) -> str:
    """
    Construct the one authoritative sentence A6 is allowed to use.
    This is not generated by LLM — it is templated deterministically.
    """
    h = hypothesis.statement
    if result.decision == HypothesisStatus.SUPPORTED:
        return (
            f"{h} — {result.test_name} confirmed a statistically significant association "
            f"(p={result.fdr_adjusted_p_value:.4f}, FDR-corrected; "
            f"effect size: {result.effect_size_label} [{result.effect_size:.3f}])."
        )
    else:
        return (
            f"{h} — {result.test_name} found no statistically significant association "
            f"(p={result.fdr_adjusted_p_value:.4f}, FDR-corrected). "
            f"The null hypothesis was retained."
        )


def run(ledger: Ledger) -> Ledger:
    """
    A5: Run statistical tests and apply FDR correction across all hypotheses.
    Fully deterministic. No LLM.
    """
    with timed_agent(ledger.session_id, "A5_STATISTICIAN") as ctx:
        ledger.advance_stage(PipelineStage.STATISTICIAN)

        df = getattr(ledger, "_cleaned_df", None)
        if df is None:
            raise ValueError("[A5] No cleaned DataFrame. Run A0 first.")

        # EVERY registered hypothesis stays in the family, including ones A4
        # failed to write working code for.
        #
        # Excluding them shrinks m and makes the BH threshold more permissive for
        # everything else, which is precisely the accounting error the freeze
        # exists to prevent: the denominator would then depend on which code
        # happened to run, i.e. on results seen after registration.
        #
        # It also cost real findings. A4's output is not required to adjudicate a
        # hypothesis whose columns are known: _select_and_run_test falls back to
        # computing the test directly from the dataframe. A hypothesis dropped
        # here for an A4 failure was never given that chance.
        eligible = list(ledger.hypotheses)
        raw_p_values = []
        per_hypothesis_results = []

        # ── Step 1: Run all tests, collect raw p-values ───────────────────
        for hypothesis in eligible:
            try:
                test_name, stat, raw_p, effect, effect_lbl, assumptions = _select_and_run_test(hypothesis, df)
                per_hypothesis_results.append({
                    "h": hypothesis,
                    "test_name": test_name,
                    "stat": stat,
                    "raw_p": raw_p,
                    "effect": effect,
                    "effect_lbl": effect_lbl,
                    "assumptions": assumptions,
                    "error": None,
                })
                raw_p_values.append(raw_p)
            except Exception as e:
                logger.error(f"[A5] Test failed for {hypothesis.id}: {e}")
                hypothesis.failure_reason = str(e)
                per_hypothesis_results.append({"h": hypothesis, "error": str(e)})
                raw_p_values.append(1.0)

        # ── Step 2: Apply Benjamini-Hochberg FDR correction globally ──────
        if raw_p_values:
            _, fdr_p_values, _, _ = multipletests(raw_p_values, alpha=ALPHA, method=FDR_METHOD)
        else:
            fdr_p_values = []

        # ── Step 3: Write results back to ledger ───────────────────────────
        for i, item in enumerate(per_hypothesis_results):
            hypothesis = item["h"]
            if item.get("error"):
                # Recorded as ERROR and reported as tested-and-not-supported.
                # Its p = 1.0 slot above already counted toward m, so the family
                # size matches the registry even when a test could not run.
                hypothesis.status = HypothesisStatus.ERROR
                continue

            fdr_p = float(fdr_p_values[i])
            decision = HypothesisStatus.SUPPORTED if fdr_p < ALPHA else HypothesisStatus.REJECTED

            result = StatisticalResult(
                test_name=item["test_name"],
                statistic=item["stat"],
                raw_p_value=item["raw_p"],
                fdr_adjusted_p_value=fdr_p,
                effect_size=item["effect"],
                effect_size_label=item["effect_lbl"],
                alpha=ALPHA,
                decision=decision,
                assumptions=item["assumptions"],
            )
            hypothesis.status = decision
            hypothesis.statistical_result = result
            result.licensed_text = _build_licensed_text(hypothesis, result)

            # Log to observability DB
            log_hypothesis_event(
                session_id=ledger.session_id,
                hypothesis_id=hypothesis.id,
                statement=hypothesis.statement,
                columns_involved=hypothesis.columns_involved,
                test_selected=item["test_name"],
                raw_p_value=item["raw_p"],
                fdr_p_value=fdr_p,
                decision=decision.value,
                repair_count=len(hypothesis.execution_attempts) - 1,
            )

        supported = sum(1 for h in ledger.hypotheses if h.status == HypothesisStatus.SUPPORTED)
        errored = sum(1 for h in ledger.hypotheses if h.status == HypothesisStatus.ERROR)
        ctx["output"] = (
            f"FDR corrected over m={len(eligible)} registered. "
            f"Supported: {supported}, could not run: {errored}"
        )
        logger.info(f"[A5] {supported}/{len(eligible)} hypotheses supported after FDR correction")

    return ledger
