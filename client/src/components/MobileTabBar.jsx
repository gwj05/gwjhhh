import React, { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const MobileTabBar = ({ onOpenMenu = () => {} }) => {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const tabs = useMemo(() => {
    if (!user) return []
    const role = Number(user.role_id || 0)
    const smartTab = role === 1 || role === 2
      ? { key: 'overview', label: '预测', icon: '🧠', path: '/overview' }
      : { key: 'warning', label: '预警', icon: '⚠️', path: '/warning/exception' }
    const manageTab = role === 1 || role === 2
      ? { key: 'farm', label: '农场', icon: '🏢', path: '/farm/list' }
      : { key: 'crop', label: '作物', icon: '🌾', path: '/crop/list' }
    return [
      { key: 'home', label: '首页', icon: '🏠', path: '/home' },
      { key: 'board', label: '看板', icon: '📊', path: '/homepage' },
      smartTab,
      manageTab
    ]
  }, [user])

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)

  return (
    <nav className="mobile-tabbar" aria-label="底部导航">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`mobile-tab-btn ${isActive(tab.path) ? 'active' : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="mobile-tab-icon" aria-hidden="true">{tab.icon}</span>
          <span className="mobile-tab-label">{tab.label}</span>
        </button>
      ))}
      <button type="button" className="mobile-tab-btn" onClick={onOpenMenu}>
        <span className="mobile-tab-icon" aria-hidden="true">☰</span>
        <span className="mobile-tab-label">菜单</span>
      </button>
    </nav>
  )
}

export default MobileTabBar

