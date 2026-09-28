import { useMemo } from 'react'
import { marked } from 'marked'
import { cn } from '../lib/cn'
import { sanitizeHtml } from '../lib/report'

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
export default function Markdown({ text }) {
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
