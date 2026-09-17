import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { MessageSquare, Send, Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/store'
import { sanitizeHtml } from '../../lib/report'
import Button from '../ui/Button'
import { Card } from '../ui/Card'
import EmptyState from '../ui/EmptyState'

/**
 * Grounded follow-up.
 *
 * The backend answers only from licensed text, so this cannot invent a finding
 * — if the answer is not in the ledger it says so. The prompts below are
 * deliberately the ones a sceptical reader would ask, including "why did this
 * one fail", because a system that only explains its successes is not auditable.
 */

const STARTERS = [
  'Which findings are strongest, and why?',
  'Why was H01 not supported?',
  'What did the correction change?',
  'What should I be cautious about here?',
]

marked.setOptions({ gfm: true, breaks: true })

/**
 * Render the answer as real markdown.
 *
 * The model replies with headings, bullet lists and GitHub-flavoured tables —
 * comparing effect sizes across findings is naturally tabular, so it reaches
 * for a table often. A previous version only understood **bold**, which left
 * every table on screen as rows of raw pipes.
 *
 * Parsed output goes through the same sanitiser the report uses, so model
 * output still cannot introduce script or non-http links.
 */
function Markdown({ text }) {
  const html = useMemo(() => {
    try {
      const host = document.createElement('div')
      host.appendChild(sanitizeHtml(marked.parse(String(text ?? ''))))
      return host.innerHTML
    } catch {
      return null
    }
  }, [text])

  // If parsing fails the words still have to reach the reader.
  if (html === null) return <div className="whitespace-pre-wrap">{text}</div>

  return (
    <div
      className={cn(
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[&_p]:mb-2.5',
        '[&_strong]:font-semibold [&_strong]:text-ink',
        '[&_h1]:mb-1.5 [&_h1]:mt-4 [&_h1]:text-[14.5px] [&_h1]:font-semibold [&_h1]:text-ink',
        '[&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-ink',
        '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_h3]:text-ink',
        '[&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-4.5 [&_ol]:mb-2.5 [&_ol]:list-decimal [&_ol]:pl-4.5',
        '[&_li]:mb-1 [&_li]:leading-relaxed',
        '[&_code]:rounded [&_code]:bg-fog [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[12px]',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-silver [&_blockquote]:pl-2.5 [&_blockquote]:text-slate',
        // Tables are the reason this component exists; give them room and let a
        // wide one scroll rather than burst the bubble.
        '[&_table]:my-2.5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]',
        '[&_thead]:border-b [&_thead]:border-silver',
        '[&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink',
        '[&_td]:border-b [&_td]:border-silver-sub [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
        '[&_td]:tabular-nums',
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function AskView({ onNavigate }) {
  const report  = useSession((s) => s.report)
  const chat    = useSession((s) => s.chat)
  const pending = useSession((s) => s.chatPending)
  const ask     = useSession((s) => s.ask)
  const [draft, setDraft] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat, pending])

  if (!report) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Nothing to ask about yet"
        body="Once an analysis finishes you can ask follow-up questions. Answers come from the ledger only — if a finding isn't in there, you'll be told so."
        action={<Button variant="primary" onClick={() => onNavigate?.('setup')}>Load a table</Button>}
      />
    )
  }

  function send(text) {
    const msg = (text ?? draft).trim()
    if (!msg || pending) return
    setDraft('')
    ask(msg)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 sm:px-6">
      <header className="py-6">
        <h2 className="text-[22px] font-bold tracking-tight text-ink">Ask about the analysis</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate">
          Answers are drawn from the ledger. Ask something it does not cover and you will be told
          that, rather than given a plausible guess.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {chat.length === 0 ? (
          <Card className="bg-mist">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-brand" aria-hidden="true" />
              <h3 className="text-[12.5px] font-semibold text-ink">Try one of these</h3>
            </div>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg bg-paper px-3 py-2.5 text-left text-[12.5px] leading-snug text-graphite ring-1 ring-silver transition-colors hover:bg-brand-tint hover:text-brand-text hover:ring-brand-edge"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <ol className="space-y-4">
            {chat.map((m, i) => (
              <li
                key={i}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div className={cn(
                  'min-w-0 rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed'
                    + (m.role === 'user' ? ' max-w-[85%]' : ' max-w-[94%] overflow-x-auto'),
                  m.role === 'user'
                    ? 'bg-brand-text text-white'
                    : m.failed
                      ? 'bg-error-tint text-error-text ring-1 ring-error-edge'
                      : 'bg-paper text-graphite ring-1 ring-silver',
                )}>
                  {m.role === 'user'
                    ? <div className="whitespace-pre-wrap">{m.content}</div>
                    : <Markdown text={m.content} />}
                </div>
              </li>
            ))}
            {pending && (
              <li className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-paper px-3.5 py-3 ring-1 ring-silver">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-slate/50"
                      style={{ animation: `ledger-pulse 1.2s ease-in-out ${i * 0.15}s infinite` }}
                    />
                  ))}
                </div>
              </li>
            )}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-silver bg-pearl py-4">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder="Ask about a hypothesis, a test or a caveat…"
            aria-label="Your question"
            className="min-w-0 flex-1 rounded-lg border border-silver bg-paper px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors placeholder:text-slate/60 focus:border-brand"
          />
          <Button variant="primary" onClick={() => send()} disabled={!draft.trim() || pending}>
            <Send size={14} /> Send
          </Button>
        </div>
      </div>
    </div>
  )
}
