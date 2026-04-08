import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import './CropArea.css'

const CropArea = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role_id === 1
  const [farms, setFarms] = useState([])
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedArea, setSelectedArea] = useState(null)
  const [detail, setDetail] = useState(null)

  const [filters, setFilters] = useState({ keyword: '', farm_id: '' })

  const fetchMeta = useCallback(async () => {
    try {
      const res = await api.get('/farm/list', { params: { page: 1, pageSize: 1000 } })
      setFarms(res.data?.data || [])
    } catch (e) {
      console.error('加载农场失败', e)
    }
  }, [])

    const fetchAreas = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/crop/list', {
        params: {
          page: 1,
          pageSize: 1000,
          farm_id: filters.farm_id || undefined
        }
      })
      const list = res.data?.data || []
      const map = new Map()
      list.forEach(c => {
        const key = `${c.farm_id || 0}__${c.plant_area || ''}`
        if (!map.has(key)) {
          map.set(key, {
            key,
            farm_id: c.farm_id,
            farm_name: c.farm_name,
            area_name: c.plant_area || '未填写区域',
            crop_count: 0,
            latest_sow_time: null,
            latest_crop_id: null
          })
        }
        const item = map.get(key)
        item.crop_count += 1
        if (c.sow_time) {
          const t = new Date(c.sow_time)
          if (!item.latest_sow_time || t > new Date(item.latest_sow_time)) {
            item.latest_sow_time = c.sow_time
            item.latest_crop_id = c.crop_id
          }
        }
      })
      let arr = Array.from(map.values())
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase()
        arr = arr.filter(a => a.area_name.toLowerCase().includes(kw))
      }
      setAreas(arr)
    } catch (e) {
      console.error('加载区域失败', e)
      alert('加载种植区域失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchMeta()
  }, [fetchMeta])

  useEffect(() => {
    fetchAreas()
  }, [fetchAreas])

  const currentUserFarms = useMemo(() => {
    if (isAdmin) return farms
    return farms.filter(f => f.farm_id === user?.farm_id)
  }, [farms, isAdmin, user])

  const openDetail = async (area) => {
    setSelectedArea(area)
    try {
      const [envRes, devRes] = await Promise.all([
        api.get('/homepage/weather-history', { params: { farm_id: area.farm_id, range: '24h' } }),
        api.get(`/farm/${area.farm_id}/devices`)
      ])
      const envList = envRes.data || []
      let latest = envList.length ? envList[envList.length - 1] : null
      // 兜底：历史为空或最新值缺失时，直接取最新一条
      if (!latest || (latest.temperature == null && latest.humidity == null && latest.soil_ph == null)) {
        try {
          const latestRes = await api.get('/homepage/weather', { params: { farm_id: area.farm_id } })
          latest = latestRes.data || latest
        } catch {
          // ignore
        }
      }
      const devices = (devRes.data || []).filter(d => d.monitor_area === area.area_name)
      setDetail({
        env_latest: latest,
        env_history: envList,
        devices
      })
    } catch (e) {
      console.error('加载区域详情失败', e)
      alert('加载区域详情失败')
    }
  }

  return (
    <div className="crop-area-page">
      <div className="page-header">
        <h2>种植区域管理</h2>
      </div>

      <div className="filter-card">
        <input
          placeholder="按区域名称搜索"
          value={filters.keyword}
          onChange={e => setFilters({ ...filters, keyword: e.target.value })}
        />
        <select
          value={filters.farm_id}
          onChange={e => setFilters({ ...filters, farm_id: e.target.value })}
        >
          <option value="">全部农场</option>
          {currentUserFarms.map(f => (
            <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
          ))}
        </select>
        <button onClick={fetchAreas}>查询</button>
      </div>

      <div className="table-card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>区域名称</th>
                <th>所属农场</th>
                <th>作物数量</th>
                <th>最近播种时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {areas.length === 0 && (
                <tr>
                  <td colSpan="5">暂无数据</td>
                </tr>
              )}
              {areas.map(a => (
                <tr key={a.key}>
                  <td>{a.area_name}</td>
                  <td>{a.farm_name}</td>
                  <td>{a.crop_count}</td>
                  <td>{a.latest_sow_time ? a.latest_sow_time.split('T')[0] : '--'}</td>
                  <td>
                    <button onClick={() => openDetail(a)}>详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedArea && detail && (
        <div className="modal" onClick={() => { setSelectedArea(null); setDetail(null) }}>
          <div className="modal-panel detail" onClick={e => e.stopPropagation()}>
            <h3>{selectedArea.area_name} - 区域详情</h3>
            <div className="detail-grid">
              <div className="card">
                <div className="card-title">基础信息</div>
                <div>农场：{selectedArea.farm_name}</div>
                <div>作物数量：{selectedArea.crop_count}</div>
                <div>最近播种时间：{selectedArea.latest_sow_time ? selectedArea.latest_sow_time.split('T')[0] : '--'}</div>
              </div>
              <div className="card">
                <div className="card-title">实时环境</div>
                <div className="realtime-grid">
                  <div>温度：{detail.env_latest?.temperature ?? '--'}℃</div>
                  <div>空气湿度：{detail.env_latest?.humidity ?? '--'}%</div>
                  <div>土壤pH：{detail.env_latest?.soil_ph ?? '--'}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">设备</div>
              {(detail.devices || []).length === 0 && <div>暂无绑定设备</div>}
              {(detail.devices || []).map(d => (
                <div key={d.device_id} className="device-row">
                  <span>{d.device_name} - {d.device_status}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title">温度趋势（24h）</div>
              <TrendChart data={detail.env_history || []} />
            </div>

            {selectedArea.latest_crop_id && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  className="primary-btn"
                  onClick={() => navigate(`/crop/cycle/detail/${selectedArea.latest_crop_id}`)}
                >
                  查看生长周期记录
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const TrendChart = ({ data }) => {
  if (!data.length) return <div className="chart-empty">暂无趋势数据</div>
  const values = data.map(d => Number(d.temperature)).filter(v => !Number.isNaN(v))
  if (!values.length) return <div className="chart-empty">暂无趋势数据</div>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = data.map((d, i) => {
    const v = Number(d.temperature)
    if (Number.isNaN(v)) return null
    const x = (i / Math.max(data.length - 1, 1)) * 100
    const y = 90 - ((v - min) / range) * 70
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  return (
    <svg viewBox="0 0 100 100" className="trend-svg">
      <polyline fill="none" stroke="#409eff" strokeWidth="1.5" points={points} />
    </svg>
  )
}

export default CropArea
