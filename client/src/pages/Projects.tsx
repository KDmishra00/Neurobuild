import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { Button, Card, Badge, EmptyState, Skeleton, AlertDialog, Dialog, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Input, Select } from '../components/ui'
import { FolderGit2, Plus, Trash2, ArrowRight, Clock, Copy, Download, Search, Paperclip, X, File as FileIcon, FileText, FileImage } from 'lucide-react'
import type { Project, FileAttachment } from '../types'
import { cn } from '../lib/utils'

export default function Projects() {
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated')

  // File manager state
  const [filesProject, setFilesProject] = useState<Project | null>(null)
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [filesSaving, setFilesSaving] = useState(false)
  const [filesInputRef, setFilesInputRef] = useState<HTMLInputElement | null>(null)
  const [dragOverFiles, setDragOverFiles] = useState(false)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const { projects } = await api.getProjects()
      setProjects(projects)
    } catch (err: any) {
      if (err.response?.status === 401) navigate('/login')
      showToast('Failed to load projects', 'error')
    } finally {
      setLoading(false)
    }
  }, [navigate, showToast])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await api.deleteProject(deleteId)
      setProjects((prev) => prev.filter((p) => p.id !== deleteId))
      showToast('Project deleted', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete project', 'error')
    } finally {
      setDeleteId(null)
    }
  }

  const duplicateProject = async (project: Project) => {
    try {
      const { project: full } = await api.getProject(project.id)
      await api.createProject({
        name: `${project.name} (copy)`,
        prompt: full.prompt,
        html: full.html,
      })
      showToast('Project duplicated', 'success')
      loadProjects()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to duplicate project', 'error')
    }
  }

  const downloadProject = async (project: Project) => {
    try {
      const { project: full } = await api.getProject(project.id)
      if (!full.html) {
        showToast('This project has no generated content', 'warning')
        return
      }
      const blob = new Blob([full.html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.name || 'project'}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to download', 'error')
    }
  }

  const openFilesDialog = async (project: Project) => {
    setFilesProject(project)
    setAttachments([])
    try {
      const { project: full } = await api.getProject(project.id)
      setAttachments(full.attachments || [])
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to load files', 'error')
    }
  }

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || !filesProject) return
    const existingSize = attachments.reduce((sum, a) => sum + attachmentSize(a), 0)

    Array.from(fileList).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name} is larger than 4MB`, 'error')
        return
      }
      if (existingSize + file.size > MAX_TOTAL_SIZE) {
        showToast('Total attachment size cannot exceed 8MB', 'error')
        return
      }

      const attachment: FileAttachment = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        file,
      }

      // Read as data URL so any file type round-trips through storage/download
      const dataReader = new FileReader()
      dataReader.onload = () => {
        attachment.data = dataReader.result as string
        // Also keep a plain-text copy for text-like files
        if (file.type.startsWith('text/') || /json|javascript|html|css|xml|svg|csv/.test(file.type)) {
          const textReader = new FileReader()
          textReader.onload = () => {
            attachment.content = textReader.result as string
            setAttachments((prev) => [...prev, attachment])
          }
          textReader.readAsText(file)
        } else {
          setAttachments((prev) => [...prev, attachment])
        }
      }
      dataReader.onerror = () => showToast(`Failed to read ${file.name}`, 'error')
      dataReader.readAsDataURL(file)
    })
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const saveFiles = async () => {
    if (!filesProject) return
    setFilesSaving(true)
    try {
      await api.updateProject(filesProject.id, {
        attachments: attachments.map((a) => ({
          name: a.name,
          type: a.type,
          content: a.content || '',
          data: a.data || '',
        })),
      })
      showToast('Files saved', 'success')
      setFilesProject(null)
      setAttachments([])
      loadProjects()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to save files', 'error')
    } finally {
      setFilesSaving(false)
    }
  }

  const downloadAttachment = (att: FileAttachment) => {
    let blob: Blob | null = null
    if (att.data && att.data.startsWith('data:')) {
      const [meta, b64] = att.data.split(',')
      const mime = meta.match(/data:([^;]+)/)?.[1] || att.type || 'application/octet-stream'
      try {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        blob = new Blob([bytes], { type: mime })
      } catch { /* fall through to content */ }
    }
    if (!blob && att.content) {
      blob = new Blob([att.content], { type: att.type || 'text/plain' })
    }
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.name || 'download'
    a.click()
    URL.revokeObjectURL(url)
  }

const formatDate = (date: string) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB per file
const MAX_TOTAL_SIZE = 8 * 1024 * 1024 // 8MB total across attachments

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i]
}

function attachmentSize(att: FileAttachment): number {
  if (att.data) return Math.round(att.data.length * 0.75) // base64 → bytes
  if (att.content) return att.content.length
  return 0
}

function attachmentIcon(att: FileAttachment) {
  const t = att.type || ''
  if (t.startsWith('image/')) return FileImage
  if (t.startsWith('text/') || /json|javascript|html|css|xml|svg|csv/.test(t)) return FileText
  return FileIcon
}

  const filteredProjects = projects
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.prompt.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Projects</h1>
          <p className="text-sm text-text2 mt-1">Your saved website generations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              className="w-36"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'updated' | 'created' | 'name')}
              options={[
                { value: 'updated', label: 'Recently updated' },
                { value: 'created', label: 'Recently created' },
                { value: 'name', label: 'Name A-Z' },
              ]}
              placeholder="Sort"
            />
            <Link to="/">
              <Button><Plus className="w-4 h-4" /> New project</Button>
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <div className="p-4 space-y-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderGit2 className="w-8 h-8" />}
            title={search ? 'No matching projects' : 'No projects yet'}
            description={search ? 'Try a different search term' : 'Generate a website and save it here to keep track of it.'}
            action={
              search ? (
                <Button onClick={() => setSearch('')}><X className="w-4 h-4" /> Clear search</Button>
              ) : (
                <Link to="/">
                  <Button><Plus className="w-4 h-4" /> Create your first project</Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="overflow-hidden flex flex-col group">
              {/* Clickable link wrapping the whole card */}
              <Link to={`/projects/${project.id}`} className="flex flex-col flex-1">
                {/* Thumbnail / preview */}
                <div className="relative h-40 overflow-hidden border-b border-border">
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full bg-surface2 flex items-center justify-center text-text3">
                      <FolderGit2 className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ArrowRight className="w-8 h-8 text-white" />
                  </div>
                </div>

                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-text truncate">{project.name}</h3>
                    {project.isPublic && <Badge variant="info" size="sm">Public</Badge>}
                  </div>
                  <p className="text-sm text-text2 mt-1 line-clamp-2 flex-1">{project.prompt}</p>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                    <span className="text-xs text-text3 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatDate(project.updatedAt)}
                    </span>
                    {(project as any).attachmentCount > 0 && (
                      <span className="text-xs text-text3 flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> {(project as any).attachmentCount}
                      </span>
                    )}
                    <div
                      onClick={(e) => e.preventDefault()}
                      role="presentation"
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-text3 hover:text-text2 p-2">
                            <span className="sr-only">More options</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => duplicateProject(project)}>
                            <Copy className="w-4 h-4" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { window.open(`/projects/${project.id}`, '_blank') }}>
                            <ArrowRight className="w-4 h-4" /> Open in new tab
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openFilesDialog(project)}>
                            <Paperclip className="w-4 h-4" /> Manage files
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => downloadProject(project)}>
                            <Download className="w-4 h-4" /> Download HTML
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteId(project.id)} className="text-red-400 focus:text-red-300">
                            <Trash2 className="w-4 h-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!filesProject}
        onOpenChange={(open) => {
          if (!open) {
            setFilesProject(null)
            setAttachments([])
          }
        }}
        title={filesProject ? `${filesProject.name} — Files` : 'Files'}
        description="Attach files of any type. They are saved with the project and can be downloaded later."
      >
        {filesProject && (
          <div className="space-y-4">
            {/* Upload dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverFiles(true) }}
              onDragLeave={() => setDragOverFiles(false)}
              onDrop={(e) => { e.preventDefault(); setDragOverFiles(false); addFiles(e.dataTransfer.files) }}
              onClick={() => filesInputRef?.click()}
              className={cn(
                'border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
                dragOverFiles ? 'border-accent bg-accent/5' : 'border-border hover:border-border2'
              )}
            >
              <div className="flex items-center justify-center gap-2 text-text3">
                <Paperclip className="w-4 h-4" />
                <p className="text-sm">Drop files here or click to browse (up to 4MB each)</p>
              </div>
              <input
                ref={(el) => setFilesInputRef(el)}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              />
            </div>

            {/* Attachment list */}
            {attachments.length === 0 ? (
              <p className="text-sm text-text3 text-center py-6">No files attached to this project yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {attachments.map((att, i) => {
                  const Icon = attachmentIcon(att)
                  return (
                    <div key={`${att.name}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface2 border border-border">
                      {att.type?.startsWith('image/') && att.data ? (
                        <img src={att.data} alt={att.name} className="w-9 h-9 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-surface3 flex items-center justify-center text-text3 flex-shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text truncate">{att.name}</p>
                        <p className="text-xs text-text3">{formatBytes(attachmentSize(att))}</p>
                      </div>
                      <button
                        onClick={() => downloadAttachment(att)}
                        className="p-1.5 rounded text-text3 hover:text-text hover:bg-surface3 transition-colors"
                        aria-label={`Download ${att.name}`}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeAttachment(i)}
                        className="p-1.5 rounded text-text3 hover:text-red-400 hover:bg-surface3 transition-colors"
                        aria-label={`Remove ${att.name}`}
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => { setFilesProject(null); setAttachments([]) }}
                disabled={filesSaving}
              >
                Cancel
              </Button>
              <Button onClick={saveFiles} loading={filesSaving}>
                Save files
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete project"
        description="This will permanently delete the project and all its saved versions. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </div>
  )
}