import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import { GLOBAL_FARM_CHANGED_EVENT } from '../utils/globalFarm'
import { getBreadcrumbs } from '../routes/routeConfig'
import './TopBar.css'
const TopBar = () => {
  const { user, logout, currentFarmId, currentFarmName, switchGlobalFarm } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState([])
  const [farmToast, setFarmToast] = useState('')
  const [showFarmMenu, setShowFarmMenu] = useState(false)
  const [farmOptions, setFarmOptions] = useState([])
  const [farmLoading, setFarmLoading] = useState(false)
  // 根据路径生成面包屑
  useEffect(() => {
    setBreadcrumbs(getBreadcrumbs(location.pathname))
  }, [location.pathname])

  const handleLogout = async () => {
    try {
      await api.post('/user/logout')
    } catch (error) {
      console.error('退出失败:', error)
    } finally {
      logout()
      navigate('/login')
    }
  }

  const handleUserMenuClick = (action) => {
    setShowUserMenu(false)
    if (action === 'logout') {
      handleLogout()
    } else if (action === 'profile') {
      // 跳转到个人信息页面
      navigate('/profile')
    } else if (action === 'password') {
      // 跳转到修改密码页面
      navigate('/password')
    }
  }

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showUserMenu && !e.target.closest('.user-menu-container')) {
        setShowUserMenu(false)
      }
      if (showFarmMenu && !e.target.closest('.farm-menu-container')) {
        setShowFarmMenu(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showUserMenu, showFarmMenu])

  useEffect(() => {
    let timer = null
    const onFarmChanged = (e) => {
      const name = e.detail?.farm_name || (e.detail?.farm_id ? `农场#${e.detail.farm_id}` : '全部农场')
      setFarmToast(`已切换到 ${name}`)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setFarmToast(''), 2200)
    }
    window.addEventListener(GLOBAL_FARM_CHANGED_EVENT, onFarmChanged)
    return () => {
      window.removeEventListener(GLOBAL_FARM_CHANGED_EVENT, onFarmChanged)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  if (!user) return null

  const farmDisplayName = useMemo(() => {
    if (user.role_id === 1) return currentFarmName || (currentFarmId ? `农场#${currentFarmId}` : '全部农场')
    return currentFarmName || (user.farm_id ? `农场#${user.farm_id}` : '我的农场')
  }, [user.role_id, user.farm_id, currentFarmId, currentFarmName])

  const openFarmMenu = async () => {
    if (user.role_id !== 1) return
    setShowFarmMenu((v) => !v)
    if (showFarmMenu) return
    if (farmOptions.length > 0) return
    try {
      setFarmLoading(true)
      const res = await api.get('/farm/list', { params: { page: 1, pageSize: 50, sortField: 'farm_name', sortOrder: 'asc' } })
      setFarmOptions(res.data?.data || [])
    } catch (e) {
      console.error('获取农场列表失败:', e)
    } finally {
      setFarmLoading(false)
    }
  }

  const onPickFarm = (farmId, farmName) => {
    switchGlobalFarm(farmId, farmName || '')
    setShowFarmMenu(false)
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="system-logo">
          <span className="logo-icon">🌾</span>
          <span className="system-name">智慧农业综合管理系统</span>
        </div>
        <div className="breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <span key={index}>
              {index > 0 && <span className="breadcrumb-separator"> / </span>}
              <span className={index === breadcrumbs.length - 1 ? 'breadcrumb-current' : ''}>
                {crumb}
              </span>
            </span>
          ))}
        </div>
        <div className={`farm-menu-container ${user.role_id === 1 ? 'is-admin' : ''}`}>
          <button
            type="button"
            className={`global-farm-indicator ${user.role_id === 1 ? 'is-clickable' : ''}`}
            onClick={openFarmMenu}
            title={user.role_id === 1 ? '点击切换全局农场' : '当前农场'}
          >
            <span className="farm-pin" aria-hidden="true">📍</span>
            <span className="farm-label">当前农场</span>
            <strong className="farm-name">{farmDisplayName}</strong>
            {user.role_id === 1 ? <span className={`farm-arrow ${showFarmMenu ? 'expanded' : ''}`}>▼</span> : null}
          </button>
          {user.role_id === 1 && showFarmMenu ? (
            <div className="farm-dropdown">
              <button type="button" className="farm-dd-item" onClick={() => onPickFarm('', '')}>
                <span className="farm-dd-name">全部农场</span>
                <span className="farm-dd-meta">查看所有农场数据</span>
              </button>
              <div className="farm-dd-divider" />
              {farmLoading ? (
                <div className="farm-dd-loading">加载中...</div>
              ) : farmOptions.length === 0 ? (
                <div className="farm-dd-empty">暂无可选农场</div>
              ) : (
                farmOptions.map((f) => (
                  <button
                    key={f.farm_id}
                    type="button"
                    className={`farm-dd-item ${String(currentFarmId) === String(f.farm_id) ? 'active' : ''}`}
                    onClick={() => onPickFarm(f.farm_id, f.farm_name)}
                  >
                    <span className="farm-dd-name">{f.farm_name}</span>
                    <span className="farm-dd-meta">{f.address || `农场#${f.farm_id}`}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="topbar-right">
        <button className="topbar-button">客服</button>
        <button className="topbar-button">快捷功能</button>
        <div className="user-menu-container">
          <div
            className="user-info"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <span className="user-avatar">{user.real_name.charAt(0)}</span>
            <span className="user-name">{user.real_name}</span>
            <span className={`user-arrow ${showUserMenu ? 'expanded' : ''}`}>▼</span>
          </div>
          {showUserMenu && (
            <div className="user-dropdown">
              <div
                className="dropdown-item"
                onClick={() => handleUserMenuClick('profile')}
              >
                个人信息
              </div>
              <div
                className="dropdown-item"
                onClick={() => handleUserMenuClick('password')}
              >
                修改密码
              </div>
              <div className="dropdown-divider"></div>
              <div
                className="dropdown-item logout"
                onClick={() => handleUserMenuClick('logout')}
              >
                退出登录
              </div>
            </div>
          )}
        </div>
      </div>
      {farmToast ? <div className="farm-switch-toast">{farmToast}</div> : null}
    </div>
  )
}

export default TopBar

