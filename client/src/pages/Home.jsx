import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import './Home.css'

const Home = () => {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const [switchableRoles, setSwitchableRoles] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    // 获取可切换的角色列表
    fetchSwitchableRoles()
  }, [user, navigate])

  const fetchSwitchableRoles = async () => {
    try {
      const response = await api.get('/user/switchable-roles')
      setSwitchableRoles(response.data)
    } catch (error) {
      console.error('获取可切换角色失败:', error)
    }
  }

  const handleSwitchRole = async (roleId) => {
    setLoading(true)
    try {
      const response = await api.post('/user/switch-role', { role_id: roleId })
      // 更新用户信息和token
      localStorage.setItem('token', response.data.token)
      updateUser({
        ...user,
        role_id: response.data.role.role_id,
        role_name: response.data.role.role_name
      })
      setShowRoleMenu(false)
      // 刷新页面以显示新角色的界面
      window.location.reload()
    } catch (error) {
      alert(error.response?.data?.message || '切换角色失败')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!user) {
    return null
  }

  // 根据角色显示不同的首页内容
  const renderHomeContent = () => {
    const roleId = user.role_id

    if (roleId === 1) {
      // 管理员首页
      return (
        <div className="home-content">
          <div className="welcome-section">
            <h2>欢迎，管理员 {user.real_name}</h2>
            <p>您拥有系统的最高权限，可以管理所有农场、用户和数据</p>
          </div>
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <div className="card-icon">👥</div>
              <h3>用户管理</h3>
              <p>管理系统所有用户账户</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">🏢</div>
              <h3>农场管理</h3>
              <p>查看和管理所有农场信息</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">📊</div>
              <h3>数据统计</h3>
              <p>查看系统整体数据报表</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">⚙️</div>
              <h3>系统设置</h3>
              <p>配置系统参数和权限</p>
            </div>
          </div>
        </div>
      )
    } else if (roleId === 2) {
      // 运维人员首页
      return (
        <div className="home-content">
          <div className="welcome-section">
            <h2>欢迎，运维人员 {user.real_name}</h2>
            <p>您负责系统的日常维护和设备管理</p>
          </div>
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <div className="card-icon">🔧</div>
              <h3>设备管理</h3>
              <p>监控和管理农场设备</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">📡</div>
              <h3>监控设备</h3>
              <p>查看监控设备状态</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">⚠️</div>
              <h3>异常处理</h3>
              <p>处理作物异常情况</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">📈</div>
              <h3>环境监测</h3>
              <p>查看环境监测数据</p>
            </div>
          </div>
        </div>
      )
    } else {
      // 普通用户首页
      return (
        <div className="home-content">
          <div className="welcome-section">
            <h2>欢迎，{user.real_name}</h2>
            <p>您可以查看农场信息和进行日常操作</p>
          </div>
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <div className="card-icon">🌾</div>
              <h3>我的农场</h3>
              <p>查看农场基本信息</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">🌱</div>
              <h3>作物管理</h3>
              <p>查看和管理作物信息</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">📝</div>
              <h3>操作记录</h3>
              <p>查看农事操作记录</p>
            </div>
            <div className="dashboard-card">
              <div className="card-icon">🌡️</div>
              <h3>环境数据</h3>
              <p>查看环境监测数据</p>
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="home-container">
      <header className="home-header">
        <div className="header-left">
          <div className="logo">🌾</div>
          <h1>智慧农业管理系统</h1>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-name">{user.real_name}</span>
            <span className="user-role">({user.role_name})</span>
          </div>
          {switchableRoles.length > 0 && (
            <div className="role-switcher">
              <button
                className="role-switch-button"
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                disabled={loading}
              >
                <span className="dropdown-icon">▼</span>
              </button>
              {showRoleMenu && (
                <div className="role-menu">
                  {switchableRoles.map(role => (
                    <div
                      key={role.role_id}
                      className="role-menu-item"
                      onClick={() => handleSwitchRole(role.role_id)}
                    >
                      {role.role_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="logout-button" onClick={handleLogout}>
            退出
          </button>
        </div>
      </header>
      <main className="home-main">
        {renderHomeContent()}
      </main>
    </div>
  )
}

export default Home

