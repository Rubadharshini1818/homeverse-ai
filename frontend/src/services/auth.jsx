import { useEffect, useState } from 'react'
import { api, jsonBody } from './api'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function restoreSession() {
      try {
        const result = await api('/auth/me')
        if (active) setUser(result.user)
      } catch (error) {
        if (error.status === 401) {
          try {
            const result = await api('/auth/refresh', { method: 'POST' })
            if (active) setUser(result.user)
          } catch (refreshError) {
            if (refreshError.status !== 401) console.error('Could not restore the HomeVerse session:', refreshError)
          }
        } else {
          console.error('Could not restore the HomeVerse session:', error)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    restoreSession()
    return () => { active = false }
  }, [])

  const login = async (email, password) => {
    const result = await api('/auth/login', {
      method: 'POST',
      body: jsonBody({ email, password })
    })
    setUser(result.user)
    return result.user
  }

  const register = async (registration) => {
    const result = await api('/auth/register', {
      method: 'POST',
      body: jsonBody(registration)
    })
    setUser(result.user)
    return result.user
  }

  const updateProfile = async (updates) => {
    const result = await api('/auth/profile', {
      method: 'PATCH',
      body: jsonBody(updates)
    })
    setUser(result.user)
    return result.user
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, register, updateProfile, logout }}>{children}</AuthContext.Provider>
}
