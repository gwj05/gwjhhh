import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../ui/Toast/ToastProvider'
import { getErrorMessage } from '../utils/errorMessage'
import './CropCycle.css'

const CropCycleList = () => {
  const { user, currentFarmId, currentFarmName } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])

  const isAdmin = user?.role_id === 1

  const load = useCallback(async (farmId, roleId) => {
    try {
      setLoading(true)
      const isAdminRole = roleId === 1
      const params = {}
      // 管理员：farmId 为空时视为“全部农场”，不传参数；有值则按农场过滤
      if (!isAdminRole && !farmId) {
        setRows([])
        return
      }
      if (farmId) params.farm_id = farmId
      const res = await api.get('/crop/cycle/list', { params })
      setRows(res.data?.data || [])
    } catch (e) {
      console.error('加载周期列表失败', e)
      toast.error(getErrorMessage(e, '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    // farmId 变化时自动刷新（核心）；管理员 farm 为空 = 查看全部农场
    load(currentFarmId, user?.role_id)
  }, [load, currentFarmId, user?.role_id])

  const statusBadgeClass = (status) => {
    if (status === '已完成') return 'badge-danger'
    if (status === '异常') return 'badge-danger'
    return 'badge-normal'
  }

  return (
    <div className="cycle-page">
      <div className="cycle-header">
        <h2>生长周期记录</h2>
        <div className="cycle-sub">
          查看阶段进度、时间轴与环境趋势
          {currentFarmId ? (
            <span style={{ marginLeft: 10, color: 'rgba(15,23,42,0.72)', fontWeight: 700 }}>
              当前农场：{currentFarmName || `#${currentFarmId}`}
            </span>
          ) : isAdmin ? (
            <span style={{ marginLeft: 10, color: 'rgba(15,23,42,0.72)', fontWeight: 700 }}>
              当前农场：全部
            </span>
          ) : null}
        </div>
      </div>

      <div className="cycle-table-card">
        {!currentFarmId && !isAdmin ? (
          <div className="empty-state-panel">请先选择农场</div>
        ) : loading ? (
          <div className="loading">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state-panel">当前农场暂无生长周期数据</div>
        ) : (
          <table className="cycle-table mobile-card-table">
            <thead>
              <tr>
                <th>作物</th>
                <th>种植区域</th>
                <th>农场</th>
                <th>种植时间</th>
                <th>预计收获</th>
                <th>阶段</th>
                <th>进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.crop_id}>
                  <td data-label="作物">{r.crop_name}</td>
                  <td data-label="种植区域">{r.plant_area || '--'}</td>
                  <td data-label="农场">{r.farm_name}</td>
                  <td data-label="种植时间">{r.sow_time ? new Date(r.sow_time).toLocaleDateString() : '--'}</td>
                  <td data-label="预计收获">{r.expected_harvest_date ? new Date(r.expected_harvest_date).toLocaleDateString() : '--'}</td>
                  <td data-label="阶段">
                    <span className="stage-chip">{r.current_stage_label}</span>
                  </td>
                  <td data-label="进度">{r.stage_progress ?? 0}%</td>
                  <td data-label="操作">
                    <button
                      className="primary-btn"
                      onClick={() => navigate(`/crop/cycle/detail/${r.crop_id}`)}
                    >
                      进入记录
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default CropCycleList

