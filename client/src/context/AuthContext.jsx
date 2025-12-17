import React, { createContext, useState, useContext, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 检查本地存储的token
    const token = localStorage.getItem('token')
    if (token) {
      // 验证token并获取用户信息
      axios.get('/api/user/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          setUser(res.data)
        })
        .catch(() => {
          localStorage.removeItem('token')
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])

  const login = (token, userData) => {
    localStorage.setItem('token', token)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const updateUser = (userData) => {
    setUser(userData)
  }

  const value = {
    user,
    login,
    logout,
    updateUser,
    loading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

