"""
PDF Report Export
=================
A printable ledger.

The design is literal on purpose. An accounting ledger has a double rule down
the spine, ruled rows rather than boxes, figures aligned in columns, and a
register in which nothing is ever struck out. That is the same object this
engine produces: every registered hypothesis stays in the family whether it
survived or not, because the Benjamini-Hochberg correction is computed across
all of them. Laying the document out as a ledger makes the argument visible
without a sentence of explanation.

Rendered with fpdf2 — pure Python, no cairo, no pango, no headless browser, so
it builds and boots inside the same 512MB container as the rest of the service.
Charts are drawn as vectors rather than rasterised from Plotly, which avoids
pulling in kaleido (~100MB) and prints sharper besides.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from core.ledger import Ledger, HypothesisStatus

# ─── Page geometry (mm, A4) ───────────────────────────────────────────────────

PAGE_W, PAGE_H = 210.0, 297.0
M_LEFT, M_RIGHT, M_TOP, M_BOT = 32.0, 18.0, 22.0, 20.0
CONTENT_W = PAGE_W - M_LEFT - M_RIGHT          # 160mm
SPINE_X = 20.0                                  # the ledger's double rule

# ─── Palette ──────────────────────────────────────────────────────────────────
# Warm paper rather than cool white; ink rather than black, which prints
# harshly. Ochre, not red, for a hypothesis that simply did not survive — a null
# result is a result, and colouring it like a failure would misreport it.

PAPER      = (251, 250, 247)
INK        = (21, 26, 33)
SLATE      = (94, 103, 115)
MUTED      = (140, 147, 157)
RULE       = (220, 215, 204)
HAIRLINE   = (232, 228, 219)
SPINE      = (31, 58, 95)
SUPPORTED  = (20, 107, 69)
NOTSUPP    = (138, 106, 22)
FAILED     = (156, 58, 44)
CODE_BG    = (245, 243, 238)

STATUS_INK = {
    "SUPPORTED": SUPPORTED,
    "REJECTED": NOTSUPP,
    "ERROR": FAILED,
}
STATUS_WORD = {
    "SUPPORTED": "Supported",
    "REJECTED": "Not supported",
    "ERROR": "Did not run",
}

FONT_DIR = Path(__file__).parent / "fonts"


# ─── Text helpers ─────────────────────────────────────────────────────────────

_SUBSTITUTIONS = {
    "—": "--", "–": "-", "‘": "'", "’": "'",
    "“": '"', "”": '"', "…": "...", "×": "x",
    "−": "-", "≤": "<=", "≥": ">=", "≈": "~",
    " ": " ", "′": "'", "α": "alpha", "χ": "chi",
    "η": "eta", "Δ": "delta", "→": "->",
}


def _latin1(text: str) -> str:
    """
    Fold text into what a core PDF font can actually set.

    Only used when no TTF is embedded. Dropping a character silently would put
    a hole in a sentence the reader is meant to be able to check, so anything
    unmappable is transliterated rather than discarded.
    """
    for src, dst in _SUBSTITUTIONS.items():
        text = text.replace(src, dst)
    text = unicodedata.normalize("NFKD", text)
    return text.encode("latin-1", "replace").decode("latin-1")


def _fmt_p(p: Optional[float]) -> str:
    """
    Print the p-value the statistician actually computed.

    No clamping. An earlier draft collapsed anything below 1e-99 to "< 1e-99",
    which put that string in the results table directly beneath licensed text
    quoting 7.8e-189 — the same test appearing to report two different numbers
    on one page. Underflow to exactly zero is the only case that needs a
    qualifier, and it gets one that says so.
    """
    if p is None:
        return "--"
    if p == 0:
        return "< 1e-308"
    if p < 0.001:
        return f"{p:.2e}"
    return f"{p:.4f}"


def _fmt_stat(v: Optional[float]) -> str:
    return "--" if v is None else f"{v:.4g}"


class LedgerPDF(FPDF):
    """An FPDF that knows it is a ledger: spine rule, running foot, brand type."""

    def __init__(self, ledger: Ledger):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.ledger = ledger
        self.unicode_ok = False
        self.body = "Helvetica"
        self.mono = "Courier"
        self._load_fonts()
        self.set_margins(M_LEFT, M_TOP, M_RIGHT)
        self.set_auto_page_break(auto=True, margin=M_BOT)
        self.set_title(f"Ledger — {self._dataset_name()}")
        self.set_author("Ledger")
        self.set_creator("Ledger analysis engine")
        self.set_subject("Pre-registered statistical analysis")
        self.cover_page = True

    # -- setup ---------------------------------------------------------------

    def _load_fonts(self) -> None:
        """
        Embed the product's own typefaces when they are present.

        Space Grotesk and JetBrains Mono are the faces the web app uses, both
        under the SIL Open Font License, so the printed artefact and the screen
        are recognisably the same product. If the files are absent the document
        still renders — it falls back to the core fonts and folds its text to
        latin-1 rather than failing to produce a report at all.
        """
        faces = [
            ("Grotesk", "", "SpaceGrotesk-Regular.ttf"),
            ("Grotesk", "B", "SpaceGrotesk-Bold.ttf"),
            ("Mono", "", "JetBrainsMono-Regular.ttf"),
            ("Mono", "B", "JetBrainsMono-Bold.ttf"),
        ]
        if not all((FONT_DIR / f).exists() for _, _, f in faces):
            self.body, self.mono = "Helvetica", "Courier"
            return
        try:
            for family, style, fname in faces:
                self.add_font(family, style, str(FONT_DIR / fname))
            self.body, self.mono, self.unicode_ok = "Grotesk", "Mono", True
        except Exception:
            self.body, self.mono, self.unicode_ok = "Helvetica", "Courier", False

    def _dataset_name(self) -> str:
        ds = self.ledger.dataset
        return ds.filename if ds else "Analysis"

    # -- text primitives -----------------------------------------------------

    def t(self, text: str) -> str:
        return text if self.unicode_ok else _latin1(text)

    def use(self, family: str = "body", style: str = "", size: float = 9.5,
            color: Sequence[int] = INK) -> None:
        self.set_font(self.body if family == "body" else self.mono, style, size)
        self.set_text_color(*color)

    def wrap(self, text: str, width: float) -> List[str]:
        """
        Break text to a measured width.

        Written by hand rather than leaning on multi_cell's dry run because the
        register needs each row's height *before* it decides whether the row
        fits on the page, and that API has moved between fpdf2 releases.
        """
        text = self.t(text or "")
        lines: List[str] = []
        for para in text.split("\n"):
            words, cur = para.split(), ""
            if not words:
                lines.append("")
                continue
            for w in words:
                probe = f"{cur} {w}".strip()
                if self.get_string_width(probe) <= width or not cur:
                    cur = probe
                else:
                    lines.append(cur)
                    cur = w
            lines.append(cur)
        return lines

    def para(self, text: str, size: float = 9.5, leading: float = 4.6,
             color: Sequence[int] = SLATE, style: str = "",
             family: str = "body", width: Optional[float] = None) -> None:
        self.use(family, style, size, color)
        w = width or CONTENT_W
        for line in self.wrap(text, w):
            self.cell(w, leading, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def rule(self, gap_before: float = 0.0, gap_after: float = 0.0,
             color: Sequence[int] = RULE, width: Optional[float] = None) -> None:
        self.ln(gap_before)
        self.set_draw_color(*color)
        self.set_line_width(0.2)
        y = self.get_y()
        self.line(M_LEFT, y, M_LEFT + (width or CONTENT_W), y)
        self.ln(gap_after)

    def section(self, title: str, standfirst: str = "") -> None:
        self.ln(4)
        self.rule(gap_after=2.6)
        self.use("body", "B", 14.5, INK)
        self.cell(CONTENT_W, 7, self.t(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if standfirst:
            self.ln(0.8)
            self.para(standfirst, size=9, leading=4.4, color=SLATE)
        self.ln(2.5)

    def label(self, text: str, color: Sequence[int] = MUTED) -> None:
        """
        A small caps marker. Used only where it names a real constraint in the
        system — 'licensed text' is the engine's own term for the only prose the
        reporter was permitted to emit — never as decoration above a heading.
        """
        self.use("mono", "B", 6.4, color)
        self.cell(CONTENT_W, 3.4, self.t(text.upper()),
                  new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def keep(self, needed: float) -> None:
        """Start a new page rather than orphan a block that needs `needed` mm."""
        if self.get_y() + needed > PAGE_H - M_BOT:
            self.add_page()

    # -- page furniture ------------------------------------------------------

    def header(self) -> None:
        self.set_fill_color(*PAPER)
        self.rect(0, 0, PAGE_W, PAGE_H, style="F")
        # The double spine rule: one weighted, one hairline, as ruled stock has.
        self.set_draw_color(*SPINE)
        self.set_line_width(0.7)
        self.line(SPINE_X, M_TOP - 6, SPINE_X, PAGE_H - M_BOT + 4)
        self.set_draw_color(*RULE)
        self.set_line_width(0.2)
        self.line(SPINE_X + 1.5, M_TOP - 6, SPINE_X + 1.5, PAGE_H - M_BOT + 4)

    def footer(self) -> None:
        if self.cover_page and self.page_no() == 1:
            return
        self.set_y(-14)
        self.set_draw_color(*HAIRLINE)
        self.set_line_width(0.2)
        self.line(M_LEFT, self.get_y() - 1.5, M_LEFT + CONTENT_W, self.get_y() - 1.5)
        self.use("mono", "", 6.6, MUTED)
        left = f"{self._dataset_name()}  registry {self.ledger.registry_hash or 'unsealed'}"
        self.cell(CONTENT_W - 20, 4, self.t(left))
        self.cell(20, 4, str(self.page_no()), align="R")


# ─── Cover ────────────────────────────────────────────────────────────────────

def _cover(pdf: LedgerPDF, counts: dict, entries: list) -> None:
    lg = pdf.ledger
    ds = lg.dataset
    pdf.add_page()
    pdf.set_y(M_TOP + 4)

    pdf.use("mono", "B", 7, SPINE)
    pdf.cell(CONTENT_W, 4, pdf.t("LEDGER   PRE-REGISTERED ANALYSIS"),
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(12)

    pdf.use("body", "B", 30, INK)
    for line in pdf.wrap(pdf._dataset_name(), CONTENT_W):
        pdf.cell(CONTENT_W, 12.5, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(2)
    if ds:
        pdf.use("mono", "", 9, SLATE)
        pdf.cell(CONTENT_W, 5,
                 pdf.t(f"{ds.n_rows:,} rows  x  {ds.n_cols} columns"),
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # ── the seal ──────────────────────────────────────────────────────────────
    # The one loud element in the document. Everything else stays quiet.
    pdf.ln(14)
    top = pdf.get_y()
    box_h = 44.0
    pdf.set_fill_color(*CODE_BG)
    pdf.rect(M_LEFT, top, CONTENT_W, box_h, style="F")
    pdf.set_draw_color(*SPINE)
    pdf.set_line_width(1.1)
    pdf.line(M_LEFT, top, M_LEFT, top + box_h)

    pdf.set_xy(M_LEFT + 9, top + 7)
    pdf.use("mono", "B", 6.6, SPINE)
    pdf.cell(CONTENT_W - 18, 3.6,
             pdf.t("REGISTRY SEALED" if lg.is_frozen else "REGISTRY NEVER SEALED"),
             new_x=XPos.LEFT, new_y=YPos.NEXT)

    h = lg.registry_hash or "---"
    pretty = f"{h[:8]} {h[8:]}" if len(h) > 8 else h
    pdf.set_xy(M_LEFT + 9, top + 13)
    pdf.use("mono", "B", 19, INK)
    pdf.cell(CONTENT_W - 18, 10, pdf.t(pretty), new_x=XPos.LEFT, new_y=YPos.NEXT)

    pdf.set_xy(M_LEFT + 9, top + 26.5)
    pdf.use("body", "", 8.6, SLATE)
    seal_note = (
        f"{len(entries)} hypotheses were fixed and hashed before a single test ran. "
        "Nothing could be added, reworded or withdrawn afterwards."
        if lg.is_frozen else
        "This analysis did not reach the freeze, so its hypotheses carry no "
        "pre-registration guarantee."
    )
    for line in pdf.wrap(seal_note, CONTENT_W - 20):
        pdf.set_x(M_LEFT + 9)
        pdf.cell(CONTENT_W - 18, 4.2, line, new_x=XPos.LEFT, new_y=YPos.NEXT)

    # ── the evidence strip ────────────────────────────────────────────────────
    # One cell per registered hypothesis, in register order. The reader can see
    # the whole family at once, which is the point: the failures are not hidden,
    # they are part of the arithmetic.
    pdf.set_y(top + box_h + 16)
    pdf.label("THE WHOLE FAMILY, IN REGISTER ORDER")
    pdf.ln(2)

    n = max(len(entries), 1)
    gap, strip_h = 1.2, 9.0
    cell_w = (CONTENT_W - gap * (n - 1)) / n
    y = pdf.get_y()
    for i, e in enumerate(entries):
        status = e.status.value if hasattr(e.status, "value") else str(e.status)
        pdf.set_fill_color(*STATUS_INK.get(status, MUTED))
        pdf.rect(M_LEFT + i * (cell_w + gap), y, cell_w, strip_h, style="F")
    pdf.set_y(y + strip_h + 4)

    legend: List[Tuple[str, Sequence[int], int]] = [
        ("supported", SUPPORTED, counts["supported"]),
        ("not supported", NOTSUPP, counts["rejected"]),
        ("did not run", FAILED, counts["errored"]),
    ]
    x = M_LEFT
    for word, color, count in legend:
        if count == 0 and word == "did not run":
            continue
        pdf.set_fill_color(*color)
        pdf.rect(x, pdf.get_y() + 1.1, 2.4, 2.4, style="F")
        pdf.set_xy(x + 4, pdf.get_y())
        pdf.use("mono", "B", 8.4, INK)
        w = pdf.get_string_width(str(count)) + 1.8
        pdf.cell(w, 4.6, str(count))
        pdf.use("body", "", 8.4, SLATE)
        lw = pdf.get_string_width(pdf.t(word)) + 8
        pdf.cell(lw, 4.6, pdf.t(word))
        x += 4 + w + lw

    # ── what the reader opened the document for ───────────────────────────────
    # The lower half of the cover was empty in the first draft. Whitespace is
    # fine, but a claim the reader has to turn a page to find is not, so the
    # surviving statements sit here, each with the id that indexes its entry.
    pdf.set_y(pdf.get_y() + 12)
    survivors = [e for e in entries
                 if (e.status.value if hasattr(e.status, "value") else str(e.status))
                 == "SUPPORTED"]
    if survivors:
        pdf.label("WHAT SURVIVED CORRECTION")
        pdf.ln(2)
        for e in survivors[:6]:
            if pdf.get_y() > PAGE_H - M_BOT - 34:
                break
            y = pdf.get_y()
            pdf.use("mono", "B", 7.6, SUPPORTED)
            pdf.cell(12, 4.6, pdf.t(e.id))
            pdf.use("body", "", 9, INK)
            for i, line in enumerate(pdf.wrap(e.statement, CONTENT_W - 14)):
                pdf.set_xy(M_LEFT + 12, y + i * 4.6)
                pdf.cell(CONTENT_W - 12, 4.6, line)
                y_end = y + (i + 1) * 4.6
            pdf.set_y(y_end + 1.6)
        if len(survivors) > 6:
            pdf.use("body", "", 8, MUTED)
            pdf.cell(CONTENT_W, 4.4,
                     pdf.t(f"and {len(survivors) - 6} more, listed in the register"),
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    else:
        pdf.label("WHAT SURVIVED CORRECTION")
        pdf.ln(2)
        pdf.para(
            "Nothing. No registered hypothesis cleared the corrected threshold, "
            "which is a result about this table rather than a failure of the run.",
            size=9, color=INK)

    # ── provenance foot ───────────────────────────────────────────────────────
    pdf.set_y(PAGE_H - M_BOT - 24)
    pdf.rule(gap_after=2.4, color=HAIRLINE)
    pdf.use("mono", "", 6.8, MUTED)
    stamp = datetime.utcnow().strftime("%d %B %Y  %H:%M UTC")
    try:
        final_hash = lg.compute_final_hash()
    except Exception:
        final_hash = "--"
    pdf.cell(CONTENT_W, 3.8, pdf.t(f"GENERATED  {stamp}"),
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.cell(CONTENT_W, 3.8, pdf.t(f"REPRODUCIBILITY  {final_hash}"),
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.use("body", "", 7.4, MUTED)
    pdf.cell(CONTENT_W, 4,
             pdf.t("The model proposed and phrased. Deterministic statistics decided."),
             new_x=XPos.LMARGIN, new_y=YPos.NEXT)


# ─── The register ─────────────────────────────────────────────────────────────

COLS = [("", 12.0), ("Hypothesis", 62.0), ("Test", 33.0), ("BH p", 23.0), ("", 30.0)]


def _register_head(pdf: LedgerPDF) -> None:
    pdf.use("mono", "B", 6.4, MUTED)
    x = M_LEFT
    for title, w in COLS:
        pdf.set_xy(x, pdf.get_y())
        align = "R" if title == "BH p" else "L"
        pdf.cell(w, 4, pdf.t(title.upper()), align=align)
        x += w
    pdf.ln(4.6)
    pdf.rule(color=RULE)
    pdf.ln(1.6)


def _register(pdf: LedgerPDF, entries: list) -> None:
    pdf.add_page()
    pdf.section(
        "The register",
        "Every hypothesis that was sealed, in the order it was registered. The "
        "Benjamini-Hochberg correction was computed across this entire family, so "
        "the entries that found nothing are doing arithmetic work here rather "
        "than sitting in an appendix.",
    )
    _register_head(pdf)

    for e in entries:
        status = e.status.value if hasattr(e.status, "value") else str(e.status)
        r = e.statistical_result
        pdf.use("body", "", 8.4, INK)
        stmt_lines = pdf.wrap(e.statement, COLS[1][1] - 4)
        pdf.use("body", "", 7.8, SLATE)
        test_lines = pdf.wrap((r.test_name if r else "--") or "--", COLS[2][1] - 3)
        row_h = max(len(stmt_lines) * 4.1, len(test_lines) * 4.1, 4.1) + 3.4

        if pdf.get_y() + row_h > PAGE_H - M_BOT:
            pdf.add_page()
            _register_head(pdf)

        y0 = pdf.get_y()
        x = M_LEFT

        pdf.set_xy(x, y0)
        pdf.use("mono", "B", 7.6, SPINE if e.user_defined else MUTED)
        pdf.cell(COLS[0][1], 4.1, pdf.t(e.id))
        x += COLS[0][1]

        pdf.use("body", "", 8.4, INK)
        for i, line in enumerate(stmt_lines):
            pdf.set_xy(x, y0 + i * 4.1)
            pdf.cell(COLS[1][1] - 4, 4.1, line)
        x += COLS[1][1]

        pdf.use("body", "", 7.8, SLATE)
        for i, line in enumerate(test_lines):
            pdf.set_xy(x, y0 + i * 4.1)
            pdf.cell(COLS[2][1] - 3, 4.1, line)
        x += COLS[2][1]

        pdf.set_xy(x, y0)
        pdf.use("mono", "", 7.8, INK if r else MUTED)
        pdf.cell(COLS[3][1] - 4, 4.1,
                 pdf.t(_fmt_p(r.fdr_adjusted_p_value) if r else "--"), align="R")
        x += COLS[3][1]

        pdf.set_xy(x, y0)
        pdf.set_fill_color(*STATUS_INK.get(status, MUTED))
        pdf.rect(x, y0 + 1.2, 2.0, 2.0, style="F")
        pdf.set_xy(x + 3.4, y0)
        pdf.use("body", "B" if status == "SUPPORTED" else "", 7.8,
                STATUS_INK.get(status, MUTED))
        pdf.cell(COLS[4][1] - 3.4, 4.1, pdf.t(STATUS_WORD.get(status, status)))

        pdf.set_y(y0 + row_h)
        pdf.rule(color=HAIRLINE)
        pdf.ln(1.6)


# ─── Findings ─────────────────────────────────────────────────────────────────

def _entry_detail(pdf: LedgerPDF, e, full: bool) -> None:
    status = e.status.value if hasattr(e.status, "value") else str(e.status)
    r = e.statistical_result
    color = STATUS_INK.get(status, MUTED)

    pdf.keep(34)
    pdf.ln(3)
    y0 = pdf.get_y()
    pdf.set_draw_color(*color)
    pdf.set_line_width(1.0)

    pdf.use("mono", "B", 7.6, color)
    pdf.cell(14, 5, pdf.t(e.id))
    pdf.use("body", "B", 11, INK)
    head = pdf.wrap(e.statement, CONTENT_W - 14)
    for i, line in enumerate(head):
        pdf.set_xy(M_LEFT + 14, y0 + i * 5)
        pdf.cell(CONTENT_W - 14, 5, line)
    pdf.set_y(y0 + max(len(head), 1) * 5 + 1)
    pdf.line(M_LEFT - 4, y0, M_LEFT - 4, pdf.get_y())

    if e.user_defined:
        pdf.use("mono", "", 6.4, SPINE)
        pdf.cell(CONTENT_W, 3.6, pdf.t("YOUR HYPOTHESIS"),
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    if not r:
        pdf.ln(1)
        reason = (getattr(e, "failure_reason", None) or "").strip()
        if reason:
            # Say which one it was. "One group holds a single row" and "the
            # generated code crashed" are different facts about the analysis,
            # and a reader who cannot tell them apart cannot judge the run.
            pdf.label("WHY NO VERDICT WAS REACHED")
            pdf.ln(0.8)
            pdf.para(reason, size=8.6, color=INK)
            pdf.ln(1)
        pdf.para(
            "No verdict was reached, so this entry carries no p-value. It stays "
            "in the register and still counts toward the correction, which is why "
            "the adjusted p-values elsewhere are as conservative as they are.",
            size=8.4, color=SLATE)
        return

    # The claim, in the only words the reporter was licensed to use.
    if r.licensed_text:
        pdf.ln(2)
        pdf.label("LICENSED TEXT", color)
        pdf.ln(0.6)
        pdf.set_fill_color(*CODE_BG)
        lines = []
        pdf.use("body", "", 9.2, INK)
        lines = pdf.wrap(r.licensed_text, CONTENT_W - 12)
        h = len(lines) * 4.7 + 6
        yq = pdf.get_y()
        pdf.rect(M_LEFT, yq, CONTENT_W, h, style="F")
        pdf.set_draw_color(*color)
        pdf.set_line_width(1.0)
        pdf.line(M_LEFT, yq, M_LEFT, yq + h)
        for i, line in enumerate(lines):
            pdf.set_xy(M_LEFT + 7, yq + 3 + i * 4.7)
            pdf.cell(CONTENT_W - 12, 4.7, line)
        pdf.set_y(yq + h + 3)

    # The arithmetic, in a two-column ruled block.
    pdf.keep(24)
    pdf.ln(1)
    pdf.label("WHAT THE TEST RETURNED")
    pdf.ln(1)
    rows: List[Tuple[str, str]] = [
        ("Test selected", r.test_name or "--"),
        ("Statistic", _fmt_stat(r.statistic)),
        ("Raw p", _fmt_p(r.raw_p_value)),
        ("BH-adjusted p", _fmt_p(r.fdr_adjusted_p_value)),
    ]
    if r.effect_size is not None:
        label = f" ({r.effect_size_label})" if r.effect_size_label else ""
        rows.append(("Effect size", f"{_fmt_stat(r.effect_size)}{label}"))
    rows.append(("Alpha", _fmt_stat(r.alpha)))

    for k, v in rows:
        pdf.keep(6)
        y = pdf.get_y()
        pdf.use("body", "", 8.2, SLATE)
        pdf.cell(46, 4.8, pdf.t(k))
        pdf.use("mono", "B" if k == "BH-adjusted p" else "", 8.2, INK)
        pdf.cell(CONTENT_W - 46, 4.8, pdf.wrap(v, CONTENT_W - 48)[0],
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_draw_color(*HAIRLINE)
        pdf.set_line_width(0.15)
        pdf.line(M_LEFT, y + 4.8, M_LEFT + CONTENT_W, y + 4.8)

    # Why that test and not another one.
    if r.assumptions:
        pdf.keep(18)
        pdf.ln(3)
        pdf.label("WHY THAT TEST WAS THE ONE RUN")
        pdf.ln(1)
        for a in r.assumptions:
            pdf.keep(6)
            verdict = "holds" if a.passed else "violated"
            detail = f"  p = {_fmt_p(a.p_value)}" if a.p_value is not None else ""
            pdf.use("body", "", 8.2, SLATE)
            pdf.cell(64, 4.6, pdf.wrap(a.name, 62)[0])
            pdf.use("body", "B", 8.2, SUPPORTED if a.passed else NOTSUPP)
            pdf.cell(20, 4.6, pdf.t(verdict))
            pdf.use("mono", "", 7.6, MUTED)
            pdf.cell(CONTENT_W - 84, 4.6, pdf.t(detail),
                     new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            if a.note:
                pdf.para(a.note, size=7.6, leading=3.8, color=SLATE)

    if not full:
        return

    # The code, so the number above can be recomputed rather than believed.
    attempt = e.execution_attempts[-1] if e.execution_attempts else None
    if attempt and attempt.code:
        repairs = len(e.execution_attempts) - 1
        pdf.keep(22)
        pdf.ln(3)
        pdf.label("CODE EXECUTED" + (f"  REPAIRED {repairs}x" if repairs else ""))
        pdf.ln(1)
        pdf.use("mono", "", 6.9, INK)
        code_lines: List[str] = []
        for raw in attempt.code.replace("\t", "    ").split("\n"):
            if pdf.get_string_width(pdf.t(raw)) <= CONTENT_W - 8:
                code_lines.append(raw)
                continue
            indent = re.match(r"\s*", raw).group(0)
            cur = ""
            for tok in raw.split(" "):
                probe = f"{cur} {tok}".strip()
                if pdf.get_string_width(pdf.t(probe)) <= CONTENT_W - 8 or not cur:
                    cur = probe
                else:
                    code_lines.append(cur)
                    cur = indent + "    " + tok
            code_lines.append(cur)

        i = 0
        while i < len(code_lines):
            room = int((PAGE_H - M_BOT - pdf.get_y() - 4) / 3.5)
            if room < 4:
                pdf.add_page()
                pdf.use("mono", "", 6.9, INK)
                room = int((PAGE_H - M_BOT - pdf.get_y() - 4) / 3.5)
            chunk = code_lines[i:i + room]
            y = pdf.get_y()
            pdf.set_fill_color(*CODE_BG)
            pdf.rect(M_LEFT, y, CONTENT_W, len(chunk) * 3.5 + 3, style="F")
            for j, line in enumerate(chunk):
                pdf.set_xy(M_LEFT + 4, y + 1.5 + j * 3.5)
                pdf.cell(CONTENT_W - 8, 3.5, pdf.t(line))
            pdf.set_y(y + len(chunk) * 3.5 + 3)
            i += room


def _findings(pdf: LedgerPDF, supported: list, others: list) -> None:
    pdf.add_page()
    if supported:
        pdf.section(
            "What survived",
            "Each claim below is quoted in the only wording the reporter was "
            "licensed to emit for it, followed by the arithmetic and the code "
            "that produced it.",
        )
        for e in supported:
            _entry_detail(pdf, e, full=True)
            pdf.ln(3)
    else:
        pdf.section(
            "Nothing survived",
            "No registered hypothesis cleared the corrected threshold. That is a "
            "result, not a failure of the run: it says the effects proposed from "
            "the column profile are not present in this data at this sample size.",
        )

    if others:
        pdf.add_page()
        pdf.section(
            "What did not",
            "Recorded in full, for the same reason they stayed in the family: an "
            "analysis you can only see the wins of is not one you can check.",
        )
        for e in others:
            _entry_detail(pdf, e, full=False)
            pdf.ln(2)


# ─── Red team + colophon ──────────────────────────────────────────────────────

def _red_team(pdf: LedgerPDF) -> None:
    violations = pdf.ledger.adversary_violations
    pdf.add_page()
    pdf.section(
        "What the red team flagged",
        "Before the report was released it was read back by an adversarial pass "
        "looking for causal language, overstated effects and claims with no entry "
        "behind them.",
    )
    if not violations:
        pdf.para(
            "Nothing was flagged. Every sentence released traced to an entry in "
            "the register, no claim of causation was made from observational data, "
            "and no effect was described more strongly than its measured size "
            "supports.", size=9, color=SLATE)
        return
    for v in violations:
        pdf.keep(24)
        pdf.use("body", "B", 9.4, FAILED)
        pdf.cell(CONTENT_W - 22, 5, pdf.t(v.violation_type.replace("_", " ").title()))
        pdf.use("mono", "B", 6.6, FAILED)
        pdf.cell(22, 5, pdf.t(v.severity), align="R",
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(0.8)
        pdf.para(f'"{v.sentence}"', size=8.6, color=INK, style="")
        pdf.ln(0.6)
        pdf.para(v.explanation, size=8.2, color=SLATE)
        pdf.rule(gap_before=2, gap_after=3, color=HAIRLINE)


def _colophon(pdf: LedgerPDF, entries: list) -> None:
    lg = pdf.ledger
    pdf.add_page()
    pdf.section("How to check this document")

    ds = lg.dataset
    facts: List[Tuple[str, str]] = [
        ("Source table", ds.filename if ds else "--"),
        ("Shape", f"{ds.n_rows:,} rows x {ds.n_cols} columns" if ds else "--"),
        ("Registry hash", lg.registry_hash or "never sealed"),
        ("Sealed at", lg.registered_at.strftime("%d %B %Y %H:%M UTC")
            if lg.registered_at else "--"),
        ("Hypotheses in family", str(len(entries))),
        ("Correction", "Benjamini-Hochberg, computed once across the whole family"),
        ("Self-repairs", str(lg.self_repair_count)),
        ("Model calls", str(lg.llm_call_count)),
    ]
    for k, v in facts:
        y = pdf.get_y()
        pdf.use("body", "", 8.4, SLATE)
        pdf.cell(52, 5, pdf.t(k))
        pdf.use("mono", "", 8.0, INK)
        pdf.cell(CONTENT_W - 52, 5, pdf.wrap(v, CONTENT_W - 54)[0],
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_draw_color(*HAIRLINE)
        pdf.set_line_width(0.15)
        pdf.line(M_LEFT, y + 5, M_LEFT + CONTENT_W, y + 5)

    pdf.ln(6)
    n = len(entries)
    pdf.para(
        "The number that matters on every entry is the BH-adjusted p, not the raw "
        f"one. The adjustment divides the evidence across all {n} registered "
        f"hypotheses, which is the price of having been allowed to ask {n} "
        "questions instead of one.",
        size=8.8, color=SLATE)
    pdf.ln(2)
    pdf.para(
        "Because the register was hashed before any test ran, the set of questions "
        "cannot have been chosen after seeing which ones worked. Recompute the hash "
        "from the statements listed in the register and it will match the value on "
        "the cover, or this document has been altered.",
        size=8.8, color=SLATE)

    if lg.reproducibility_warning:
        pdf.ln(3)
        pdf.use("body", "B", 8.6, NOTSUPP)
        pdf.cell(CONTENT_W, 5, pdf.t("Reproducibility warning"),
                 new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.para(
            "Part of this run depended on a non-deterministic step, so a rerun may "
            "not reproduce these numbers exactly.", size=8.4, color=SLATE)


# ─── Entry point ──────────────────────────────────────────────────────────────

def build_pdf(ledger: Ledger) -> bytes:
    """Render the ledger as a print-ready PDF and return its bytes."""
    entries = list(ledger.hypotheses)
    supported = [h for h in entries if h.status == HypothesisStatus.SUPPORTED]
    rejected = [h for h in entries if h.status == HypothesisStatus.REJECTED]
    errored = [h for h in entries if h.status == HypothesisStatus.ERROR]
    counts = {
        "supported": len(supported),
        "rejected": len(rejected),
        "errored": len(errored),
    }

    pdf = LedgerPDF(ledger)
    _cover(pdf, counts, entries)
    if entries:
        _register(pdf, entries)
        _findings(pdf, supported, rejected + errored)
    _red_team(pdf)
    _colophon(pdf, entries)

    out = pdf.output()
    return bytes(out)


def pdf_filename(ledger: Ledger) -> str:
    base = "analysis"
    if ledger.dataset and ledger.dataset.filename:
        base = re.sub(r"[^A-Za-z0-9._-]+", "-", ledger.dataset.filename)
        base = re.sub(r"\.(csv|tsv|xlsx|xls)$", "", base, flags=re.I) or "analysis"
    stamp = datetime.utcnow().strftime("%Y%m%d")
    return f"ledger-{base}-{stamp}.pdf"
