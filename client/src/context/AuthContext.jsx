import React, { createContext, useState, useContext, useEffect } from 'react'
import axios from 'axios'
import {
  clearStoredGlobalFarm,
  getStoredGlobalFarmId,
  getStoredGlobalFarmName,
  setStoredGlobalFarm
} from '../utils/globalFarm'

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
  const [currentFarmId, setCurrentFarmId] = useState('')
  const [currentFarmName, setCurrentFarmName] = useState('')

  const applyFarmForUser = (u) => {
    if (!u) {
      setCurrentFarmId('')
      setCurrentFarmName('')
      clearStoredGlobalFarm()
      return
    }
    // 管理员：优先使用已存储的全局农场选择（可为空，表示查看全部）
    if (u.role_id === 1) {
      const savedId = getStoredGlobalFarmId()
      const savedName = getStoredGlobalFarmName()
      setCurrentFarmId(savedId || '')
      setCurrentFarmName(savedName || '')
      return
    }
    // 非管理员：固定所属农场，禁止切换
    const fixedId = u.farm_id != null ? String(u.farm_id) : ''
    const fixedName = u.farm_name || ''
    setCurrentFarmId(fixedId)
    setCurrentFarmName(fixedName)
    if (fixedId) setStoredGlobalFarm(fixedId, fixedName)
  }

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
          applyFarmForUser(res.data)
        })
        .catch(() => {
          localStorage.removeItem('token')
          clearStoredGlobalFarm()
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      clearStoredGlobalFarm()
      setLoading(false)
    }
  }, [])

  const login = (token, userData) => {
    localStorage.setItem('token', token)
    setUser(userData)
    applyFarmForUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setCurrentFarmId('')
    setCurrentFarmName('')
    clearStoredGlobalFarm()
  }

  const updateUser = (userData) => {
    setUser(userData)
    applyFarmForUser(userData)
  }

  const switchGlobalFarm = (farmId, farmName = '') => {
    if (user?.role_id !== 1) return
    const idStr = farmId == null || farmId === '' ? '' : String(farmId)
    setCurrentFarmId(idStr)
    setCurrentFarmName(farmName || '')
    if (idStr) setStoredGlobalFarm(idStr, farmName || '')
    else clearStoredGlobalFarm()
  }

  const value = {
    user,
    login,
    logout,
    updateUser,
    currentFarmId,
    currentFarmName,
    switchGlobalFarm,
    loading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

