import { useState } from 'react'
import { Terminal, Play, Workflow, Table2, AlertCircle } from 'lucide-react'
import { useSession } from '../../lib/store'
import { formatInt } from '../../lib/format'
import CodeBlock from '../ui/CodeBlock'
import Markdown from '../Markdown'
import Mermaid from '../Mermaid'
import Button from '../ui/Button'
import { Card } from '../ui/Card'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'

const EXAMPLES = [
  'Show the ten rows with the highest value in the first numeric column',
  'Count the rows in each category',
  'What is the average per group, sorted high to low',
  'Which rows have missing values',
]

export default function SqlLabView({ onNavigate }) {
  const report  = useSession((s) => s.report)
  const sql     = useSession((s) => s.sql)
  const pending = useSession((s) => s.sqlPending)
  const askSql  = useSession((s) => s.askSql)
  const [query, setQuery] = useState('')

  if (!report) {
    return (
      <EmptyState
        icon={Terminal}
        title="Load a table first"
        body="Once a dataset is in the session you can ask questions in plain English and get the SQL back, along with the plan it runs."
        action={<Button variant="primary" onClick={() => onNavigate?.('setup')}>Load a table</Button>}
      />
    )
  }

  function run(q) {
    const text = (q ?? query).trim()
    if (!text || pending) return
    setQuery(text)
    askSql(text)
  }

  const result = sql?.query_result
  const failed = sql?.error || result?.error

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header>
        <h2 className="text-[22px] font-bold tracking-tight text-ink">Ask the table directly</h2>
        <p className="measure mt-1.5 text-[14px] leading-relaxed text-slate">
          Describe what you want in plain English. You get the SQL, the plan it follows and the rows
          it returns — so you can check the query actually asks what you meant.
        </p>
      </header>

      <Card className="mt-6">
        <label htmlFor="nl-query" className="block text-[12.5px] font-medium text-ink">
          Your question
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="nl-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run() }}
            placeholder="Which categories have the highest average value?"
            className="min-w-0 flex-1 rounded-lg border border-silver bg-mist px-3 py-2 text-[13.5px] text-ink outline-none transition-colors placeholder:text-slate/60 focus:border-brand focus:bg-paper"
          />
          <Button variant="primary" onClick={() => run()} loading={pending} disabled={!query.trim()}>
            {!pending && <Play size={14} />} Run
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => run(ex)}
              disabled={pending}
              className="rounded-full bg-fog px-2.5 py-1 text-[11.5px] text-slate transition-colors hover:bg-brand-tint hover:text-brand-text disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {pending && (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!pending && sql && (
        <div className="mt-5 space-y-5">
          {failed && (
            <div className="flex items-start gap-2.5 rounded-xl bg-error-tint p-4 ring-1 ring-error-edge">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-error-text" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-error-text">The query did not run</p>
                <p className="mt-1 break-words font-mono text-[12px] leading-relaxed text-error-text/90">
                  {sql.error || result.error}
                </p>
              </div>
            </div>
          )}

          {sql.sql_query && (
            <Card flush className="overflow-hidden p-4">
              <h3 className="mb-2.5 text-[13px] font-semibold text-ink">The query</h3>
              <CodeBlock code={sql.sql_query} lang="sql" label="SQLite" />
              {sql.explanation && (
                <div className="mt-3 text-[13px] leading-relaxed text-graphite">
                  <Markdown text={sql.explanation} />
                </div>
              )}
            </Card>
          )}

          {sql.flowchart_mermaid && (
            <Card>
              <div className="mb-3 flex items-center gap-1.5">
                <Workflow size={14} className="text-slate" aria-hidden="true" />
                <h3 className="text-[13px] font-semibold text-ink">How it executes</h3>
              </div>
              <Mermaid chart={sql.flowchart_mermaid} />
            </Card>
          )}

          {result?.columns?.length > 0 && (
            <Card flush className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-silver px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Table2 size={14} className="text-slate" aria-hidden="true" />
                  <h3 className="text-[13px] font-semibold text-ink">Rows returned</h3>
                </div>
                <span className="tnum text-[11.5px] text-slate">
                  {formatInt(result.total_rows)} row{result.total_rows === 1 ? '' : 's'}
                  {result.total_rows > result.rows.length && ` · showing the first ${result.rows.length}`}
                </span>
              </div>

              <div className="max-h-[460px] overflow-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-mist">
                    <tr>
                      {result.columns.map((c) => (
                        <th
                          key={c}
                          className="whitespace-nowrap border-b border-silver px-3 py-2 text-left font-mono text-[11.5px] font-medium text-graphite"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-mist/60">
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="tnum whitespace-nowrap border-b border-silver-sub px-3 py-1.5 font-mono text-[11.5px] text-ink"
                          >
                            {cell === null || cell === undefined
                              ? <span className="text-slate/50">null</span>
                              : String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
