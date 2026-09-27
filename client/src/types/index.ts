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