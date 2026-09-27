import { useState, useEffect, useCallback, useRef } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { Button, Badge, Skeleton, AlertDialog } from '../components/ui'
import { ArrowLeft, Download, ExternalLink, Clock, FileCode, Code, Braces, Sparkles, Trash2 } from 'lucide-react'
import type { Project } from '../types'
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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeVersion, setActiveVersion] = useState(0)
  const [currentHtml, setCurrentHtml] = useState('')
  const [activeTab, setActiveTab] = useState<CodeTab>('html')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [previewPct, setPreviewPct] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('freebuff.detailPreviewPct') || '', 10)
    return Number.isFinite(saved) && saved >= 40 && saved <= 90 ? saved : 66
  })
  const topRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const { project } = await api.getProject(id)
      setProject(project as any)
      setCurrentHtml((project as any).html || '')
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/login')
      showToast('Failed to load project', 'error')
    } finally {
      setLoading(false)
    }
  }, [id, navigate, showToast])

  useEffect(() => {
    load()
  }, [load])

  const selectVersion = async (index: number) => {
    if (!id) return
    setActiveVersion(index)
    try {
      if (index === 0) {
        setCurrentHtml((project as any)?.html || '')
      } else {
        const { version } = await api.getProjectVersion(id, index - 1)
        setCurrentHtml(version.html)
      }
    } catch {
      showToast('Failed to load version', 'error')
    }
  }

  const downloadHtml = () => {
    if (!currentHtml) return
    const blob = new Blob([currentHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(project as any)?.name || 'project'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteProject = async () => {
    if (!id) return
    setDeleting(true)
    try {
      await api.deleteProject(id)
      showToast('Project deleted', 'success')
      navigate('/projects')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete project', 'error')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const openInTab = () => {
    if (!currentHtml) return
    const w = window.open('', '_blank')
    if (w) { w.document.write(currentHtml); w.document.close() }
  }

  const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const updatePreviewPct = (p: number) => {
    setPreviewPct(p)
    localStorage.setItem('freebuff.detailPreviewPct', String(p))
  }

  // Drag the divider between Preview and Code
  const startPreviewResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startPct = previewPct
    const container = topRef.current
    const width = container?.clientWidth || 1000
    const onMove = (ev: MouseEvent) => {
      updatePreviewPct(Math.max(40, Math.min(90, startPct + ((ev.clientX - startX) / width) * 100)))
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-[70vh] w-full" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-text2">Project not found.</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/projects')}>Back to projects</Button>
      </div>
    )
  }

  const versions: any[] = (project as any).versions || []
  const codeParts = parseHtmlParts(currentHtml)
  const codeContent = codeParts[activeTab] || ''

  return (
    <div className="flex flex-col h-full gap-0 -m-4 md:-m-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 md:p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-text truncate">{(project as any).name}</h1>
            <p className="text-sm text-text2 mt-0.5 line-clamp-1">{(project as any).prompt}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={downloadHtml}><Download className="w-3.5 h-3.5" /> Download</Button>
          <Button variant="ghost" size="sm" onClick={openInTab}><ExternalLink className="w-3.5 h-3.5" /> Open</Button>
          <NavLink to={`/?edit=${id}`} className="px-3 py-1.5 text-sm font-medium text-accent hover:underline">Open in builder</NavLink>
          <Button variant="ghost" size="sm" className="text-text3 hover:text-red-400" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Version tabs */}
      {versions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 md:px-6 py-2 border-b border-border bg-surface2/50">
          <span className="text-sm text-text2">Versions:</span>
          <button
            onClick={() => selectVersion(0)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-colors',
              activeVersion === 0 ? 'bg-accent text-white' : 'bg-surface2 text-text2 hover:text-text'
            )}
          >
            Current
          </button>
          {versions.map((v: any, i: number) => (
            <button
              key={v.index}
              onClick={() => selectVersion(v.index + 1)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                activeVersion === v.index + 1 ? 'bg-accent text-white' : 'bg-surface2 text-text2 hover:text-text'
              )}
            >
              v{i + 1} <Clock className="w-3 h-3 inline-block align-bottom ml-1" /> {formatDate(v.createdAt)}
            </button>
          ))}
        </div>
      )}

      {/* Main content - two column like Dashboard */}
      <div
        ref={topRef}
        className="flex-1 flex flex-col lg:flex-row gap-4 p-4 md:p-6 min-h-0"
        style={{ '--pv': `${previewPct}%` } as CSSProperties}
      >
        {/* Left: Preview */}
        <div className="w-full lg:w-[var(--pv)] lg:flex-shrink-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col min-h-[400px] lg:min-h-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-text text-sm">Live preview</h3>
            <Badge>{activeVersion === 0 ? 'Current' : `Version ${activeVersion}`}</Badge>
          </div>

          <div className="flex-1 p-4 overflow-auto">
            {currentHtml ? (
              <div className="rounded-lg overflow-hidden border border-border h-full">
                <iframe
                  title="Project preview"
                  className="w-full h-full bg-white"
                  srcDoc={currentHtml}
                  sandbox="allow-scripts allow-forms allow-popups allow-pointer-lock"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-text3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 mb-4">
                  <Sparkles className="w-7 h-7" />
                </div>
                <p className="text-sm text-text2">No HTML content</p>
              </div>
            )}
          </div>
        </div>

        {/* Vertical resize handle (desktop) */}
        <div
          onMouseDown={startPreviewResize}
          className="hidden lg:flex w-2 -mx-3 items-center justify-center cursor-col-resize flex-shrink-0 self-stretch group"
          title="Drag to resize Preview / Code"
        >
          <div className="w-0.5 h-full bg-border group-hover:bg-accent transition-colors rounded-full" />
        </div>

        {/* Right: Code tabs (like Dashboard bottom) */}
        <div className="w-full lg:flex-1 lg:min-w-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col min-h-[400px] lg:min-h-0">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-text text-sm">Code</h3>
          </div>

          <div className="flex items-center border-b border-border">
            {([
              { key: 'html' as CodeTab, label: 'HTML', icon: FileCode },
              { key: 'css' as CodeTab, label: 'CSS', icon: Code },
              { key: 'js' as CodeTab, label: 'JS', icon: Braces },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px',
                  activeTab === key
                    ? 'text-text border-accent'
                    : 'text-text3 hover:text-text2 border-transparent'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4 overflow-auto">
            <pre className="text-xs text-text2 font-mono whitespace-pre-wrap h-full">
              {codeContent || `<!-- generated ${activeTab.toUpperCase()} will appear here -->`}
            </pre>
          </div>
        </div>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
        title="Delete project"
        description={`This will permanently delete "${(project as any)?.name || 'this project'}" and all its saved versions. This action cannot be undone.`}
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onConfirm={deleteProject}
        variant="destructive"
      />
    </div>
  )
}