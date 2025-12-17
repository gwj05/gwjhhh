import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import './TopBar.css'

const TopBar = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState([])

  // 根据路径生成面包屑
  useEffect(() => {
    const pathMap = {
      '/home': ['首页'],
      '/overview': ['系统概览'],
      '/farm/list': ['农场管理', '农场列表'],
      '/farm/detail': ['农场管理', '农场详情'],
      '/farm/manager': ['农场管理', '负责人管理'],
      '/crop/list': ['作物管理', '作物列表'],
      '/crop/area': ['作物管理', '种植区域管理'],
      '/crop/cycle': ['作物管理', '生长周期记录'],
      '/material/list': ['农资管理', '农资列表'],
      '/material/warning': ['农资管理', '库存预警'],
      '/material/purchase': ['农资管理', '采购记录'],
      '/operation/query': ['农事操作', '操作记录查询'],
      '/operation/fertilize': ['农事操作', '施肥记录'],
      '/operation/irrigate': ['农事操作', '灌溉记录'],
      '/monitor/realtime': ['环境监测', '实时数据'],
      '/monitor/history': ['环境监测', '历史数据'],
      '/monitor/report': ['环境监测', '数据报表'],
      '/warning/device': ['智能预警', '监控设备管理'],
      '/warning/exception': ['智能预警', '作物异常记录'],
      '/warning/push': ['智能预警', '异常推送记录'],
      '/warning/status': ['智能预警', '处理状态统计'],
      '/system/user': ['系统管理', '用户管理'],
      '/system/role': ['系统管理', '角色管理'],
      '/system/permission': ['系统管理', '权限配置']
    }

    const crumbs = pathMap[location.pathname] || ['首页']
    setBreadcrumbs(crumbs)
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
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showUserMenu])

  if (!user) return null

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
    </div>
  )
}

export default TopBar

