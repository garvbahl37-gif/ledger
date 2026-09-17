import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession, recallSession } from './lib/store'
import { health } from './lib/api'
import BootSequence from './components/BootSequence'
import LandingContent from './components/LandingContent'
import DashboardLayout from './components/DashboardLayout'
import CommandPalette from './components/CommandPalette'
import SetupView from './components/views/SetupView'
import LivePipelineView from './components/views/LivePipelineView'
import DashboardView from './components/views/DashboardView'
import ExploreView from './components/views/ExploreView'
import AdversaryView from './components/views/AdversaryView'
import SqlLabView from './components/views/SqlLabView'
import AskView from './components/views/AskView'
import TelemetryView from './components/views/TelemetryView'

const APP_VIEWS = new Set(['setup', 'pipeline', 'report', 'explore', 'adversary', 'sql', 'ask', 'telemetry'])

/**
 * Routing is done on the hash rather than with a router library.
 *
 * Sessions live in memory on the backend, so a deep link to /report after a
 * reload could only ever render an empty page. The hash gives the back button
 * something to do within a session without promising durability it cannot keep.
 */
function viewFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return APP_VIEWS.has(raw) ? raw : null
}

export default function App() {
  const [view, setView] = useState(viewFromHash)
  const [palette, setPalette] = useState(false)
  // The boot sequence plays once per tab. A reload during a working session
  // should not make someone sit through it again.
  const [booted, setBooted] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('ledger.booted') === '1',
  )

  /**
   * Attach to an existing analysis on load.
   *
   * Two sources, in order: a ?session= link, which is how a result gets shared,
   * and otherwise the id left in localStorage by a previous visit. The second
   * is what makes a reload survivable — without it every screen that needs the
   * report comes back empty and the only route forward is running the analysis
   * again.
   */
  /**
   * Wake the engine as soon as the page opens.
   *
   * The engine sleeps after a quarter-hour idle and takes the better part of a
   * minute to come back. Measured end to end, answering a question costs about
   * three seconds; nearly all the wait people actually experience is that cold
   * start landing on their first click. Pinging health on load moves it to a
   * moment when nobody is waiting. Failure is ignored on purpose — this is a
   * warm-up, and BackendStatus already reports reachability properly.
   */
  useEffect(() => { health().catch(() => {}) }, [])

  const resume = useSession((s) => s.resume)
  const resumedRef = useRef(false)
  useEffect(() => {
    if (resumedRef.current) return
    const shared = new URLSearchParams(window.location.search).get('session')
    const id = shared || recallSession()
    if (!id) return
    resumedRef.current = true
    resume(id).then((ok) => {
      // Only steer someone to the report when they did not ask for a screen
      // themselves; a ?session= link ending in #/ask means they want Ask.
      if (ok && !viewFromHash()) navigateRef.current?.('report')
    })
  }, [resume])

  const finishBoot = useCallback(() => {
    try { sessionStorage.setItem('ledger.booted', '1') } catch { /* private mode */ }
    setBooted(true)
  }, [])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigateRef = useRef(null)

  const navigate = useCallback((next) => {
    setView(next)
    window.location.hash = next ? `/${next}` : ''
    window.scrollTo({ top: 0 })
  }, [])
  navigateRef.current = navigate

  const exit = useCallback(() => {
    setView(null)
    window.location.hash = ''
  }, [])

  if (!booted) return <BootSequence onDone={finishBoot} />

  if (!view) {
    return <LandingContent onEnter={() => navigate('setup')} />
  }

  return (
    <>
      <DashboardLayout
        view={view}
        onNavigate={navigate}
        onExit={exit}
        onOpenPalette={() => setPalette(true)}
      >
        {view === 'setup'     && <SetupView onStarted={() => navigate('pipeline')} />}
        {view === 'pipeline'  && <LivePipelineView onDone={() => navigate('report')} />}
        {view === 'report'    && <DashboardView onNavigate={navigate} />}
        {view === 'explore'   && <ExploreView onNavigate={navigate} />}
        {view === 'adversary' && <AdversaryView onNavigate={navigate} />}
        {view === 'sql'       && <SqlLabView onNavigate={navigate} />}
        {view === 'ask'       && <AskView onNavigate={navigate} />}
        {view === 'telemetry' && <TelemetryView />}
      </DashboardLayout>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        onNavigate={navigate}
      />
    </>
  )
}
