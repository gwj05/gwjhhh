import React, { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { notifyWarningChanged } from '../utils/warningEvents'
import { useAuth } from '../context/AuthContext'
import './MonitorPages.css'

const REFRESH_MS = 5000

const MonitorRealtime = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [farms, setFarms] = useState([])
  const [areas, setAreas] = useState([])
  const [farmId, setFarmId] = useState('')
  const [plantArea, setPlantArea] = useState('')
  const [panels, setPanels] = useState([])
  const [hints, setHints] = useState([])
  const [lastAt, setLastAt] = useState('')
  const [toast, setToast] = useState(null)

  const loadAreas = useCallback(async (fid) => {
    try {
      const res = await api.get('/environment/areas', { params: { farm_id: fid || undefined } })
      setFarms(res.data?.farms || [])
      setAreas(res.data?.areas || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) {
      loadAreas(farmId || undefined)
    } else {
      loadAreas()
    }
  }, [isAdmin, farmId, loadAreas])

  useEffect(() => {
    if (isAdmin && !farmId && farms.length === 1) {
      setFarmId(String(farms[0].farm_id))
    }
  }, [isAdmin, farms, farmId])

  const fetchLatest = useCallback(async (opts = {}) => {
    try {
      const res = await api.get('/environment/latest', {
        params: {
          farm_id: isAdmin ? farmId || undefined : undefined,
          plant_area: plantArea || undefined
        }
      })
      setPanels(res.data?.panels || [])
      setHints(res.data?.hints || [])
      setLastAt(res.data?.generated_at || '')
      if (opts.notifyHome) notifyWarningChanged()
    } catch (e) {
      setToast({ kind: 'error', message: e.response?.data?.message || '加载失败' })
      setTimeout(() => setToast(null), 2600)
    }
  }, [isAdmin, farmId, plantArea])

  useEffect(() => {
    fetchLatest()
  }, [fetchLatest])

  useEffect(() => {
    const t = setInterval(fetchLatest, REFRESH_MS)
    return () => clearInterval(t)
  }, [fetchLatest])

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <div>
          <h2>实时环境监测</h2>
          <p className="monitor-sub">
            展示温度、湿度、土壤湿度、光照等指标；每 {REFRESH_MS / 1000} 秒自动刷新。湿度/土壤偏低时将提示灌溉建议；极端温度会在后台写入环境异常记录（去重）。
          </p>
        </div>
        <span className="refresh-hint">
          {lastAt ? `最近同步：${new Date(lastAt).toLocaleString()}` : ''}
        </span>
      </div>

      <div className="filter-bar">
        {isAdmin ? (
          <div className="filter-item">
            <label>农场</label>
            <select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPlantArea('') }}>
              <option value="">全部农场</option>
              {farms.map((f) => (
                <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="filter-item">
          <label>区域</label>
          <select value={plantArea} onChange={(e) => setPlantArea(e.target.value)}>
            <option value="">全部区域</option>
            {areas.map((a) => (
              <option key={a.area_name} value={a.area_name}>{a.area_name}</option>
            ))}
          </select>
        </div>
        <button type="button" className="primary-btn" onClick={() => fetchLatest({ notifyHome: true })}>
          立即刷新
        </button>
      </div>

      {hints.length > 0 ? (
        <div className="alert-strip">
          {hints.slice(0, 12).map((h, i) => (
            <div key={i} className={`alert-item ${h.type === 'humidity' || h.type === 'soil_moisture' ? 'warn' : ''}`}>
              <strong>{h.farm_name} · {h.plant_area}</strong>：{h.text}
            </div>
          ))}
        </div>
      ) : null}

      {panels.length === 0 ? (
        <div className="panel-card">暂无监测数据，请确认已存在农场且模拟采集已运行约 1 分钟。</div>
      ) : (
        <div className="panels-grid">
          {panels.map((p) => (
            <div
              key={`${p.farm_id}-${p.plant_area}`}
              className={`panel-card ${p.overall_status === 'abnormal' ? 'abnormal' : ''}`}
            >
              <div className="panel-head">
                <div>
                  <div className="panel-title">{p.farm_name}</div>
                  <div className="panel-meta">{p.plant_area}</div>
                  <div className="panel-meta">
                    采集时间：{p.monitor_time ? new Date(p.monitor_time).toLocaleString() : '--'}
                  </div>
                </div>
                <span className={`badge ${p.overall_status === 'normal' ? 'badge-ok' : 'badge-bad'}`}>
                  {p.overall_status === 'normal' ? '正常' : p.overall_status === 'abnormal' ? '异常关注' : '未知'}
                </span>
              </div>
              {p.irrigation_suggest ? (
                <div className="irrigation-banner">{p.irrigation_suggest}</div>
              ) : null}
              <div className="metrics-grid" style={{ marginTop: 12 }}>
                {(p.metrics || []).map((m) => (
                  <div key={m.key} className={`metric-cell ${m.status === 'abnormal' ? 'bad' : ''}`}>
                    <div className="metric-label">{m.label}</div>
                    <div className="metric-value">
                      {m.value != null ? m.value : '--'}
                      <span className="metric-unit">{m.unit || ''}</span>
                    </div>
                    {m.suggest ? <div className="metric-tip">{m.suggest}</div> : null}
                    {m.message && !m.suggest ? <div className="metric-tip">{m.message}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast ? <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div> : null}
    </div>
  )
}

export default MonitorRealtime
