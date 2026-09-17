# Fonts embedded in the PDF export

Space Grotesk and JetBrains Mono are the two faces the web interface uses, so
the printed report and the screen are recognisably the same product.

Both are licensed under the SIL Open Font License 1.1, which permits
redistribution; the licences ship alongside the files as it requires.

The upstream releases are variable fonts. These are static instances pinned to
wght 400 and 700 with `fontTools.varLib.instancer`, done once here so the
container only ever loads four ordinary TTFs and never needs fontTools.

If these files are removed the PDF still renders — `pdf_report.py` falls back to
the core PDF fonts and folds its text to latin-1.
