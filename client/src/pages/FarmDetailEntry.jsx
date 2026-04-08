import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
const FarmDetailEntry = () => {
  const navigate = useNavigate()
  const { user, currentFarmId, currentFarmName, switchGlobalFarm } = useAuth()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('正在跳转到农场详情...')

  useEffect(() => {
    const chooseFarmAndRedirect = async () => {
      try {
        // 1) 优先使用全局农场上下文（管理员切换后的当前农场）
        if (currentFarmId) {
          navigate(`/farm/detail/${currentFarmId}`, { replace: true })
          return
        }

        // 2) 非管理员默认使用所属农场（禁止出现跨农场默认值）
        if (user?.role_id !== 1 && user?.farm_id) {
          navigate(`/farm/detail/${user.farm_id}`, { replace: true })
          return
        }

        // 3) 管理员无全局选择时，读取可访问农场列表首项并同步为全局上下文
        const res = await api.get('/farm/list', {
          params: { page: 1, pageSize: 1 }
        })
        const first = res.data?.data?.[0]
        if (first && first.farm_id) {
          if (user?.role_id === 1) {
            switchGlobalFarm(first.farm_id, first.farm_name || '')
          }
          navigate(`/farm/detail/${first.farm_id}`, { replace: true })
        } else {
          setMessage('暂无农场数据，请先在农场列表中创建农场。')
        }
      } catch (error) {
        console.error('加载农场失败:', error)
        setMessage(error.response?.data?.message || '加载农场失败')
      } finally {
        setLoading(false)
      }
    }
    chooseFarmAndRedirect()
  }, [navigate, user?.role_id, user?.farm_id, currentFarmId, currentFarmName, switchGlobalFarm])

  return (
    <div style={{ padding: 24 }}>
      {loading ? '加载中...' : message}
    </div>
  )
}

export default FarmDetailEntry


