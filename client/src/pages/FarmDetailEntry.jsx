import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'

const FarmDetailEntry = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('正在跳转到农场详情...')

  useEffect(() => {
    const fetchFirstFarm = async () => {
      try {
        const res = await api.get('/farm/list', {
          params: { page: 1, pageSize: 1 }
        })
        const first = res.data?.data?.[0]
        if (first && first.farm_id) {
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
    fetchFirstFarm()
  }, [navigate])

  return (
    <div style={{ padding: 24 }}>
      {loading ? '加载中...' : message}
    </div>
  )
}

export default FarmDetailEntry


