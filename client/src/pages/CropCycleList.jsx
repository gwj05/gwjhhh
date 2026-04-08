import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import './CropCycle.css'

const CropCycleList = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/crop/cycle/list')
      setRows(res.data?.data || [])
    } catch (e) {
      console.error('加载周期列表失败', e)
      alert(e.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const statusBadgeClass = (status) => {
    if (status === '已完成') return 'badge-danger'
    if (status === '异常') return 'badge-danger'
    return 'badge-normal'
  }

  return (
    <div className="cycle-page">
      <div className="cycle-header">
        <h2>生长周期记录</h2>
        <div className="cycle-sub">查看阶段进度、时间轴与环境趋势</div>
      </div>

      <div className="cycle-table-card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state-panel">暂无作物周期数据</div>
        ) : (
          <table className="cycle-table">
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
                  <td>{r.crop_name}</td>
                  <td>{r.plant_area || '--'}</td>
                  <td>{r.farm_name}</td>
                  <td>{r.sow_time ? new Date(r.sow_time).toLocaleDateString() : '--'}</td>
                  <td>{r.expected_harvest_date ? new Date(r.expected_harvest_date).toLocaleDateString() : '--'}</td>
                  <td>
                    <span className="stage-chip">{r.current_stage_label}</span>
                  </td>
                  <td>{r.stage_progress ?? 0}%</td>
                  <td>
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

