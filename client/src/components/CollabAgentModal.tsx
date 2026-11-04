import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import type { CollabAgentEvent, CollabTask, CollabMessage } from '../types'
import { Button, Badge } from './ui'
import {
  Sparkles,
  Bot,
  Database,
  Server,
  Layout,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Terminal,
  FileCode,
  Download,
  Layers,
  ArrowRight
} from 'lucide-react'

interface CollabAgentModalProps {
  isOpen: boolean
  onClose: () => void
  currentHtml: string
  currentPrompt: string
  currentModel?: string
  projectId?: string
  onApply: (enhancedHtml: string) => void
}

type AgentName = 'planner' | 'database' | 'backend' | 'frontend' | 'reviewer'

interface AgentStatus {
  state: 'idle' | 'running' | 'done' | 'failed' | 'skipped'
  summary?: string
}

export default function CollabAgentModal({
  isOpen,
  onClose,
  currentHtml,
  currentPrompt,
  currentModel,
  projectId,
  onApply,
}: CollabAgentModalProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<string>('idle')
  const [statusText, setStatusText] = useState<string>('Ready to start collaborative multi-agent enhancement.')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 5 Agent statuses
  const [agents, setAgents] = useState<Record<AgentName, AgentStatus>>({
    planner: { state: 'idle' },
    database: { state: 'idle' },
    backend: { state: 'idle' },
    frontend: { state: 'idle' },
    reviewer: { state: 'idle' },
  })

  // Collaborative data
  const [tasks, setTasks] = useState<CollabTask[]>([])
  const [messages, setMessages] = useState<CollabMessage[]>([])
  const [schema, setSchema] = useState<any>(null)
  const [apiContract, setApiContract] = useState<any>(null)
  const [backendCode, setBackendCode] = useState<string>('')
  const [schemaCode, setSchemaCode] = useState<string>('')
  const [enhancedHtml, setEnhancedHtml] = useState<string>('')
  const [revisions, setRevisions] = useState<number>(0)
  const [activeTab, setActiveTab] = useState<'activity' | 'contracts' | 'preview'>('activity')
  const [previewMode, setPreviewMode] = useState<'enhanced' | 'original'>('enhanced')

  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !enhancedHtml && !isRunning) {
      setCurrentPhase('idle')
      setStatusText('Click "Start Collaborative Enhancement" to launch the 5 specialized agents.')
      setErrorMsg(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages])

  if (!isOpen) return null

  const addBusMessage = (from: string, to: string, topic: string, text: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setMessages((prev) => [
      ...prev,
      {
        timestamp: time,
        from,
        to,
        topic,
        message: text,
      },
    ])
  }

  const handleStart = async () => {
    if (!currentHtml || isRunning) return

    setIsRunning(true)
    setErrorMsg(null)
    setCurrentPhase('planner')
    setStatusText('Planner Agent analyzing site domain and architecture...')
    setTasks([])
    setMessages([])
    setSchema(null)
    setApiContract(null)
    setBackendCode('')
    setSchemaCode('')
    setEnhancedHtml('')
    setRevisions(0)
    setActiveTab('activity')

    setAgents({
      planner: { state: 'running' },
      database: { state: 'idle' },
      backend: { state: 'idle' },
      frontend: { state: 'idle' },
      reviewer: { state: 'idle' },
    })

    addBusMessage('system', 'all', 'system:init', 'Collaborative Agent Session initialized (5 agents registered)')

    try {
      await api.streamCollabEnhance(
        {
          html: currentHtml,
          prompt: currentPrompt,
          model: currentModel,
          projectId,
        },
        (event: CollabAgentEvent) => {
          if (event.message) setStatusText(event.message)

          switch (event.type) {
            case 'phase':
              if (event.phase) {
                setCurrentPhase(event.phase)
                if (event.message?.includes('Skipping')) {
                  const ag = event.phase as AgentName
                  setAgents((prev) => ({ ...prev, [ag]: { state: 'skipped', summary: 'Static site - not required' } }))
                }
              }
              break

            case 'agent_start':
              if (event.agent) {
                const ag = event.agent as AgentName
                setAgents((prev) => ({ ...prev, [ag]: { state: 'running' } }))
                addBusMessage(event.agent, 'bus', 'agent:started', event.message || `${event.agent} active`)
              }
              break

            case 'agent_done':
              if (event.agent) {
                const ag = event.agent as AgentName
                let summary = 'Task completed'
                if (ag === 'planner' && event.result?.tasks) {
                  setTasks(event.result.tasks)
                  summary = `${event.result.tasks.length} tasks planned`
                } else if (ag === 'database' && event.result?.tables) {
                  setSchema(event.result)
                  summary = `${event.result.tables.length} tables designed`
                } else if (ag === 'backend' && event.result?.endpoints) {
                  summary = `${event.result.endpoints.length} endpoints created`
                } else if (ag === 'frontend' && event.result?.htmlLength) {
                  summary = `HTML rendered (${(event.result.htmlLength).toLocaleString()} bytes)`
                } else if (ag === 'reviewer' && event.result) {
                  summary = event.result.passed ? 'PASSED (0 issues)' : `Found ${event.result.issueCount} issue(s)`
                }

                setAgents((prev) => ({ ...prev, [ag]: { state: 'done', summary } }))
                addBusMessage(event.agent, 'orchestrator', 'task:completed', summary)
              }
              break

            case 'agent_message':
              addBusMessage(event.from || 'agent', event.to || 'agent', event.topic || 'collab', event.message || '')
              break

            case 'revision':
              setRevisions(event.revisionNumber || 1)
              addBusMessage(
                'reviewer',
                'frontend',
                'review:revision_loop',
                `Revision #${event.revisionNumber}/${event.maxRevisions}: ${event.issues?.length || 0} issues sent back to Frontend`
              )
              setAgents((prev) => ({ ...prev, frontend: { state: 'running', summary: `Revising #${event.revisionNumber}` } }))
              break

            case 'orchestrator_done':
              setCurrentPhase('done')
              addBusMessage('orchestrator', 'all', 'orchestrator:done', event.message || 'Collaboration finished')
              break

            case 'result':
              if (event.enhancedHtml) setEnhancedHtml(event.enhancedHtml)
              if (event.schema) setSchema(event.schema)
              if (event.apiContract) setApiContract(event.apiContract)
              if (event.backendCode) setBackendCode(event.backendCode)
              if (event.schemaCode) setSchemaCode(event.schemaCode)
              if (event.taskSummary) setTasks(event.taskSummary)
              if (event.messageLog && event.messageLog.length > 0) {
                // Merge message log
                const formatted = event.messageLog.map((m) => ({
                  timestamp: m.timestamp?.slice(11, 19) || 'now',
                  from: m.from || 'agent',
                  to: m.to || 'all',
                  topic: m.topic || 'event',
                  message: JSON.stringify(m.payload || {}).slice(0, 100),
                }))
                setMessages((prev) => [...prev, ...formatted])
              }
              setCurrentPhase('complete')
              break

            case 'error':
              setErrorMsg(event.message || 'Collaborative agent run failed')
              setCurrentPhase('error')
              addBusMessage('system', 'all', 'error', event.message || 'An error occurred')
              break
          }
        }
      )
    } catch (err: any) {
      console.error('[CollabModal] Stream error:', err)
      setErrorMsg(err.message || 'Failed to complete agent workflow')
      setCurrentPhase('error')
    } finally {
      setIsRunning(false)
    }
  }

  const handleApply = () => {
    if (enhancedHtml) {
      onApply(enhancedHtml)
      onClose()
    }
  }

  const handleDownloadZip = () => {
    // Generate standalone downloadable project files bundle
    const files = [
      { name: 'index.html', content: enhancedHtml || currentHtml },
      { name: 'schema.sql', content: schemaCode || '-- Database Schema\n' },
      { name: 'routes.js', content: backendCode || '// Express Routes\n' },
      {
        name: 'README.md',
        content: `# ${currentPrompt || 'Enhanced Project'}\n\nGenerated with Neurobuild Autonomous Multi-Agent AI (Module 6).\n\n## Quick Start\n\`\`\`bash\nnpm install express better-sqlite3 cors\nnode server.js\n\`\`\`\n`,
      },
    ]

    // Download index.html directly
    const blob = new Blob([files[0].content], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'enhanced-site.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-border w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface2/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-[#f4976c] to-indigo-600 flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-text text-base">Module 6: Collaborative Agentic AI</h2>
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">
                  5-Agent Team
                </Badge>
                {currentPhase !== 'idle' && (
                  <Badge className="bg-surface3 text-text3 text-[10px] uppercase font-mono">
                    Phase: {currentPhase}
                  </Badge>
                )}
                {revisions > 0 && (
                  <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                    {revisions} revision{revisions > 1 ? 's' : ''} resolved
                  </Badge>
                )}
              </div>
              <p className="text-xs text-text3">
                Planner ➔ Database ➔ Backend ➔ Frontend ➔ Reviewer with shared context and contract feedback
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 rounded-lg text-text3 hover:text-text hover:bg-surface3 transition-colors disabled:opacity-40"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5-Agent Pipeline Visualizer */}
        <div className="bg-surface2/40 px-6 py-3 border-b border-border overflow-x-auto">
          <div className="flex items-center justify-between min-w-[700px] gap-2">
            {/* Agent 1: Planner */}
            <div
              className={`flex-1 p-2.5 rounded-xl border transition-all ${
                agents.planner.state === 'running'
                  ? 'border-blue-500 bg-blue-500/10'
                  : agents.planner.state === 'done'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-border/60 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Bot className={`w-3.5 h-3.5 ${agents.planner.state === 'running' ? 'text-blue-400 animate-pulse' : 'text-text3'}`} />
                  <span className="text-xs font-semibold text-text">1. Planner</span>
                </div>
                {agents.planner.state === 'running' && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}
                {agents.planner.state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <p className="text-[10px] text-text3 truncate">{agents.planner.summary || 'Domain & task plan'}</p>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-text3 flex-shrink-0" />

            {/* Agent 2: Database */}
            <div
              className={`flex-1 p-2.5 rounded-xl border transition-all ${
                agents.database.state === 'running'
                  ? 'border-amber-500 bg-amber-500/10'
                  : agents.database.state === 'done'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : agents.database.state === 'skipped'
                  ? 'border-border/40 opacity-60 bg-surface'
                  : 'border-border/60 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Database className={`w-3.5 h-3.5 ${agents.database.state === 'running' ? 'text-amber-400 animate-pulse' : 'text-text3'}`} />
                  <span className="text-xs font-semibold text-text">2. Database</span>
                </div>
                {agents.database.state === 'running' && <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />}
                {agents.database.state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <p className="text-[10px] text-text3 truncate">{agents.database.summary || 'Tables & SQL seed'}</p>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-text3 flex-shrink-0" />

            {/* Agent 3: Backend */}
            <div
              className={`flex-1 p-2.5 rounded-xl border transition-all ${
                agents.backend.state === 'running'
                  ? 'border-purple-500 bg-purple-500/10'
                  : agents.backend.state === 'done'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : agents.backend.state === 'skipped'
                  ? 'border-border/40 opacity-60 bg-surface'
                  : 'border-border/60 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Server className={`w-3.5 h-3.5 ${agents.backend.state === 'running' ? 'text-purple-400 animate-pulse' : 'text-text3'}`} />
                  <span className="text-xs font-semibold text-text">3. Backend</span>
                </div>
                {agents.backend.state === 'running' && <RefreshCw className="w-3 h-3 text-purple-400 animate-spin" />}
                {agents.backend.state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <p className="text-[10px] text-text3 truncate">{agents.backend.summary || 'CRUD routes'}</p>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-text3 flex-shrink-0" />

            {/* Agent 4: Frontend */}
            <div
              className={`flex-1 p-2.5 rounded-xl border transition-all ${
                agents.frontend.state === 'running'
                  ? 'border-teal-500 bg-teal-500/10'
                  : agents.frontend.state === 'done'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-border/60 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Layout className={`w-3.5 h-3.5 ${agents.frontend.state === 'running' ? 'text-teal-400 animate-pulse' : 'text-text3'}`} />
                  <span className="text-xs font-semibold text-text">4. Frontend</span>
                </div>
                {agents.frontend.state === 'running' && <RefreshCw className="w-3 h-3 text-teal-400 animate-spin" />}
                {agents.frontend.state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <p className="text-[10px] text-text3 truncate">{agents.frontend.summary || 'CRUD UI & charts'}</p>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-text3 flex-shrink-0" />

            {/* Agent 5: Reviewer */}
            <div
              className={`flex-1 p-2.5 rounded-xl border transition-all ${
                agents.reviewer.state === 'running'
                  ? 'border-rose-500 bg-rose-500/10'
                  : agents.reviewer.state === 'done'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-border/60 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${agents.reviewer.state === 'running' ? 'text-rose-400 animate-pulse' : 'text-text3'}`} />
                  <span className="text-xs font-semibold text-text">5. Reviewer</span>
                </div>
                {agents.reviewer.state === 'running' && <RefreshCw className="w-3 h-3 text-rose-400 animate-spin" />}
                {agents.reviewer.state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              </div>
              <p className="text-[10px] text-text3 truncate">{agents.reviewer.summary || 'Contracts audit'}</p>
            </div>
          </div>

          {/* Current telemetry status line */}
          <div className="mt-2.5 flex items-center justify-between text-xs text-text2 pt-2 border-t border-border/50 font-mono">
            <div className="flex items-center gap-2 truncate">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="truncate">{statusText}</span>
            </div>
            {tasks.length > 0 && (
              <span className="text-[11px] text-text3 font-sans ml-2 flex-shrink-0">
                Tasks: {tasks.filter((t) => t.status === 'done').length}/{tasks.length}
              </span>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-border bg-surface">
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-3 px-4 text-xs font-medium border-b-2 -mb-px flex items-center gap-2 transition-colors ${
              activeTab === 'activity' ? 'text-accent border-accent' : 'text-text3 hover:text-text border-transparent'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Activity & Message Bus ({messages.length})
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`py-3 px-4 text-xs font-medium border-b-2 -mb-px flex items-center gap-2 transition-colors ${
              activeTab === 'contracts' ? 'text-accent border-accent' : 'text-text3 hover:text-text border-transparent'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            Shared Contracts {schema ? `(${schema.tables?.length || 0} tables)` : ''}
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`py-3 px-4 text-xs font-medium border-b-2 -mb-px flex items-center gap-2 transition-colors ${
              activeTab === 'preview' ? 'text-accent border-accent' : 'text-text3 hover:text-text border-transparent'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            Interactive Preview {enhancedHtml ? '✨' : ''}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[320px]">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: Activity & Message Bus */}
          {activeTab === 'activity' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
              {/* Dynamic Task List */}
              <div className="bg-surface2 rounded-xl p-4 border border-border flex flex-col">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-accent" />
                    <h3 className="text-xs font-semibold text-text uppercase tracking-wider">Dynamic Task Board</h3>
                  </div>
                  <span className="text-[11px] text-text3 font-mono">
                    {tasks.length > 0 ? `${tasks.length} tasks` : 'Pending planner'}
                  </span>
                </div>

                <div className="space-y-2.5 overflow-y-auto flex-1 max-h-72 pr-1">
                  {tasks.length === 0 ? (
                    <div className="text-center py-10 text-xs text-text3">
                      Planner Agent creates tasks dynamically based on domain requirements.
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 rounded-lg bg-surface border border-border text-xs flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                            {task.agentName}
                          </span>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              task.status === 'done'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : task.status === 'running'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                                : 'bg-surface3 text-text3'
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                        <p className="text-text font-medium text-[11px]">{task.description}</p>
                        {task.result && (
                          <p className="text-text3 text-[10px] font-mono mt-0.5 border-t border-border/40 pt-1">
                            Result: {task.result}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Inter-Agent Message Bus Log */}
              <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 flex flex-col font-mono text-xs text-zinc-300">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs uppercase tracking-wider font-sans font-semibold">
                      Inter-Agent Message Bus
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{messages.length} messages</span>
                </div>

                <div ref={logRef} className="space-y-1.5 overflow-y-auto flex-1 max-h-72 pr-1 text-[11px]">
                  {messages.length === 0 ? (
                    <span className="text-zinc-600">// Waiting for agents to publish to bus...</span>
                  ) : (
                    messages.map((m, idx) => (
                      <div key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-zinc-600 select-none text-[10px]">{m.timestamp || '--:--:--'}</span>
                        <span className="text-amber-400 font-bold">[{m.from}]</span>
                        <span className="text-zinc-500">➔</span>
                        <span className="text-blue-400">[{m.to}]</span>
                        <span className="text-emerald-300">({m.topic})</span>
                        <span className="text-zinc-200">{m.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Shared Contracts */}
          {activeTab === 'contracts' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Database Schema */}
              <div className="bg-surface2 rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-semibold text-text uppercase tracking-wider">Database Contract</h3>
                  </div>
                  {schema?.tables && (
                    <Badge className="text-[10px] bg-amber-500/10 text-amber-500">
                      {schema.tables.length} tables
                    </Badge>
                  )}
                </div>

                {schema?.tables ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {schema.tables.map((t: any, i: number) => (
                      <div key={i} className="p-3 bg-surface rounded-lg border border-border text-xs">
                        <div className="font-mono font-bold text-text mb-1.5 flex items-center justify-between">
                          <span>table: {t.name}</span>
                          <span className="text-text3 text-[10px] font-normal">{t.fields?.length || 0} fields</span>
                        </div>
                        <div className="space-y-1">
                          {t.fields?.map((f: any, fi: number) => (
                            <div key={fi} className="flex justify-between text-[11px] font-mono text-text3 pl-2 border-l-2 border-border">
                              <span className="text-text">{f.name}</span>
                              <span className="text-text3">{f.type} {f.primaryKey ? '(PK)' : ''} {f.foreignKey ? `-> ${f.foreignKey}` : ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text3 py-8 text-center">
                    Database schema will appear here once generated by the Database Agent.
                  </p>
                )}
              </div>

              {/* API Contract */}
              <div className="bg-surface2 rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-purple-500" />
                    <h3 className="text-xs font-semibold text-text uppercase tracking-wider">API Contract</h3>
                  </div>
                  {apiContract?.endpoints && (
                    <Badge className="text-[10px] bg-purple-500/10 text-purple-400">
                      {apiContract.endpoints.length} routes
                    </Badge>
                  )}
                </div>

                {apiContract?.endpoints ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {apiContract.endpoints.map((ep: any, i: number) => (
                      <div key={i} className="p-2.5 bg-surface rounded-lg border border-border text-xs flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              ep.method === 'GET'
                                ? 'bg-blue-500/20 text-blue-400'
                                : ep.method === 'POST'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : ep.method === 'PUT'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {ep.method}
                          </span>
                          <span className="font-mono text-text text-[11px] font-medium">{ep.path}</span>
                        </div>
                        <p className="text-text3 text-[10px]">{ep.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text3 py-8 text-center">
                    API contract endpoints will appear here once generated by the Backend Agent.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Interactive Preview & Comparison */}
          {activeTab === 'preview' && (
            <div className="flex flex-col h-full gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text3">View:</span>
                  <button
                    onClick={() => setPreviewMode('enhanced')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      previewMode === 'enhanced'
                        ? 'bg-accent text-zinc-950 font-bold'
                        : 'bg-surface2 text-text3 hover:text-text'
                    }`}
                  >
                    Enhanced Dynamic Site ✨
                  </button>
                  <button
                    onClick={() => setPreviewMode('original')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      previewMode === 'original'
                        ? 'bg-accent text-zinc-950 font-bold'
                        : 'bg-surface2 text-text3 hover:text-text'
                    }`}
                  >
                    Original Base Site
                  </button>
                </div>
                <div className="text-xs text-text3">
                  {previewMode === 'enhanced'
                    ? 'Includes working CRUD data table + Chart.js chart'
                    : 'Initial static front-end'}
                </div>
              </div>

              <div className="h-80 rounded-xl overflow-hidden border border-border bg-white">
                <iframe
                  title="Enhanced Preview"
                  className="w-full h-full bg-white"
                  srcDoc={previewMode === 'enhanced' ? (enhancedHtml || currentHtml) : currentHtml}
                  sandbox="allow-scripts allow-forms allow-popups allow-pointer-lock"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-surface2/50">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isRunning}>
              Close
            </Button>
            {enhancedHtml && (
              <Button variant="secondary" size="sm" onClick={handleDownloadZip}>
                <Download className="w-3.5 h-3.5" /> Download Site Code
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {enhancedHtml ? (
              <Button
                variant="primary"
                onClick={handleApply}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Apply Enhanced Dynamic Website
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleStart}
                loading={isRunning}
                disabled={isRunning}
                className="bg-gradient-to-r from-amber-500 to-[#f4976c] hover:from-amber-600 hover:to-[#f38a5b] text-zinc-950 font-bold shadow-md"
              >
                {isRunning ? (
                  <>Running 5-Agent Collaboration...</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Start Collaborative Enhancement
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
