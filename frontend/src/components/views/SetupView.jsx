import { useCallback, useRef, useState } from 'react'
import {
  UploadCloud, FileSpreadsheet, Link2, BookOpen, Plus, X, Lock,
  ArrowRight, AlertCircle, Table2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/store'
import { formatBytes } from '../../lib/format'
import Button from '../ui/Button'
import { Card } from '../ui/Card'
import BackendStatus from '../BackendStatus'

const ACCEPT = '.csv,.tsv,.xlsx,.xls'

export default function SetupView({ onStarted }) {
  const start = useSession((s) => s.start)
  const running = useSession((s) => s.running)

  const [file, setFile] = useState(null)
  const [dataDict, setDataDict] = useState(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [mode, setMode] = useState('file')      // 'file' | 'sheet'
  const [hypotheses, setHypotheses] = useState([])
  const [draft, setDraft] = useState('')
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState(null)

  const fileInput = useRef(null)
  const dictInput = useRef(null)

  const accept = useCallback((f) => {
    if (!f) return
    if (f.size > 200 * 1024 * 1024) {
      setProblem('That file is over 200 MB. Trim it or sample it before uploading.')
      return
    }
    if (!/\.(csv|tsv|xlsx|xls)$/i.test(f.name)) {
      setProblem(`${f.name} isn't a table. Upload a .csv, .tsv, .xlsx or .xls file.`)
      return
    }
    setProblem(null)
    setFile(f)
  }, [])

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files?.[0])
  }

  function addHypothesis() {
    const v = draft.trim()
    if (!v) return
    setHypotheses((h) => [...h, v])
    setDraft('')
  }

  const ready = mode === 'file' ? Boolean(file) : /^https?:\/\//.test(sheetUrl.trim())

  async function begin() {
    if (!ready || running) return
    onStarted?.()
    await start({
      file: mode === 'file' ? file : null,
      sheetUrl: mode === 'sheet' ? sheetUrl.trim() : null,
      dataDict,
      hypotheses,
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="animate-rise">
        <h2 className="text-[26px] font-bold tracking-tight text-ink sm:text-[30px]">
          Load a table.
        </h2>
        <p className="measure mt-2 text-[15px] leading-relaxed text-slate">
          Ledger profiles the columns, proposes hypotheses, then locks them. Nothing can be added
          after the lock, which is what stops the analysis from being steered by its own results.
        </p>
      </header>

      <BackendStatus className="mt-5" />

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* ── Source ──────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="inline-flex rounded-lg bg-fog p-0.5" role="tablist">
            {[
              { id: 'file',  label: 'Upload a file', icon: FileSpreadsheet },
              { id: 'sheet', label: 'Link a sheet',  icon: Link2 },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => setMode(t.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-all',
                  mode === t.id ? 'bg-paper text-ink shadow-hair' : 'text-slate hover:text-ink',
                )}
              >
                <t.icon size={13} aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>

          {mode === 'file' ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'relative rounded-xl border-2 border-dashed transition-colors duration-150',
                dragging ? 'border-brand bg-brand-tint' : 'border-silver bg-paper',
                file && !dragging && 'border-supported-edge bg-supported-tint/40',
              )}
            >
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => { accept(e.target.files?.[0]); e.target.value = '' }}
              />

              {file ? (
                <div className="flex items-center gap-3 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper ring-1 ring-silver">
                    <Table2 size={18} className="text-supported-text" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{file.name}</p>
                    <p className="tnum text-[12.5px] text-slate">{formatBytes(file.size)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                    <X size={14} /> Remove
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full flex-col items-center px-6 py-12 text-center"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mist ring-1 ring-silver">
                    <UploadCloud size={20} className="text-slate" aria-hidden="true" />
                  </div>
                  <p className="mt-3.5 text-[14.5px] font-medium text-ink">
                    Drop a CSV or Excel file here
                  </p>
                  <p className="mt-1 text-[13px] text-slate">
                    or click to browse · up to 200 MB
                  </p>
                </button>
              )}
            </div>
          ) : (
            <Card>
              <label htmlFor="sheet-url" className="block text-[13px] font-medium text-ink">
                Google Sheets or Drive CSV link
              </label>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
                The sheet has to be readable by anyone with the link.
              </p>
              <input
                id="sheet-url"
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="mt-3 w-full rounded-lg border border-silver bg-mist px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-slate/60 focus:border-brand focus:bg-paper"
              />
            </Card>
          )}

          {problem && (
            <div className="flex items-start gap-2 rounded-lg bg-error-tint px-3 py-2.5 ring-1 ring-error-edge">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-error-text" aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed text-error-text">{problem}</p>
            </div>
          )}

          {/* Data dictionary → RAG context for the proposer */}
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mist ring-1 ring-silver">
                <BookOpen size={15} className="text-slate" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13.5px] font-semibold text-ink">
                  Data dictionary <span className="font-normal text-slate">— optional</span>
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
                  A description of what the columns mean. Without one, a column named
                  {' '}<code className="rounded bg-fog px-1 font-mono text-[11.5px]">q3</code> is
                  just a number; with one, the proposer knows what it measures.
                </p>

                <input
                  ref={dictInput}
                  type="file"
                  accept=".txt,.md,.csv,.json,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    setDataDict(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />

                {dataDict ? (
                  <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-mist px-2.5 py-1.5 ring-1 ring-silver">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-graphite">
                      {dataDict.name}
                    </span>
                    <button
                      onClick={() => setDataDict(null)}
                      className="text-slate hover:text-ink"
                      aria-label="Remove the data dictionary"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="secondary" size="sm" className="mt-2.5"
                    onClick={() => dictInput.current?.click()}
                  >
                    Attach a dictionary
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ── Your hypotheses ─────────────────────────────── */}
        <div className="space-y-4">
          <Card className="border-t-2 border-t-a3">
            <div className="flex items-start gap-2">
              <Lock size={14} className="mt-0.5 shrink-0 text-a3" aria-hidden="true" />
              <div>
                <h3 className="text-[13.5px] font-semibold text-ink">Add your own hypotheses</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
                  These join the registry alongside the proposed ones and are tested on the same
                  terms. Add them now — after the freeze the registry will not accept them.
                </p>
              </div>
            </div>

            <div className="mt-3.5 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHypothesis() } }}
                placeholder="Churned customers have shorter tenure"
                className="min-w-0 flex-1 rounded-lg border border-silver bg-mist px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-slate/60 focus:border-brand focus:bg-paper"
              />
              <Button variant="secondary" size="md" onClick={addHypothesis} disabled={!draft.trim()}>
                <Plus size={14} /> Add
              </Button>
            </div>

            {hypotheses.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {hypotheses.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-mist px-2.5 py-2 ring-1 ring-silver"
                  >
                    <span className="mt-px shrink-0 font-mono text-[10.5px] font-semibold text-a3">
                      UH{String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">{h}</span>
                    <button
                      onClick={() => setHypotheses((xs) => xs.filter((_, j) => j !== i))}
                      className="shrink-0 text-slate hover:text-error-text"
                      aria-label={`Remove hypothesis ${i + 1}`}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="bg-mist">
            <h3 className="text-[13px] font-semibold text-ink">What happens next</h3>
            <ol className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-slate">
              {[
                'The columns are profiled — types, missingness, distributions. Marginal summaries only, so nothing peeks at relationships.',
                'Hypotheses are proposed from that profile and joined with yours.',
                'The registry is hashed and frozen. This is the point of no return.',
                'Each hypothesis is tested in a sandbox, then adjudicated by code — assumptions checked, test chosen, BH correction applied across the whole family.',
                'A report is written from licensed text only, then red-teamed before you see it.',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="tnum shrink-0 font-mono text-[11px] text-slate/70">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Button
            variant="primary" size="lg" className="w-full"
            disabled={!ready} loading={running} onClick={begin}
          >
            {running ? 'Analysing…' : 'Start the analysis'}
            {!running && <ArrowRight size={16} />}
          </Button>
          {!ready && (
            <p className="text-center text-[12px] text-slate">
              {mode === 'file' ? 'Choose a file to continue.' : 'Paste a link to continue.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
