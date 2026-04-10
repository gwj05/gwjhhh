import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useAuth } from '../context/AuthContext'
import { INVENTORY_CHANGED_EVENT } from '../utils/inventoryEvents'
import { routeConfig } from '../routes/routeConfig'
import { useFarmKey } from '../hooks/useFarmKey'
import { api as storeApi, useGetHomeStockWarningsQuery } from '../store/services/api'
import './Sidebar.css'

const Sidebar = () => {
  const { user } = useAuth()
  const dispatch = useDispatch()
  const farmKey = useFarmKey()
  const navigate = useNavigate()
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState({})

  const { data: stockWarnData } = useGetHomeStockWarningsQuery(farmKey, {
    skip: !farmKey,
    pollingInterval: 60_000,
    refetchOnFocus: true,
    refetchOnReconnect: true
  })
  const homeStockAlertCount = Number(stockWarnData?.total ?? 0)

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

  useEffect(() => {
    const onInv = () =>
      dispatch(storeApi.util.invalidateTags(['StockWarnings', 'Homepage']))
    window.addEventListener(INVENTORY_CHANGED_EVENT, onInv)
    return () => window.removeEventListener(INVENTORY_CHANGED_EVENT, onInv)
  }, [dispatch])

  // 菜单配置：来自 routeConfig 单一真相源
  const menuConfig = routeConfig

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
                {menu.key === 'homepage' && homeStockAlertCount > 0 ? (
                  <span className="sidebar-nav-dot" title={`${homeStockAlertCount} 条库存预警`} />
                ) : null}
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

