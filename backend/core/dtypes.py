"""
Column type semantics
=====================
One place to decide whether a column is a measurement or a label.

pandas answers a narrower question than the statistician needs. It reports the
storage dtype, and a category stored as an integer is reported as numeric —
which is how most real tables arrive. Survey exports, UCI tables and nearly
every credit dataset encode categories as codes: Gender 0/1, Target 0/1,
Marriage_State 20/61/71.

Left alone, that turns a registered hypothesis into a different one. "Mean age
differs between customers with target = 1 and target = 0" names a two-group
comparison, but if `target` is read as numeric the pair looks continuous and the
selector runs a Spearman correlation of age against a 0/1 column. It returns a
number, so nothing errors — it simply answers a question nobody asked, under the
statement of the one they did.

Both A1 and A5 import from here so the profile a reader is shown and the test
that actually ran cannot disagree about what a column is.
"""
from __future__ import annotations

import pandas as pd

# Cardinality is the rule an analyst applies by eye: a handful of repeated codes
# is a label, a long tail of distinct values is a measurement. Two thresholds,
# because either alone misfires — an absolute cap keeps a 40-level code out, and
# a proportional one keeps a short column from having every value called a
# level (with 8 rows, 6 distinct ages is not a set of categories).
MAX_LEVELS = 12
MAX_LEVEL_SHARE = 0.5


def is_integer_valued(series: pd.Series) -> bool:
    """True when every present value is a whole number, float storage included."""
    s = series.dropna()
    if s.empty or not pd.api.types.is_numeric_dtype(s):
        return False
    if pd.api.types.is_bool_dtype(s):
        return True
    try:
        return bool((s % 1 == 0).all())
    except TypeError:
        return False


def is_effectively_categorical(series: pd.Series) -> bool:
    """
    True for a category that happens to be stored as a number.

    Only ever widens what counts as categorical — a column pandas already calls
    an object or a category is handled by the ordinary path and never reaches
    here.
    """
    s = series.dropna()
    if s.empty or not pd.api.types.is_numeric_dtype(s):
        return False
    if pd.api.types.is_bool_dtype(s):
        return True
    if not is_integer_valued(s):
        return False
    n_unique = s.nunique()
    if n_unique < 2 or n_unique > MAX_LEVELS:
        return False
    return n_unique / len(s) < MAX_LEVEL_SHARE


def is_measurement(series: pd.Series) -> bool:
    """
    True when a column should be treated as a continuous measurement — the
    question the test selector is actually asking when it checks a dtype.
    """
    return (
        pd.api.types.is_numeric_dtype(series)
        and not is_effectively_categorical(series)
    )
