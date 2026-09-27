import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import type { User, Project, Conversation, Model, FileAttachment, GenerateResponse, AnalyzeResponse } from '../types'

const API_URL = '/api'

class ApiClient {
  private client: AxiosInstance
  private csrfToken: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = localStorage.getItem('token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      if (this.csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
        config.headers['X-CSRF-Token'] = this.csrfToken
      }
      return config
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  async fetchCsrfToken(): Promise<string | null> {
    const response = await this.client.get('/auth/csrf-token')
    this.csrfToken = response.data.csrfToken
    return this.csrfToken
  }

  // Auth
  async register(data: { username: string; name: string; email: string; password: string }) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/auth/register', data)
    return response.data
  }

  async login(data: { email: string; password: string }) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/auth/login', data)
    return response.data
  }

  async logout() {
    await this.fetchCsrfToken()
    const response = await this.client.post('/auth/logout')
    return response.data
  }

  async getMe() {
    const response = await this.client.get('/auth/me')
    return response.data
  }

  async refreshToken() {
    const response = await this.client.post('/auth/refresh')
    return response.data
  }

  async updateSettings(settings: Partial<User['settings']>) {
    await this.fetchCsrfToken()
    const response = await this.client.patch('/auth/settings', settings)
    return response.data
  }

  async updateProfile(data: { name: string }) {
    await this.fetchCsrfToken()
    const response = await this.client.patch('/auth/profile', data)
    return response.data
  }

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/auth/change-password', data)
    return response.data
  }

  async forgotPassword(email: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/auth/forgot-password', { email })
    return response.data
  }

  async resetPassword(token: string, newPassword: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/auth/reset-password', { token, newPassword })
    return response.data
  }

  async deleteAccount() {
    await this.fetchCsrfToken()
    const response = await this.client.delete('/auth/account')
    return response.data
  }

  // Generation
  async generate(prompt: string, model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/generate', { prompt, model })
    return response.data as GenerateResponse
  }

  /**
   * Consume a Server-Sent Events endpoint via fetch (axios cannot parse SSE).
   * Resolves once the stream completes; invokes callbacks per event.
   */
  private async streamEventSource(url: string, onEvent: (data: any) => void): Promise<void> {
    const token = localStorage.getItem('token')
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Stream could not start')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() || ''
      for (const event of events) {
        const payload = event.split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        if (!payload) continue
        onEvent(JSON.parse(payload))
      }
    }
  }

  async streamGenerate(prompt: string, model?: string, onChunk?: (chunk: string) => void, onDone?: (html: string) => void) {
    const params = new URLSearchParams({ prompt })
    if (model) params.set('model', model)
    await this.streamEventSource(`/stream-generate?${params}`, (data) => {
      if (data.chunk) onChunk?.(data.chunk)
      if (data.done) onDone?.(data.html)
    })
  }

  async pipelineGenerate(prompt: string, mode: 'sequential' | 'parallel' = 'sequential') {
    await this.fetchCsrfToken()
    const response = await this.client.post('/pipeline-generate', { prompt, mode })
    return response.data as GenerateResponse
  }

  async streamPipelineGenerate(prompt: string, mode: 'sequential' | 'parallel' = 'sequential', onEvent?: (event: any) => void) {
    const params = new URLSearchParams({ prompt, mode })
    await this.streamEventSource(`/stream-pipeline?${params}`, (data) => onEvent?.(data))
  }

  async refineCode(code: string, instruction?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/refine-code', { code, instruction })
    return response.data
  }

  async editSite(html: string, instruction: string, model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/edit-site', { html, instruction, model })
    return response.data as { html: string }
  }

  async getModels() {
    const response = await this.client.get('/models')
    return response.data as { models: Model[]; pipeline: any }
  }

  // Chat
  async chat(message: string, conversationId?: string, model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/chat', { message, conversationId, model })
    return response.data
  }

  async streamChat(message: string, conversationId?: string, model?: string, onEvent?: (event: any) => void) {
    const params = new URLSearchParams({ message })
    if (conversationId) params.set('conversationId', conversationId)
    if (model) params.set('model', model)
    await this.streamEventSource(`/stream-chat?${params}`, (data) => onEvent?.(data))
  }

  async getConversations() {
    const response = await this.client.get('/conversations')
    return response.data as { conversations: Conversation[] }
  }

  async getConversation(id: string) {
    const response = await this.client.get(`/conversations/${id}`)
    return response.data as { conversation: Conversation }
  }

  async deleteConversation(id: string) {
    await this.fetchCsrfToken()
    const response = await this.client.delete(`/conversations/${id}`)
    return response.data
  }

  // AI Enhancements
  async suggestImprovements(html: string, model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/generate/suggest', { html, model })
    return response.data
  }

  async generateDesignSystem(prompt: string, model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/generate/design-system', { prompt, model })
    return response.data
  }

  async generateContent(prompt: string, type?: string, model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/generate/content', { prompt, type, model })
    return response.data
  }

  // File analysis
  async analyzeAndGenerate(prompt: string, files: FileAttachment[], model?: string) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/analyze-and-generate', {
      prompt,
      files: files.map(f => ({
        name: f.name,
        type: f.type,
        content: f.content,
        data: f.data,
      })),
      model,
    })
    return response.data as AnalyzeResponse
  }

  // Projects
  async getProjects() {
    const response = await this.client.get('/projects')
    return response.data as { projects: Project[] }
  }

  async getProject(id: string) {
    const response = await this.client.get(`/projects/${id}`)
    return response.data as { project: Project }
  }

  async getProjectVersion(id: string, index: number) {
    const response = await this.client.get(`/projects/${id}/versions/${index}`)
    return response.data as { version: { index: number; html: string; prompt: string; createdAt: string } }
  }

  async createProject(data: { name: string; prompt: string; html: string; attachments?: FileAttachment[] }) {
    await this.fetchCsrfToken()
    const response = await this.client.post('/projects', data)
    return response.data as { project: Project }
  }

  async updateProject(id: string, data: Partial<Project>) {
    await this.fetchCsrfToken()
    const response = await this.client.patch(`/projects/${id}`, data)
    return response.data as { project: Project }
  }

  async deleteProject(id: string) {
    await this.fetchCsrfToken()
    const response = await this.client.delete(`/projects/${id}`)
    return response.data
  }

  // Analytics
  async getAnalytics() {
    const response = await this.client.get('/analytics/dashboard')
    return response.data
  }
}

export const api = new ApiClient()