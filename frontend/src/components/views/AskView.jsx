import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Send, Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/store'
import Markdown from '../Markdown'
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
