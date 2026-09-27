import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import {
  Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent,
  Separator, Tabs, TabsList, TabsTrigger, TabsContent, Select, AlertDialog,
} from '../components/ui'
import { User, Palette, Trash2, Monitor, Code, Lock, Mail } from 'lucide-react'

export default function Settings() {
  const { user, updateUser } = useAuth()
  const { showToast } = useToast()

  // Profile
  const [name, setName] = useState(user?.name || '')
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Preferences
  const [darkMode, _setDarkMode] = useState(user?.settings.darkMode ?? true)
  const [compact, setCompact] = useState(user?.settings.compact ?? false)
  const [autoPreview, setAutoPreview] = useState(user?.settings.autoPreview ?? true)
  const [emailUpdates, setEmailUpdates] = useState(user?.settings.emailUpdates ?? false)
  const [model, setModel] = useState(user?.settings.model || '')

  // Apply dark mode immediately when toggled
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  const [models, setModels] = useState<Array<{ value: string; label: string }>>([])
  const [saving, setSaving] = useState(false)
  const [loadingModels, setLoadingModels] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    api.getModels()
      .then(({ models }) => {
        const mapped = models.map((m) => ({ value: m.id, label: m.name }))
        setModels(mapped)
        // If the saved model no longer exists, fall back to the first available one
        setModel((prev) => (prev && mapped.some((m) => m.value === prev) ? prev : mapped[0]?.value || ''))
      })
      .catch(() => {})
      .finally(() => setLoadingModels(false))
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateProfile({ name })
      if (user) updateUser({ ...user, name })
      showToast('Profile updated', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }
    setSaving(true)
    try {
      await api.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showToast('Password changed', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to change password', 'error')
    } finally {
      setSaving(false)
    }
  }

  const savePreferences = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const settings = { darkMode, compact, autoPreview, emailUpdates, model }
      await api.updateSettings(settings)
      if (user) updateUser({ ...user, settings })
      showToast('Preferences saved', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to save preferences', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteAccount = async () => {
    try {
      await api.deleteAccount()
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete account', 'error')
    } finally {
      setConfirmDelete(false)
    }
  }


  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-6">Settings</h1>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile" icon={<User className="w-4 h-4" />}>Profile</TabsTrigger>
          <TabsTrigger value="security" icon={<Lock className="w-4 h-4" />}>Security</TabsTrigger>
          <TabsTrigger value="preferences" icon={<Palette className="w-4 h-4" />}>Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-4 max-w-md">
                <Input label="Full name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input label="Username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} disabled />
                <Input label="Email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled helperText="Email cannot be changed." />
                <Button type="submit" loading={saving}>Save changes</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4 max-w-md">
                <Input
                  label="Current password"
                  type="password"
                  name="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  label="New password"
                  type="password"
                  name="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  helperText="At least 8 characters"
                  required
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <Button type="submit" loading={saving}>Update password</Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-6">
            <Card className="border-red-500/30">
              <CardContent className="flex items-center gap-4 justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-400" /> Danger zone
                  </CardTitle>
                  <p className="text-sm text-text2 mt-1">Permanently delete your account and all projects.</p>
                </div>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete account</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Customize your Neurobuild experience</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePreferences} className="space-y-6">
                <Select
                  className="max-w-md"
                  label="Default model"
                  options={models}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={loadingModels ? 'Loading models...' : 'Select a model'}
                />

                <Separator />

                <div className="space-y-4">
                  {[
                    { label: 'Compact layout', desc: 'Use a denser, more compact UI', value: compact, onChange: () => setCompact(!compact), icon: <Monitor className="w-4 h-4" /> },
                    { label: 'Auto-preview on generation', desc: 'Refresh the preview automatically after generating', value: autoPreview, onChange: () => setAutoPreview(!autoPreview), icon: <Code className="w-4 h-4" /> },
                    { label: 'Email updates', desc: 'Receive product and feature emails', value: emailUpdates, onChange: () => setEmailUpdates(!emailUpdates), icon: <Mail className="w-4 h-4" /> },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface2 text-accent">{item.icon}</div>
                        <div>
                          <p className="text-sm font-medium text-text">{item.label}</p>
                          <p className="text-xs text-text3">{item.desc}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={item.onChange}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.value ? 'bg-accent' : 'bg-surface3'}`}
                        role="switch"
                        aria-checked={item.value}
                        aria-label={item.label}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${item.value ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>

                <Separator />

                <Button type="submit" loading={saving}>Save preferences</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
        title="Delete account"
        description="This will permanently delete your account, all projects, and all conversations. This action cannot be undone."
        confirmText="Delete account"
        cancelText="Cancel"
        onConfirm={deleteAccount}
        variant="destructive"
      />
    </div>
  )
}