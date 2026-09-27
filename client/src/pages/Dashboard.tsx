import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { Button, Badge } from '../components/ui'
import {
  Paperclip, Image as ImageIcon, FileText, Zap, Loader, Download, ExternalLink, Save, X,
  Monitor,
} from 'lucide-react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { Model, FileAttachment } from '../types'
import { cn } from '../lib/utils'

type CodeTab = 'html' | 'css' | 'js'

function parseHtmlParts(raw: string) {
  let html = ''
  let css = ''
  let js = ''

  const styleMatch = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  if (styleMatch) css = styleMatch[1].trim()

  const scriptMatch = raw.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  if (scriptMatch) js = scriptMatch[1].trim()

  html = raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .trim()

  return { html, css, js }
}

export default function Dashboard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<Model[]>([])

  const [files, setFiles] = useState<FileAttachment[]>([])
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [stage, setStage] = useState('')
  const [html, setHtml] = useState('')
  const [saved, setSaved] = useState(false)

  const [activeTab, setActiveTab] = useState<CodeTab>('html')
  const [promptWidth, setPromptWidth] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('freebuff.promptWidth') || '', 10)
    return Number.isFinite(saved) && saved >= 240 && saved <= 800 ? saved : 420
  })
  const [codeHeight, setCodeHeight] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('freebuff.codeHeight') || '', 10)
    return Number.isFinite(saved) && saved >= 100 && saved <= 500 ? saved : 160
  })

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const codeParts = parseHtmlParts(html)
  const codeContent = codeParts[activeTab] || ''

  const updatePromptWidth = (w: number) => {
    setPromptWidth(w)
    localStorage.setItem('freebuff.promptWidth', String(w))
  }
  const updateCodeHeight = (h: number) => {
    setCodeHeight(h)
    localStorage.setItem('freebuff.codeHeight', String(h))
  }

  // Check prefill prompt from component blueprints
  useEffect(() => {
    const prefill = sessionStorage.getItem('prefill_prompt')
    if (prefill) {
      setPrompt(prefill)
      sessionStorage.removeItem('prefill_prompt')
    }
  }, [])

  // Drag the divider between Prompt and Preview
  const startColResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = promptWidth
    const onMove = (ev: MouseEvent) => {
      updatePromptWidth(Math.max(240, Math.min(800, startW + (ev.clientX - startX))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.querySelectorAll('iframe').forEach((f) => { (f as HTMLElement).style.pointerEvents = 'auto' })
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.querySelectorAll('iframe').forEach((f) => { (f as HTMLElement).style.pointerEvents = 'none' })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Drag the divider above the Code panel
  const startRowResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = codeHeight
    const onMove = (ev: MouseEvent) => {
      updateCodeHeight(Math.max(100, Math.min(500, startH + (startY - ev.clientY))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.querySelectorAll('iframe').forEach((f) => { (f as HTMLElement).style.pointerEvents = 'auto' })
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.querySelectorAll('iframe').forEach((f) => { (f as HTMLElement).style.pointerEvents = 'none' })
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    let cancelled = false
    api.getModels()
      .then(({ models }) => {
        if (cancelled) return
        setModels(models)
        if (models.length > 0) {
          const saved = user?.settings?.model
          const exists = saved && models.some((m) => m.id === saved)
          setModel(exists ? saved : models.find((m) => m.type === 'cloud')?.id || models[0].id)
        }
      })
      .catch(() => { if (!cancelled) showToast('Failed to load models', 'error') })
    return () => { cancelled = true }
  }, [user, showToast])

  // Load project for editing when ?edit=<id> is present
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return

    let cancelled = false
    api.getProject(editId)
      .then(({ project }) => {
        if (cancelled) return
        setPrompt(project.prompt || '')
        setHtml(project.html || '')
        if (project.attachments?.length) {
          setFiles(project.attachments.map(a => ({
            name: a.name,
            type: a.type,
            content: a.content || '',
            data: a.data || '',
            file: new File([], a.name)
          })))
        }
        setSaved(false)
        searchParams.delete('edit')
        navigate('/', { replace: true })
      })
      .catch((err: any) => {
        if (!cancelled) showToast(err.response?.data?.error || 'Failed to load project', 'error')
      })
    return () => { cancelled = true }
  }, [searchParams, navigate, showToast])

  const handleFileSelect = useRef((fileList: FileList | null) => {
    if (!fileList) return
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader()
      const isImage = file.type.startsWith('image/')
      const attachment: FileAttachment = {
        name: file.name,
        type: file.type,
        file,
      }
      if (isImage) {
        reader.onload = () => {
          attachment.data = reader.result as string
          setFiles((prev) => [...prev, attachment])
        }
        reader.readAsDataURL(file)
      } else {
        reader.onload = () => {
          attachment.content = reader.result as string
          setFiles((prev) => [...prev, attachment])
        }
        reader.readAsText(file)
      }
    })
  }).current

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please enter a prompt', 'warning')
      return
    }
    if (generating) return

    setGenerating(true)
    setSaved(false)
    setHtml('')
    setStage('Thinking...')

    try {
      let result: { html: string; cached?: boolean; fallback?: boolean }
      if (files.length > 0) {
        setStage('Analyzing files...')
        result = await api.analyzeAndGenerate(prompt, files, model)
      } else {
        setStage('Generating...')
        result = await api.generate(prompt, model)
      }

      setHtml(result.html)
      if (result.fallback) showToast('Used fallback model', 'info')
      if (result.cached) showToast('Served from cache', 'info')
      setStage('')
    } catch (err: any) {
      setStage('')
      showToast(err.response?.data?.error || 'Generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleEdit = async () => {
    if (!html) return
    if (!editPrompt.trim()) {
      showToast('Enter an edit instruction', 'warning')
      return
    }
    if (editing) return

    setEditing(true)
    try {
      const result = await api.editSite(html, editPrompt.trim(), model)
      setHtml(result.html)
      setSaved(false)
      setEditPrompt('')
      showToast('Changes applied to the site', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Edit failed — try again', 'error')
    } finally {
      setEditing(false)
    }
  }

  const saveProject = async () => {
    if (!html) return
    try {
      await api.createProject({
        name: prompt.slice(0, 60) || 'Untitled project',
        prompt,
        html,
        attachments: files.map(f => ({
          name: f.name,
          type: f.type,
          content: f.content || '',
          data: f.data || ''
        }))
      })
      setSaved(true)
      showToast('Project saved', 'success')
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/login')
      showToast(err.response?.data?.error || 'Failed to save project', 'error')
    }
  }

  const downloadHtml = () => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'generated-site.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  const openInTab = () => {
    if (!html) return
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-bg">
      {/* Top: Prompt + Preview split */}
      <div
        className="flex-1 flex flex-col lg:flex-row gap-4 p-5 min-h-0 overflow-hidden"
        style={{ '--prompt-w': `${promptWidth}px` } as CSSProperties}
      >
        {/* Left: Prompt panel */}
        <div className="w-full lg:w-[var(--prompt-w)] flex-shrink-0 bg-surface border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2.5 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <h2 className="font-semibold text-text text-sm">Prompt</h2>
          </div>

          <div className="p-4 space-y-3.5 flex-1 overflow-y-auto">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the website you want to build"
              maxLength={10000}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
              className="w-full p-3.5 rounded-xl bg-surface2 border border-border text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent min-h-[130px] resize-y transition-colors font-sans leading-relaxed"
            />
            <div className="flex items-center justify-between text-xs text-text3 font-mono px-1">
              <span>{prompt.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
              <span className={prompt.length > 9000 ? 'text-amber-500' : ''}>{prompt.length.toLocaleString()} / 10,000</span>
            </div>

            {/* File upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files) }}
              onClick={() => fileInputRef?.click()}
              className={cn(
                'w-full py-2.5 px-4 rounded-xl border border-border bg-surface2 hover:bg-surface3 hover:border-border2 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2',
                dragOver && 'border-accent bg-accent/5'
              )}
            >
              {files.length === 0 ? (
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-text3">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach images or files</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 justify-center w-full">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-surface border border-border px-2 py-1 rounded-lg">
                      {file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3 text-accent" /> : <FileText className="w-3 h-3 text-accent" />}
                      <span className="text-xs text-text truncate max-w-28">{file.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        className="text-text3 hover:text-red-500 transition-colors ml-1"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={(el) => setFileInputRef(el)}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>

            {/* Model selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text2">Model</label>
              <div className="relative">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-9 rounded-xl bg-surface2 border border-border text-xs font-mono text-text appearance-none focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-colors cursor-pointer"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id} className="bg-surface text-text py-1">
                      {m.name || m.id} {m.type === 'cloud' ? '· cloud' : '· local'}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || generating}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#f4976c] hover:bg-[#f38a5b] text-zinc-950 font-bold text-sm shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {generating ? (
                <>
                  <Loader className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-zinc-950 text-zinc-950" />
                  <span>Generate</span>
                </>
              )}
            </button>

            {generating && stage && (
              <div className="flex items-center gap-2 text-xs text-[#f4976c] font-medium pt-1">
                <Loader className="w-3.5 h-3.5 animate-spin" /> {stage}
              </div>
            )}
          </div>
        </div>

        {/* Vertical resize handle (desktop) */}
        <div
          onMouseDown={startColResize}
          className="hidden lg:flex w-2 -mx-3 items-center justify-center cursor-col-resize flex-shrink-0 self-stretch group z-10"
          title="Drag to resize Prompt / Preview"
        >
          <div className="w-0.5 h-full bg-border group-hover:bg-accent transition-colors rounded-full" />
        </div>

        {/* Right: Live preview */}
        <div className="flex-1 bg-surface border border-border rounded-2xl overflow-hidden flex flex-col min-h-[400px] lg:min-h-0 shadow-sm">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#14b8a6] shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
              <h3 className="font-semibold text-text text-sm">Live preview</h3>
            </div>
            <div className="flex items-center gap-2">
              {html && !generating && (
                <div className="flex items-center gap-2">
                  <Badge className="bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 text-xs">Generated</Badge>
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={saveProject} disabled={saved}>
                      <Save className="w-3.5 h-3.5" /> {saved ? 'Saved' : 'Save'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={downloadHtml}>
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                    <Button variant="ghost" size="sm" onClick={openInTab}>
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 p-4 overflow-auto">
            {generating ? (
              <div className="flex flex-col items-center justify-center h-full text-text2">
                <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-medium">{stage || 'Generating your site...'}</p>
              </div>
            ) : html ? (
              <div className="relative h-full">
                <div className="rounded-xl overflow-hidden border border-border h-full bg-white">
                  <iframe
                    ref={iframeRef}
                    title="Live preview"
                    className="w-full h-full bg-white"
                    srcDoc={html}
                    sandbox="allow-scripts allow-forms allow-popups allow-pointer-lock"
                  />
                </div>

                {/* AI edit bar — center bottom of the preview */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[94%] max-w-xl z-10">
                  <div className="flex items-center gap-2 bg-surface/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl p-2">
                    <input
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleEdit()
                        }
                      }}
                      disabled={editing}
                      placeholder="Ask AI to edit this site… e.g. “make the hero purple”"
                      aria-label="AI edit instruction"
                      className="flex-1 px-3.5 py-2 rounded-xl bg-surface2 border border-border text-sm text-text placeholder-text3 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-colors min-w-0"
                    />
                    <Button
                      onClick={handleEdit}
                      loading={editing}
                      disabled={!editPrompt.trim() || editing}
                      variant="secondary"
                      size="sm"
                      className="flex-shrink-0 rounded-xl"
                    >
                      {editing ? 'Editing…' : 'Apply'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-text3 py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface2 border border-border mb-4">
                  <Monitor className="w-8 h-8 text-accent" />
                </div>
                <p className="text-sm text-text3 font-medium">Your site renders here once generated</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal resize handle (desktop) */}
      <div
        onMouseDown={startRowResize}
        className="hidden lg:flex h-2 -my-1 items-center justify-center cursor-row-resize flex-shrink-0 group z-10"
        title="Drag to resize Code panel"
      >
        <div className="w-full h-0.5 bg-border group-hover:bg-accent transition-colors" />
      </div>

      {/* Bottom: Code tabs */}
      <div className="border-t border-border bg-surface flex flex-col flex-shrink-0" style={{ height: codeHeight }}>
        <div className="flex items-center px-4 border-b border-border bg-surface flex-shrink-0">
          {([
            { key: 'html' as CodeTab, label: 'html', symbol: '<>' },
            { key: 'css' as CodeTab, label: 'css', symbol: '<>' },
            { key: 'js' as CodeTab, label: 'js', symbol: '#' },
          ]).map(({ key, label, symbol }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono transition-colors border-b-2 -mb-px',
                activeTab === key
                  ? 'text-accent border-accent font-semibold'
                  : 'text-text3 hover:text-text border-transparent'
              )}
            >
              <span className="opacity-80">{symbol}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 flex-1 overflow-auto min-h-0 bg-surface-solid">
          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
            {codeContent ? (
              <span className="text-text">{codeContent}</span>
            ) : (
              <span className="text-text3">// generated markup appears here</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  )
}