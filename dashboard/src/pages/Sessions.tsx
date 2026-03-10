import { useState, useEffect, useCallback } from 'react'
import { Users, RefreshCw, Trash2, Eye, Shield, AlertTriangle, ChevronRight, Search, Loader2 } from 'lucide-react'
import { useQuery } from '@powersync/react'

interface SessionStats {
  session_id: string
  message_count: number
  entity_count: number
  coreference_count: number
  sensitivity: 'normal' | 'elevated'
  escalation_keywords: string[]
  categories: Record<string, number>
  created_at: string
  last_activity: string
}

export function Sessions() {
  const [sessions, setSessions] = useState<SessionStats[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { data: proxyInstances } = useQuery<{ listen_addr: string }>(
    `SELECT listen_addr FROM instances WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT 1`
  )
  const proxyUrl = proxyInstances?.[0]?.listen_addr
    ? `http://${proxyInstances[0].listen_addr}`
    : null

  const fetchSessions = useCallback(async () => {
    if (!proxyUrl) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${proxyUrl}/sessions`)
      if (!res.ok) throw new Error(await res.text())
      const data: SessionStats[] = await res.json()
      setSessions(data)
    } catch (err) {
      setError(`${err}`)
    } finally {
      setLoading(false)
    }
  }, [proxyUrl])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [fetchSessions])

  async function inspectSession(sessionId: string) {
    if (!proxyUrl) return
    try {
      const res = await fetch(`${proxyUrl}/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Not found')
      const data: SessionStats = await res.json()
      setSelectedSession(data)
    } catch {
      setSelectedSession(null)
    }
  }

  async function flushSession(sessionId: string) {
    if (!proxyUrl) return
    await fetch(`${proxyUrl}/sessions/${sessionId}`, { method: 'DELETE' })
    if (selectedSession?.session_id === sessionId) setSelectedSession(null)
    fetchSessions()
  }

  async function flushAll() {
    if (!proxyUrl) return
    await fetch(`${proxyUrl}/sessions`, { method: 'DELETE' })
    setSessions([])
    setSelectedSession(null)
  }

  if (!proxyUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <Users className="w-10 h-10 text-[var(--primary)] mb-4 opacity-60" />
        <h2 className="text-lg font-semibold mb-1">Sessions</h2>
        <p className="text-xs text-[var(--muted-foreground)] max-w-sm">
          Context-aware pseudonymization sessions. Requires a running CloakPipe proxy instance.
        </p>
        <p className="text-[10px] text-[var(--warning)] mt-3">
          No proxy instance detected — start one with <span className="font-mono">cloakpipe start</span>
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Session list */}
      <div className="w-72 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">Active Sessions</span>
              {loading && <Loader2 className="w-3 h-3 animate-spin text-[var(--primary)]" />}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchSessions}
                className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                title="Refresh"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              {sessions.length > 0 && (
                <button
                  onClick={flushAll}
                  className="p-1 text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                  title="Flush all sessions"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {error && (
            <div className="text-[11px] text-[var(--destructive)] px-2 py-1">{error}</div>
          )}

          {sessions.map(sess => (
            <button
              key={sess.session_id}
              onClick={() => inspectSession(sess.session_id)}
              className={`w-full text-left px-3 py-2 transition-colors group ${
                selectedSession?.session_id === sess.session_id
                  ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-mono truncate">{sess.session_id.slice(0, 12)}...</span>
                <div className="flex items-center gap-1">
                  {sess.sensitivity === 'elevated' && (
                    <AlertTriangle className="w-3 h-3 text-[var(--warning)]" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); flushSession(sess.session_id) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--destructive)]"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                <span>{sess.message_count} msgs</span>
                <span className="text-[var(--border)]">|</span>
                <span>{sess.entity_count} entities</span>
                {sess.coreference_count > 0 && (
                  <>
                    <span className="text-[var(--border)]">|</span>
                    <span className="text-[var(--primary)]">{sess.coreference_count} corefs</span>
                  </>
                )}
              </div>
            </button>
          ))}

          {sessions.length === 0 && !loading && !error && (
            <div className="text-center py-8 text-[var(--muted-foreground)]">
              <Users className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p className="text-[11px]">No active sessions</p>
              <p className="text-[10px] mt-1">
                Sessions are created when requests include<br />
                <span className="font-mono">x-session-id</span> header
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Session detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSession ? (
          <div className="p-5 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold font-mono">{selectedSession.session_id}</h1>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted-foreground)]">
                  <span>Created {new Date(selectedSession.created_at).toLocaleString()}</span>
                  <span className="text-[var(--border)]">|</span>
                  <span>Last active {new Date(selectedSession.last_activity).toLocaleString()}</span>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium ${
                selectedSession.sensitivity === 'elevated'
                  ? 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30'
                  : 'bg-[var(--secondary)] text-[var(--muted-foreground)]'
              }`}>
                {selectedSession.sensitivity === 'elevated' && <AlertTriangle className="w-3 h-3" />}
                {selectedSession.sensitivity === 'elevated' ? 'ELEVATED' : 'NORMAL'}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Messages', value: selectedSession.message_count, icon: Search },
                { label: 'Entities Tracked', value: selectedSession.entity_count, icon: Eye },
                { label: 'Coreferences', value: selectedSession.coreference_count, icon: ChevronRight },
                { label: 'Sensitivity', value: selectedSession.sensitivity, icon: Shield },
              ].map(stat => (
                <div key={stat.label} className="bg-[var(--card)] border border-[var(--border)] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                    <stat.icon className="w-3 h-3" />
                    {stat.label}
                  </div>
                  <div className="text-xl font-semibold font-mono">
                    {typeof stat.value === 'number' ? stat.value : stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Escalation keywords */}
            {selectedSession.escalation_keywords.length > 0 && (
              <div className="mb-5 bg-[var(--warning)]/5 border border-[var(--warning)]/20 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--warning)] mb-2">
                  <AlertTriangle className="w-3 h-3" />
                  Escalation Keywords Detected
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSession.escalation_keywords.map(kw => (
                    <span key={kw} className="px-2 py-0.5 bg-[var(--warning)]/10 text-[var(--warning)] text-[11px] font-mono">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Entity categories */}
            {Object.keys(selectedSession.categories).length > 0 && (
              <div className="mb-5">
                <h3 className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Entity Categories</h3>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(selectedSession.categories).map(([cat, count]) => (
                    <div key={cat} className="flex items-center justify-between px-3 py-2 bg-[var(--card)] border border-[var(--border)]">
                      <span className="text-[12px]">{cat}</span>
                      <span className="text-[12px] font-mono text-[var(--primary)]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-[var(--card)] border border-[var(--border)] p-4">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Context-Aware Pipeline</h3>
              <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
                <span className="px-2 py-0.5 bg-[var(--secondary)]">Detect</span>
                <ChevronRight className="w-3 h-3" />
                <span className="px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)]">Resolve Corefs</span>
                <ChevronRight className="w-3 h-3" />
                <span className="px-2 py-0.5 bg-[var(--secondary)]">Pseudonymize</span>
                <ChevronRight className="w-3 h-3" />
                <span className="px-2 py-0.5 bg-[var(--primary)]/10 text-[var(--primary)]">Track Session</span>
                <ChevronRight className="w-3 h-3" />
                <span className={`px-2 py-0.5 ${
                  selectedSession.sensitivity === 'elevated'
                    ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
                    : 'bg-[var(--secondary)]'
                }`}>
                  {selectedSession.sensitivity === 'elevated' ? 'Elevated Scan' : 'Normal Scan'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Users className="w-10 h-10 text-[var(--primary)] mb-4 opacity-60" />
            <h2 className="text-lg font-semibold mb-1">Session Context</h2>
            <p className="text-xs text-[var(--muted-foreground)] max-w-sm mb-4">
              Context-aware pseudonymization tracks entities across conversation messages.
              Select a session to inspect its entity map, coreferences, and sensitivity level.
            </p>
            <div className="text-[10px] text-[var(--muted-foreground)] space-y-1">
              <p>Pronouns ("He", "She") resolve to tracked PERSON entities</p>
              <p>Abbreviations ("TM") resolve to tracked ORG entities</p>
              <p>Decision keywords trigger sensitivity escalation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
