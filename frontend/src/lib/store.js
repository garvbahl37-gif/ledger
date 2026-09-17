import { create } from 'zustand'
import * as api from './api'
import { AGENTS, agentForStage, stageIndex } from './agents'

/**
 * The session id is kept in localStorage so a reload does not throw away a
 * finished analysis.
 *
 * Without this the store is memory-only: someone runs a 90-second analysis,
 * navigates to Ask, reloads, and every screen that depends on the report is
 * empty with no route back except running it again. Only the id is stored —
 * the report itself is re-fetched, so nothing goes stale.
 */
const SESSION_KEY = 'ledger.sessionId'

export function rememberSession(id) {
  try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY) }
  catch { /* private mode; the session simply will not survive a reload */ }
}

export function recallSession() {
  try { return localStorage.getItem(SESSION_KEY) } catch { return null }
}

const idleAgents = () =>
  Object.fromEntries(AGENTS.map((a) => [a.key, { status: 'IDLE', message: '', durationS: null }]))

/**
 * One store for the whole analysis session.
 *
 * Events arriving from the pipeline mutate agent status, the live log and the
 * hypothesis registry. The report is fetched once COMPLETE lands, because the
 * stream carries progress, not the finished artefact.
 */
export const useSession = create((set, get) => ({
  sessionId: null,
  stage: 'INIT',
  running: false,
  error: null,

  source: null,           // { kind: 'file' | 'sheet', name, size }
  agents: idleAgents(),
  log: [],                // [{ id, stage, message, at, agentKey }]
  hypotheses: [],         // streamed in by A2
  registryHash: null,
  frozen: false,

  report: null,           // full /report payload
  reportLoading: false,
  telemetry: null,

  activeClaim: null,      // hypothesis id the reader clicked through from
  expired: false,         // a remembered session the engine no longer has
  chat: [],
  chatPending: false,
  sql: null,
  sqlPending: false,

  abort: null,

  /* ── lifecycle ───────────────────────────────────────────────── */

  reset: () => set({
    sessionId: null, stage: 'INIT', running: false, error: null, source: null,
    agents: idleAgents(), log: [], hypotheses: [], registryHash: null, frozen: false,
    report: null, telemetry: null, activeClaim: null, chat: [], sql: null, abort: null,
    expired: false,
  }),

  ensureSession: async () => {
    const existing = get().sessionId
    if (existing) return existing
    return get().newSession()
  },

  /**
   * Mint a session for a run that is about to start.
   *
   * Every analysis gets its own, always. Reusing one looks harmless and is not:
   * the registry is sealed at the end of a run, and a sealed ledger refuses new
   * hypotheses while keeping the old ones, so a second table would be profiled
   * and then measured against the first table's questions. The engine rejects
   * that now as well — this side just never asks.
   */
  newSession: async () => {
    const { session_id } = await api.createSession()
    rememberSession(session_id)
    set({ sessionId: session_id })
    return session_id
  },

  pushLog: (entry) => set((s) => ({
    log: [...s.log, {
      id: `${Date.now()}-${s.log.length}`,
      at: new Date(),
      agentKey: agentForStage(entry.stage)?.key ?? null,
      ...entry,
    }],
  })),

  /** Fold one pipeline event into state. */
  applyEvent: (evt) => {
    const { stage, message } = evt
    get().pushLog({ stage, message })

    const agent = agentForStage(stage)
    const done = message?.startsWith('✅') || message?.startsWith('🎉')
    const warned = message?.startsWith('⚠️')

    set((s) => {
      const next = { stage: stage ?? s.stage }

      if (agent && s.agents[agent.key]) {
        // Mark every earlier pipeline agent done — the backend does not emit a
        // terminal event for an agent once the next one starts.
        const here = stageIndex(stage)
        const agents = { ...s.agents }
        if (here > 0) {
          for (let i = 0; i < here; i++) {
            const k = AGENTS[i].key
            if (agents[k].status === 'RUNNING') agents[k] = { ...agents[k], status: 'DONE' }
          }
        }
        agents[agent.key] = {
          ...agents[agent.key],
          status: done ? 'DONE' : warned ? 'WARN' : 'RUNNING',
          message,
        }
        next.agents = agents
      }

      if (evt.hypotheses) next.hypotheses = evt.hypotheses
      if (evt.registry_hash) { next.registryHash = evt.registry_hash; next.frozen = true }
      if (stage === 'ERROR') { next.error = evt.error || message; next.running = false }
      return next
    })

    if (stage === 'COMPLETE') {
      set((s) => ({
        running: false,
        agents: Object.fromEntries(
          Object.entries(s.agents).map(([k, v]) => [k, v.status === 'RUNNING' ? { ...v, status: 'DONE' } : v]),
        ),
      }))
      get().loadReport()
    }
  },

  /* ── running the pipeline ────────────────────────────────────── */

  start: async ({ file, sheetUrl, dataDict, hypotheses }) => {
    const controller = new AbortController()
    set({
      running: true, error: null, log: [], hypotheses: [], report: null,
      agents: idleAgents(), registryHash: null, frozen: false, abort: controller,
      sessionId: null, telemetry: null, activeClaim: null, chat: [], sql: null,
      expired: false, reportLoading: false,
      source: file
        ? { kind: 'file', name: file.name, size: file.size }
        : { kind: 'sheet', name: 'Connected sheet', size: null },
    })

    try {
      const id = await get().newSession()
      const onEvent = (evt) => get().applyEvent(evt)
      if (file) {
        await api.uploadAndStream(id, { file, dataDict, hypotheses, onEvent, signal: controller.signal })
      } else {
        await api.connectSheetAndStream(id, { url: sheetUrl, hypotheses, onEvent, signal: controller.signal })
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        set({ running: false })
        get().pushLog({ stage: 'ERROR', message: 'Analysis stopped.' })
        return
      }
      set({ running: false, error: err.message })
      get().pushLog({ stage: 'ERROR', message: err.message })
    }
  },

  cancel: () => {
    get().abort?.abort()
    set({ running: false, abort: null })
  },

  /* ── artefacts ───────────────────────────────────────────────── */

  /**
   * Attach to a session that already ran — from a ?session= link, so a finished
   * analysis can be handed to someone else. The backend keeps sessions for 24h;
   * after that the link resolves to nothing and says so.
   */
  resume: async (sessionId) => {
    set({ sessionId, reportLoading: true, error: null, expired: false })
    try {
      const report = await api.getReport(sessionId)
      const entries = report.ledger_entries ?? []
      set({
        report,
        reportLoading: false,
        stage: 'COMPLETE',
        registryHash: report.reproducibility_hash ?? null,
        frozen: entries.length > 0,
        hypotheses: entries.map((e) => ({ id: e.id, statement: e.statement })),
        source: report.dataset
          ? { kind: 'file', name: report.dataset.filename, size: report.dataset.size_bytes }
          : null,
        agents: Object.fromEntries(
          AGENTS.map((a) => [a.key, { status: 'DONE', message: '', durationS: report.agent_timings?.[a.key] ?? null }]),
        ),
      })
      rememberSession(sessionId)
      get().loadTelemetry()
      return true
    } catch (err) {
      // 404 and 400 both mean the engine no longer holds this session, which is
      // ordinary after a restart rather than an error worth alarming anyone
      // about. Forget it so the next load starts clean.
      const gone = err?.status === 404 || err?.status === 400
      rememberSession(null)
      set({
        reportLoading: false,
        sessionId: null,
        expired: gone,
        error: gone ? null : `That session could not be loaded: ${err.message}`,
      })
      return false
    }
  },

  loadReport: async () => {
    const id = get().sessionId
    if (!id) return
    set({ reportLoading: true })
    try {
      const report = await api.getReport(id)
      set({ report, reportLoading: false })
      get().loadTelemetry()
    } catch (err) {
      set({ reportLoading: false, error: err.message })
    }
  },

  loadTelemetry: async () => {
    const id = get().sessionId
    if (!id) return
    try {
      set({ telemetry: await api.getTelemetry(id) })
    } catch {
      /* telemetry is diagnostic — never block the report on it */
    }
  },

  setActiveClaim: (id) => set({ activeClaim: id }),

  askSql: async (query) => {
    const id = get().sessionId
    if (!id) return
    set({ sqlPending: true })
    try {
      set({ sql: await api.runSql(id, query), sqlPending: false })
    } catch (err) {
      set({ sql: { error: err.message }, sqlPending: false })
    }
  },

  ask: async (message) => {
    const id = get().sessionId
    if (!id) return
    set((s) => ({ chat: [...s.chat, { role: 'user', content: message }], chatPending: true }))
    try {
      const { reply } = await api.sendChat(id, message)
      set((s) => ({ chat: [...s.chat, { role: 'assistant', content: reply }], chatPending: false }))
    } catch (err) {
      set((s) => ({
        chat: [...s.chat, { role: 'assistant', content: `That didn't go through: ${err.message}`, failed: true }],
        chatPending: false,
      }))
    }
  },
}))

/* ── selectors ───────────────────────────────────────────────────
 *
 * These must return a STABLE reference for unchanged state. zustand compares
 * the selector's result by identity, so a selector ending in `.filter(...)` or
 * `?? []` hands back a fresh array every render, the snapshot never matches,
 * and React re-renders until it hits its update-depth limit. Hence the shared
 * EMPTY constant, and hence the fact that nothing here derives a new array —
 * filtering belongs in a useMemo inside the component.
 */

const EMPTY = Object.freeze([])

export const selectEntries   = (s) => s.report?.ledger_entries ?? EMPTY
export const selectHasReport = (s) => Boolean(s.report)

/** Count without allocating — safe to call as a selector. */
export const countByStatus = (status) => (s) => {
  const entries = s.report?.ledger_entries
  if (!entries) return 0
  let n = 0
  for (const e of entries) if (e.status === status) n += 1
  return n
}

export const selectSupportedCount = countByStatus('SUPPORTED')
export const selectRejectedCount  = countByStatus('REJECTED')
export const selectErroredCount   = countByStatus('ERROR')
