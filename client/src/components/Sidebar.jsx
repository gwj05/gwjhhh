import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Sidebar.css'

const Sidebar = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState({})

  // 从本地存储恢复展开状态
  useEffect(() => {
    const saved = localStorage.getItem('sidebarExpanded')
    if (saved) {
      setExpandedMenus(JSON.parse(saved))
    }
  }, [])

  // 保存展开状态到本地存储
  useEffect(() => {
    localStorage.setItem('sidebarExpanded', JSON.stringify(expandedMenus))
  }, [expandedMenus])

  // 菜单配置
  const menuConfig = [
    {
      key: 'home',
      title: '首页',
      icon: '🏠',
      path: '/home',
      children: null,
      roles: [1, 2, 3] // 所有角色可见
    },
    {
      key: 'overview',
      title: '系统概览',
      icon: '📊',
      path: '/overview',
      children: null,
      roles: [1, 2] // 超级管理员、农场管理员可见
    },
    {
      key: 'farm',
      title: '农场管理',
      icon: '🏢',
      path: null,
      children: [
        { key: 'farm-list', title: '农场列表', path: '/farm/list', roles: [1, 2] },
        { key: 'farm-detail', title: '农场详情', path: '/farm/detail', roles: [1, 2] },
        { key: 'farm-manager', title: '负责人管理', path: '/farm/manager', roles: [1, 2] }
      ],
      roles: [1, 2]
    },
    {
      key: 'crop',
      title: '作物管理',
      icon: '🌾',
      path: null,
      children: [
        { key: 'crop-list', title: '作物列表', path: '/crop/list', roles: [1, 2, 3] },
        { key: 'crop-area', title: '种植区域管理', path: '/crop/area', roles: [1, 2, 3] },
        { key: 'crop-cycle', title: '生长周期记录', path: '/crop/cycle', roles: [1, 2, 3] }
      ],
      roles: [1, 2, 3]
    },
    {
      key: 'material',
      title: '农资管理',
      icon: '📦',
      path: null,
      children: [
        { key: 'material-list', title: '农资列表', path: '/material/list', roles: [1, 2] },
        { key: 'material-warning', title: '库存预警', path: '/material/warning', roles: [1, 2] },
        { key: 'material-purchase', title: '采购记录', path: '/material/purchase', roles: [1, 2] }
      ],
      roles: [1, 2]
    },
    {
      key: 'operation',
      title: '农事操作',
      icon: '🔧',
      path: null,
      children: [
        { key: 'operation-query', title: '操作记录查询', path: '/operation/query', roles: [1, 2, 3] },
        { key: 'operation-fertilize', title: '施肥记录', path: '/operation/fertilize', roles: [1, 2, 3] },
        { key: 'operation-irrigate', title: '灌溉记录', path: '/operation/irrigate', roles: [1, 2, 3] }
      ],
      roles: [1, 2, 3]
    },
    {
      key: 'monitor',
      title: '环境监测',
      icon: '🌡️',
      path: null,
      children: [
        { key: 'monitor-realtime', title: '实时数据', path: '/monitor/realtime', roles: [1, 2] },
        { key: 'monitor-history', title: '历史数据', path: '/monitor/history', roles: [1, 2] },
        { key: 'monitor-report', title: '数据报表', path: '/monitor/report', roles: [1, 2] }
      ],
      roles: [1, 2]
    },
    {
      key: 'warning',
      title: '智能预警',
      icon: '⚠️',
      path: null,
      children: [
        { key: 'warning-device', title: '监控设备管理', path: '/warning/device', roles: [1, 2] },
        { key: 'warning-exception', title: '作物异常记录', path: '/warning/exception', roles: [1, 2] },
        { key: 'warning-push', title: '异常推送记录', path: '/warning/push', roles: [1, 2] },
        { key: 'warning-status', title: '处理状态统计', path: '/warning/status', roles: [1, 2] }
      ],
      roles: [1, 2]
    },
    {
      key: 'system',
      title: '系统管理',
      icon: '⚙️',
      path: null,
      children: [
        { key: 'system-user', title: '用户管理', path: '/system/user', roles: [1] },
        { key: 'system-role', title: '角色管理', path: '/system/role', roles: [1] },
        { key: 'system-permission', title: '权限配置', path: '/system/permission', roles: [1] }
      ],
      roles: [1] // 仅超级管理员可见
    }
  ]

  // 检查菜单是否可见
  const isMenuVisible = (menu) => {
    if (!user) return false
    return menu.roles.includes(user.role_id)
  }

  // 检查子菜单是否可见
  const hasVisibleChildren = (menu) => {
    if (!menu.children) return false
    return menu.children.some(child => isMenuVisible(child))
  }

  // 切换菜单展开/折叠
  const toggleMenu = (key) => {
    setExpandedMenus(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  // 检查当前路径是否匹配
  const isActive = (path) => {
    if (!path) return false
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  // 检查父菜单是否应该展开（如果子菜单中有当前页）
  useEffect(() => {
    const shouldExpand = {}
    menuConfig.forEach(menu => {
      if (menu.children) {
        const hasActiveChild = menu.children.some(child => isActive(child.path))
        if (hasActiveChild) {
          shouldExpand[menu.key] = true
        }
      }
    })
    setExpandedMenus(prev => ({ ...prev, ...shouldExpand }))
  }, [location.pathname])

  const handleMenuClick = (menu) => {
    if (menu.children) {
      // 有子菜单，切换展开/折叠
      toggleMenu(menu.key)
    } else if (menu.path) {
      // 无子菜单，直接跳转
      navigate(menu.path)
    }
  }

  const handleChildClick = (e, childPath) => {
    e.stopPropagation()
    navigate(childPath)
  }

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        {menuConfig.map(menu => {
          if (!isMenuVisible(menu) || (menu.children && !hasVisibleChildren(menu))) {
            return null
          }

          const isExpanded = expandedMenus[menu.key]
          const hasChildren = menu.children && menu.children.length > 0

          return (
            <div key={menu.key} className="menu-item">
              <div
                className={`menu-title ${isActive(menu.path) ? 'active' : ''}`}
                onClick={() => handleMenuClick(menu)}
              >
                <span className="menu-icon">{menu.icon}</span>
                <span className="menu-text">{menu.title}</span>
                {hasChildren && (
                  <span className={`menu-arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
                )}
              </div>
              {hasChildren && isExpanded && (
                <div className="menu-children">
                  {menu.children.map(child => {
                    if (!isMenuVisible(child)) return null
                    return (
                      <div
                        key={child.key}
                        className={`menu-child ${isActive(child.path) ? 'active' : ''}`}
                        onClick={(e) => handleChildClick(e, child.path)}
                      >
                        {child.title}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Sidebar

