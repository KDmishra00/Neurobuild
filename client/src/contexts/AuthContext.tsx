import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (username: string, name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: User) => void
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token')
      const storedUser = localStorage.getItem('user')
      
      if (storedToken && storedUser) {
        try {
          setToken(storedToken)
          setUser(JSON.parse(storedUser))
          
          // Verify token is still valid by fetching user data
          const response = await api.getMe()
          if (response.user) {
            setUser(response.user)
            localStorage.setItem('user', JSON.stringify(response.user))
          }
        } catch {
          // Token invalid, clear storage
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          setToken(null)
          setUser(null)
        }
      }
      setIsLoading(false)
    }
    
    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    const response = await api.login({ email, password })
    const { token: newToken, user: newUser } = response
    
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const register = async (username: string, name: string, email: string, password: string) => {
    const response = await api.register({ username, name, email, password })
    const { token: newToken, user: newUser } = response
    
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setToken(null)
      setUser(null)
    }
  }

  const updateUser = (updatedUser: User) => {
    localStorage.setItem('user', JSON.stringify(updatedUser))
    setUser(updatedUser)
  }

  const clearError = () => {
    // For future use if needed
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateUser, clearError }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}