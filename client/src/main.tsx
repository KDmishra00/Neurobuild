import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import './index.css'

// Apply dark mode on initial load from localStorage
const storedTheme = localStorage.getItem('theme')
let initialDark = true
if (storedTheme !== null) {
  initialDark = storedTheme === 'dark'
} else {
  const storedUser = localStorage.getItem('user')
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser)
      if (typeof user?.settings?.darkMode === 'boolean') {
        initialDark = user.settings.darkMode
      }
    } catch {}
  }
}

if (initialDark) {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)