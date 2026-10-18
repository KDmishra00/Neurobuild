import React, { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import type { AgentEvent, AgentScores, AgentResult } from '../types'
import { Button } from './ui'
import {
  Sparkles,
  Bot,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  X,
  Layers,
  Wand2,
  ShieldCheck,
  RefreshCw,
  Terminal,
} from 'lucide-react'

interface AgentOptimizerModalProps {
  isOpen: boolean
  onClose: () => void
  currentHtml: string
  currentModel?: string
  onApply: (improvedHtml: string) => void
}

type StageType = 'idle' | 'planner' | 'executor' | 'evaluator' | 'complete' | 'error'

export default function AgentOptimizerModal({
  isOpen,
  onClose,
  currentHtml,
  currentModel,
  onApply,
}: AgentOptimizerModalProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [stage, setStage] = useState<StageType>('idle')
  const [currentIteration, setCurrentIteration] = useState(0)
  const [maxIterations, setMaxIterations] = useState(3)
  const [statusMessage, setStatusMessage] = useState('Ready to autonomously evaluate and enhance website.')
  
  // Real-time state
  const [scores, setScores] = useState<AgentScores | null>(null)
  const [overallScore, setOverallScore] = useState<number | null>(null)
  const [initialScore, setInitialScore] = useState<number | null>(null)
  const [planActions, setPlanActions] = useState<any[]>([])
  const [planSummary, setPlanSummary] = useState<string>('')
  const [remainingIssues, setRemainingIssues] = useState<string[]>([])
  const [verdict, setVerdict] = useState<string>('')
  
  // Final outcome
  const [optimizedHtml, setOptimizedHtml] = useState<string>('')
  const [eventsLog, setEventsLog] = useState<Array<{ time: string; text: string; type: string }>>([])
  
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      if (!optimizedHtml) {
        setStage('idle')
        setStatusMessage('Press "Start Agentic Optimization" to trigger the Planner ➔ Executor ➔ Evaluator feedback cycle.')
      }
    }
  }, [isOpen, optimizedHtml])

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [eventsLog])

  if (!isOpen) return null

  const addLog = (text: string, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setEventsLog((prev) => [...prev, { time, text, type }])
  }

  const handleStartOptimization = async () => {
    if (!currentHtml || isRunning) return

    setIsRunning(true)
    setStage('planner')
    setCurrentIteration(1)
    setPlanActions([])
    setPlanSummary('')
    setEventsLog([])
    setScores(null)
    setOverallScore(null)
    setVerdict('')
    setRemainingIssues([])
    setOptimizedHtml('')

    addLog('Agentic Loop initiated: Planner ➔ Executor ➔ Evaluator', 'info')

    try {
      let finalResultHtml = ''

      await api.streamAgentOptimize(
        currentHtml,
        currentModel,
        (event: AgentEvent) => {
          if (event.iteration) setCurrentIteration(event.iteration)
          if (event.maxIterations) setMaxIterations(event.maxIterations)
          if (event.message) setStatusMessage(event.message)

          switch (event.type) {
            case 'start':
              addLog('Autonomous multi-stage agent initialized', 'info')
              break

            case 'iteration_start':
              addLog(`Iteration ${event.iteration} of ${event.maxIterations || 3} started`, 'info')
              break

            case 'planner_start':
              setStage('planner')
              addLog(`Planner agent analyzing website semantics and architecture...`, 'planner')
              break

            case 'planner_done':
              if (event.plan) {
                if (initialScore === null && event.plan.currentScore) {
                  setInitialScore(event.plan.currentScore)
                }
                if (event.plan.actions) {
                  setPlanActions(event.plan.actions)
                }
                if (event.plan.summary) {
                  setPlanSummary(event.plan.summary)
                }
                addLog(`Planner generated ${event.plan.actionCount} priority improvements (Baseline: ${event.plan.currentScore}/100)`, 'planner')
              }
              break

            case 'executor_start':
              setStage('executor')
              addLog(`Executor agent applying architectural updates and bug fixes...`, 'executor')
              break

            case 'executor_done':
              addLog(`Executor generated revised website structure (${(event.htmlLength || 0).toLocaleString()} bytes)`, 'executor')
              break

            case 'evaluator_start':
              setStage('evaluator')
              addLog(`Evaluator agent auditing Quality, SEO, Accessibility, and Responsiveness...`, 'evaluator')
              break

            case 'evaluator_done':
              if (event.evaluation) {
                setScores(event.evaluation.scores)
                setOverallScore(event.evaluation.overall)
                setVerdict(event.evaluation.verdict)
                if (event.evaluation.remainingIssues) {
                  setRemainingIssues(event.evaluation.remainingIssues)
                }
                addLog(`Evaluator Score: ${event.evaluation.overall}/100 [${event.evaluation.passed ? 'PASSED THRESHOLD' : 'CONTINUING'}]`, 'evaluator')
              }
              break

            case 'iteration_end':
              addLog(event.message || `Iteration completed. Advancing loop...`, 'info')
              break

            case 'complete':
              setStage('complete')
              if (event.finalScore) {
                setScores(event.finalScore.scores)
                setOverallScore(event.finalScore.overall)
                setVerdict(event.finalScore.verdict)
              }
              addLog(`Optimization complete: ${event.message}`, 'success')
              break

            case 'result':
              if (event.finalHtml) {
                finalResultHtml = event.finalHtml
                setOptimizedHtml(event.finalHtml)
              }
              if (event.finalScore) {
                setScores(event.finalScore.scores)
                setOverallScore(event.finalScore.overall)
                setVerdict(event.finalScore.verdict)
              }
              setStage('complete')
              addLog('Final production-grade build ready for deployment', 'success')
              break

            case 'error':
              setStage('error')
              addLog(`Agent encountered error: ${event.message}`, 'error')
              break
          }
        }
      )

      if (!finalResultHtml) {
        // Fallback to direct call if stream didn't return final html payload
        const result: AgentResult = await api.agentOptimize(currentHtml, currentModel)
        if (result && result.finalHtml) {
          setOptimizedHtml(result.finalHtml)
          if (result.finalScore) {
            setScores(result.finalScore.scores)
            setOverallScore(result.finalScore.overall)
            setVerdict(result.finalScore.verdict)
          }
        }
      }
    } catch (err: any) {
      console.error('Agent optimizer stream error, trying fallback:', err)
      addLog(`Streaming connection failed. Running direct Agentic pipeline...`, 'warning')
      try {
        const result = await api.agentOptimize(currentHtml, currentModel)
        setOptimizedHtml(result.finalHtml)
        if (result.finalScore) {
          setScores(result.finalScore.scores)
          setOverallScore(result.finalScore.overall)
          setVerdict(result.finalScore.verdict)
          setRemainingIssues(result.finalScore.remainingIssues || [])
        }
        setStage('complete')
        addLog(`Direct optimization finished successfully! Final score: ${result.finalScore?.overall || 85}/100`, 'success')
      } catch (directErr: any) {
        setStage('error')
        setStatusMessage(directErr.response?.data?.error || directErr.message || 'Optimization failed')
        addLog(`Optimization failed: ${directErr.message}`, 'error')
      }
    } finally {
      setIsRunning(false)
    }
  }

  const handleApplyClick = () => {
    if (optimizedHtml) {
      onApply(optimizedHtml)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface2/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-accent to-[#f4976c] flex items-center justify-center shadow-md">
              <Bot className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-text text-base">Autonomous Agentic Optimizer</h2>
              </div>
              <p className="text-xs text-text3">
                Planner ➔ Executor ➔ Evaluator autonomous feedback cycle
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 rounded-lg text-text3 hover:text-text hover:bg-surface3 transition-colors disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Loop Workflow Stages Progress Bar */}
          <div className="bg-surface2 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between text-xs text-text3 mb-3">
              <span className="font-medium text-text">Agent Feedback Loop Pipeline</span>
              <span className="font-mono">
                Iteration: <strong className="text-text">{currentIteration}</strong> / {maxIterations}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Stage 1: Planner */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  stage === 'planner'
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : stage === 'executor' || stage === 'evaluator' || stage === 'complete'
                    ? 'border-border bg-surface3/60'
                    : 'border-border/60 bg-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Layers className={`w-4 h-4 ${stage === 'planner' ? 'text-accent animate-pulse' : 'text-text3'}`} />
                    <span className="text-xs font-semibold text-text">1. Planner</span>
                  </div>
                  {stage === 'planner' && (
                    <RefreshCw className="w-3 h-3 text-accent animate-spin" />
                  )}
                  {(stage === 'executor' || stage === 'evaluator' || stage === 'complete') && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                </div>
                <p className="text-[11px] text-text3">
                  Identifies flaws across design, SEO, & responsive layout.
                </p>
              </div>

              {/* Stage 2: Executor */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  stage === 'executor'
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : stage === 'evaluator' || stage === 'complete'
                    ? 'border-border bg-surface3/60'
                    : 'border-border/60 bg-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Wand2 className={`w-4 h-4 ${stage === 'executor' ? 'text-accent animate-pulse' : 'text-text3'}`} />
                    <span className="text-xs font-semibold text-text">2. Executor</span>
                  </div>
                  {stage === 'executor' && (
                    <RefreshCw className="w-3 h-3 text-accent animate-spin" />
                  )}
                  {(stage === 'evaluator' || stage === 'complete') && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                </div>
                <p className="text-[11px] text-text3">
                  Applies structured code improvements in a single cohesive pass.
                </p>
              </div>

              {/* Stage 3: Evaluator */}
              <div
                className={`p-3 rounded-lg border transition-all ${
                  stage === 'evaluator'
                    ? 'border-accent bg-accent/10 shadow-sm'
                    : stage === 'complete'
                    ? 'border-border bg-surface3/60'
                    : 'border-border/60 bg-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className={`w-4 h-4 ${stage === 'evaluator' ? 'text-accent animate-pulse' : 'text-text3'}`} />
                    <span className="text-xs font-semibold text-text">3. Evaluator</span>
                  </div>
                  {stage === 'evaluator' && (
                    <RefreshCw className="w-3 h-3 text-accent animate-spin" />
                  )}
                  {stage === 'complete' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                </div>
                <p className="text-[11px] text-text3">
                  Scores 5 axes; passes if score ≥ 85 or loops to Planner.
                </p>
              </div>
            </div>

            {/* Current message status */}
            <div className="mt-3 flex items-center gap-2 text-xs text-text2 pt-2 border-t border-border/60 font-mono">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="truncate">{statusMessage}</span>
            </div>
          </div>

          {/* Scores & Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Overall Score Card */}
            <div className="bg-surface2 rounded-xl p-4 border border-border flex flex-col justify-between">
              <div>
                <span className="text-xs text-text3 font-medium uppercase tracking-wider">Quality Score</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-text font-mono">
                    {overallScore !== null ? overallScore : '--'}
                  </span>
                  <span className="text-xs text-text3">/ 100</span>
                  {initialScore !== null && overallScore !== null && overallScore > initialScore && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <TrendingUp className="w-3 h-3" /> +{overallScore - initialScore} pts
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 text-xs">
                {verdict ? (
                  <p className="text-text2 italic">"{verdict}"</p>
                ) : (
                  <p className="text-text3">Evaluator threshold target: 85+</p>
                )}
              </div>
            </div>

            {/* 5 Dimensional Breakdown */}
            <div className="md:col-span-2 bg-surface2 rounded-xl p-4 border border-border">
              <span className="text-xs text-text3 font-medium uppercase tracking-wider block mb-3">
                5-Axis Evaluation
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                {/* Design */}
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Design & Spacing (25%)</span>
                    <span className="font-mono font-medium">{scores?.design ?? '--'}/100</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#f4976c] transition-all duration-500"
                      style={{ width: `${scores?.design || 0}%` }}
                    />
                  </div>
                </div>

                {/* Accessibility */}
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Accessibility (20%)</span>
                    <span className="font-mono font-medium">{scores?.accessibility ?? '--'}/100</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${scores?.accessibility || 0}%` }}
                    />
                  </div>
                </div>

                {/* Performance */}
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Performance (20%)</span>
                    <span className="font-mono font-medium">{scores?.performance ?? '--'}/100</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${scores?.performance || 0}%` }}
                    />
                  </div>
                </div>

                {/* SEO */}
                <div>
                  <div className="flex justify-between text-text2 mb-1">
                    <span>SEO Meta & Semantics (15%)</span>
                    <span className="font-mono font-medium">{scores?.seo ?? '--'}/100</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-500"
                      style={{ width: `${scores?.seo || 0}%` }}
                    />
                  </div>
                </div>

                {/* Responsive */}
                <div className="sm:col-span-2">
                  <div className="flex justify-between text-text2 mb-1">
                    <span>Responsive Layout & Touch Targets (20%)</span>
                    <span className="font-mono font-medium">{scores?.responsive ?? '--'}/100</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${scores?.responsive || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Planned Actions & Issues (if any) */}
          {(planActions.length > 0 || remainingIssues.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Actions planned by planner */}
              {planActions.length > 0 && (
                <div className="bg-surface2 rounded-xl p-4 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
                      Planner Action Items ({planActions.length})
                    </h3>
                  </div>
                  {planSummary && (
                    <p className="text-xs text-text3 mb-3 italic">{planSummary}</p>
                  )}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {planActions.map((action, i) => (
                      <div key={i} className="p-2 rounded-lg bg-surface border border-border/80 text-xs">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono font-bold bg-accent/15 text-accent">
                            {action.category || 'general'}
                          </span>
                          <span className="font-medium text-text">{action.title}</span>
                        </div>
                        <p className="text-text3 text-[11px] leading-relaxed">{action.instruction}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Remaining issues or auditor notes */}
              {remainingIssues.length > 0 && (
                <div className="bg-surface2 rounded-xl p-4 border border-border">
                  <h3 className="text-xs font-semibold text-text uppercase tracking-wider mb-2">
                    Evaluator Auditor Notes
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {remainingIssues.map((issue, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-surface border border-border/80 text-xs flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-text2 text-[11px] leading-relaxed">{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Real-time Agent Event Logs Terminal */}
          <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-3 font-mono text-xs">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-800 text-zinc-400">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px]">Real-time Agent Telemetry Log</span>
            </div>
            <div ref={logContainerRef} className="h-32 overflow-y-auto space-y-1 text-[11px] pr-2">
              {eventsLog.length === 0 ? (
                <span className="text-zinc-600">// Telemetry waiting to start...</span>
              ) : (
                eventsLog.map((log, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-zinc-500 select-none">{log.time}</span>
                    <span
                      className={
                        log.type === 'error'
                          ? 'text-red-400'
                          : log.type === 'planner'
                          ? 'text-blue-400'
                          : log.type === 'executor'
                          ? 'text-purple-400'
                          : log.type === 'evaluator'
                          ? 'text-amber-400'
                          : log.type === 'success'
                          ? 'text-emerald-400 font-bold'
                          : 'text-zinc-300'
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-surface2/40">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isRunning}>
            {stage === 'complete' ? 'Close' : 'Cancel'}
          </Button>

          <div className="flex items-center gap-3">
            {stage === 'complete' && optimizedHtml ? (
              <Button
                variant="primary"
                onClick={handleApplyClick}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Apply Enhanced Code
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleStartOptimization}
                loading={isRunning}
                disabled={isRunning}
                className="bg-[#f4976c] hover:bg-[#f38a5b] text-zinc-950 font-bold"
              >
                {isRunning ? (
                  <>Running Agent Loop...</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Start Agentic Optimization
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
