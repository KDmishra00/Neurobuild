import React, { useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  LayoutDashboard,
  FolderGit2,
  Settings,
  LogOut,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
  Sun,
  Moon,
  Plus,
} from 'lucide-react'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderGit2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    const theme = localStorage.getItem('theme')
    if (theme !== null) return theme === 'dark'
    if (typeof user?.settings?.darkMode === 'boolean') return user.settings.darkMode
    return document.documentElement.classList.contains('dark')
  })

  // Synchronize with user settings if available
  useEffect(() => {
    if (typeof user?.settings?.darkMode === 'boolean') {
      const theme = localStorage.getItem('theme')
      if (theme === null) {
        setIsDark(user.settings.darkMode)
      }
    }
  }, [user?.settings?.darkMode])

  // Apply dark mode class to html element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const toggleTheme = useCallback(async () => {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    if (next) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    try {
      if (user) {
        await api.updateSettings({ darkMode: next })
        updateUser({ ...user, settings: { ...user.settings, darkMode: next } })
      }
    } catch {
      // Local preference is already saved in localStorage
    }
  }, [isDark, user, updateUser])

  // Keyboard shortcut: Ctrl+Shift+L toggles theme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        toggleTheme()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleTheme])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = (user?.name || user?.username || 'D')
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const getPageTitle = () => {
    if (location.pathname.startsWith('/projects/')) return 'Projects'
    if (location.pathname === '/projects') return 'Projects'
    if (location.pathname === '/settings') return 'Settings'
    return 'Dashboard'
  }

  const SidebarContent = (
    <div className={cn('flex flex-col h-full bg-surface transition-all duration-200', collapsed ? 'w-16' : 'w-60')}>
      {/* Logo */}
      <div className={cn('flex items-center gap-3 h-16 px-5 flex-shrink-0', collapsed && 'px-0 justify-center')}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4976c] text-zinc-950 flex-shrink-0 shadow-sm">
          <Sparkles className="w-5 h-5 fill-zinc-950 text-zinc-950" />
        </div>
        {!collapsed && (
          <div>
            <p className="font-bold text-base text-text font-serif leading-tight">Neurobuild</p>
            <p className="text-[11px] text-text3">AI Website Builder</p>
          </div>
        )}
      </div>

      {/* Workspace Header */}
      {!collapsed && (
        <div className="px-5 pt-5 pb-2">
          <p className="text-[10px] font-bold tracking-widest text-text3 uppercase">WORKSPACE</p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-1 overflow-y-auto scrollbar-hide">
        <div className="space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? isDark
                      ? 'bg-[#182032] text-zinc-100 shadow-sm'
                      : 'bg-accent/15 text-accent font-semibold shadow-sm'
                    : 'text-text2 hover:bg-surface2 hover:text-text'
                )
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="mt-auto p-3 space-y-1 flex-shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs text-text3 hover:text-text hover:bg-surface2 transition-colors',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4 mx-auto" /> : <><ChevronsLeft className="w-4 h-4" /><span>Collapse</span></>}
        </button>

        <div>
          <button
            onClick={handleLogout}
            className={cn(
              'w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs text-text3 hover:text-text hover:bg-surface2 transition-colors',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg flex text-text transition-colors duration-150">
      {/* Desktop sidebar */}
      <aside className={cn('hidden md:flex flex-shrink-0 border-r border-border bg-surface transition-all duration-200', collapsed ? 'w-16' : 'w-60')}>
        {SidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute top-0 left-0 h-full w-60 bg-surface border-r border-border shadow-2xl animate-slide-in-from-left">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 p-1 text-text3 hover:text-text"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex-shrink-0 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-6 transition-colors duration-150">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 text-text2 hover:text-text"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-text3 font-normal">Neurobuild</span>
              <span className="text-text3">/</span>
              <span className="text-text font-medium">{getPageTitle()}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-border bg-surface-solid text-text2 hover:text-text hover:border-border2 transition-colors flex items-center justify-center"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode (Ctrl+Shift+L)`}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
            </button>

            {/* Quick new project '+' action */}
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg border border-border bg-surface-solid text-text2 hover:text-text hover:border-border2 transition-colors hidden sm:flex items-center justify-center"
              aria-label="New website"
              title="New project"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[#1e40af] text-white flex items-center justify-center font-semibold text-xs shadow-sm">
                {initials[0] || 'D'}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-tight">
                <p className="text-xs font-semibold text-text">{user?.name || user?.username || 'ddd'}</p>
                <p className="text-[11px] text-text3">{user?.email || 'd@gmail.com'}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}