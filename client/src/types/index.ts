export type User = {
  id: string
  username: string
  name: string
  email: string
  settings: {
    darkMode: boolean
    compact: boolean
    autoPreview: boolean
    emailUpdates: boolean
    model: string
  }
  generationCount: number
}

export type Project = {
  id: string
  owner: string
  name: string
  prompt: string
  html: string
  versions: Array<{
    html: string
    prompt: string
    createdAt: string
  }>
  tags: string[]
  isPublic: boolean
  thumbnail: string
  createdAt: string
  updatedAt: string
  attachments?: FileAttachment[]
}

export type Conversation = {
  id: string
  owner: string
  title: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    html?: string
  }>
  createdAt: string
  updatedAt: string
}

export type Model = {
  id: string
  name: string
  type: 'local' | 'cloud'
  description?: string
}

export type FileAttachment = {
  name: string
  type: string
  content?: string
  data?: string
  file?: File
}

export type GenerateResponse = {
  html: string
  site: any
  cached?: boolean
  fallback?: boolean
  stages?: any
}

export type AnalyzeResponse = {
  html: string
  site: any
  filesProcessed: number
}

// Agentic AI Types (Module 6)
export type AgentScores = {
  design: number
  accessibility: number
  performance: number
  seo: number
  responsive: number
}

export type AgentEvent = {
  type: string
  iteration?: number
  maxIterations?: number
  message?: string
  plan?: {
    currentScore: number
    actionCount: number
    summary: string
    actions?: Array<{
      id: number
      category: string
      priority: string
      title: string
      instruction: string
    }>
  }
  evaluation?: {
    scores: AgentScores
    overall: number
    passed: boolean
    verdict: string
    remainingIssues?: string[]
  }
  htmlLength?: number
  finalScore?: {
    scores: AgentScores
    overall: number
    passed: boolean
    verdict: string
  }
  // Result fields (sent with type='result')
  finalHtml?: string
  iterations?: number
  history?: Array<{
    iteration: number
    plan: { currentScore: number; actionCount: number; summary: string }
    evaluation: { scores: AgentScores; overall: number; passed: boolean; verdict: string }
  }>
  improved?: boolean
}

export type AgentResult = {
  finalHtml: string
  iterations: number
  finalScore: {
    scores: AgentScores
    overall: number
    passed: boolean
    verdict: string
    remainingIssues?: string[]
  }
  history: Array<{
    iteration: number
    plan: { currentScore: number; actionCount: number; summary: string }
    evaluation: { scores: AgentScores; overall: number; passed: boolean; verdict: string }
  }>
  improved: boolean
}

// Module 6: Collaborative Agentic AI Types
export type CollabTask = {
  id: string
  agentName: 'planner' | 'database' | 'backend' | 'frontend' | 'reviewer' | string
  description: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string | null
}

export type CollabMessage = {
  id?: number
  timestamp?: string
  from: string
  to: string
  topic: string
  payload?: any
  message?: string
}

export type CollabAgentEvent = {
  type: string
  runId?: string
  message?: string
  phase?: string
  agent?: string
  from?: string
  to?: string
  topic?: string
  result?: any
  issues?: any[]
  revisionNumber?: number
  maxRevisions?: number
  remainingIssues?: any[]
  reviewPassed?: boolean
  taskSummary?: CollabTask[]
  messageLog?: CollabMessage[]
  enhancedHtml?: string
  success?: boolean
  error?: string
  schema?: any
  apiContract?: any
  backendCode?: string
  schemaCode?: string
  seedData?: any
}

export type CollabAgentRunSummary = {
  id: string
  prompt: string
  domain: string
  domainType: string
  needsBackend: boolean
  status: 'running' | 'complete' | 'failed'
  reviewPassed: boolean
  taskCount: number
  completedTasks: number
  createdAt: string
  durationMs: number
}
