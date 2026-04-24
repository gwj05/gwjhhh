import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

const Dashboard = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleCardClick = (path) => {
    navigate(path)
  }

  if (!user) return null

  const roleId = user.role_id

  // 根据角色显示不同的功能卡片
  const getCards = () => {
    if (roleId === 1) {
      // 超级管理员
      return [
        {
          icon: '👥',
          title: '用户管理',
          description: '管理系统所有用户账户',
          path: '/system/user'
        },
        {
          icon: '🏢',
          title: '农场管理',
          description: '查看和管理所有农场信息',
          path: '/farm/list'
        },
        {
          icon: '📊',
          title: '智能预测',
          description: '查看预测与决策辅助看板',
          path: '/overview'
        },
        {
          icon: '⚙️',
          title: '系统设置',
          description: '配置系统参数和权限',
          path: '/system/permission'
        }
      ]
    } else if (roleId === 2) {
      // 农场管理员
      return [
        {
          icon: '🏢',
          title: '农场管理',
          description: '管理农场基本信息',
          path: '/farm/list'
        },
        {
          icon: '🌾',
          title: '作物管理',
          description: '管理作物种植信息',
          path: '/crop/list'
        },
        {
          icon: '📦',
          title: '农资管理',
          description: '管理农资库存和采购',
          path: '/material/list'
        },
        {
          icon: '🌡️',
          title: '环境监测',
          description: '查看环境监测数据',
          path: '/monitor/realtime'
        }
      ]
    } else {
      // 普通用户
      return [
        {
          icon: '🌾',
          title: '我的农场',
          description: '查看农场基本信息',
          path: '/farm/detail'
        },
        {
          icon: '🌱',
          title: '作物管理',
          description: '查看和管理作物信息',
          path: '/crop/list'
        },
        {
          icon: '📝',
          title: '操作记录',
          description: '查看农事操作记录',
          path: '/operation/query'
        },
        {
          icon: '🌡️',
          title: '环境数据',
          description: '查看环境监测数据',
          path: '/monitor/realtime'
        }
      ]
    }
  }

  const getRoleText = () => {
    const roleMap = {
      1: '超级管理员',
      2: '农场管理员',
      3: '普通用户'
    }
    return roleMap[roleId] || '用户'
  }

  const getPermissionText = () => {
    if (roleId === 1) {
      return '您拥有系统的最高权限，可以管理所有农场、用户和数据'
    } else if (roleId === 2) {
      return '您可以管理所属农场的作物、农资和操作记录'
    } else {
      return '您可以查看农场信息和进行日常操作'
    }
  }

  return (
    <div className="dashboard">
      <div className="welcome-section">
        <h1>欢迎，{getRoleText()} {user.real_name}</h1>
        <p>{getPermissionText()}</p>
      </div>
      <div className="dashboard-grid">
        {getCards().map((card, index) => (
          <div
            key={index}
            className="dashboard-card"
            onClick={() => handleCardClick(card.path)}
          >
            <div className="card-icon">{card.icon}</div>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Dashboard

