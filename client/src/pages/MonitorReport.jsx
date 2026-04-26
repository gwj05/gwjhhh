import React, { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './MonitorPages.css'

const fmt = (v, d = 1) => (v != null && !Number.isNaN(Number(v)) ? Number(v).toFixed(d) : '--')

const MonitorReport = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [farms, setFarms] = useState([])
  const [areas, setAreas] = useState([])
  const [farmId, setFarmId] = useState('')
  const [plantArea, setPlantArea] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [report, setReport] = useState(null)
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
    if (isAdmin) loadAreas(farmId || undefined)
    else loadAreas()
  }, [isAdmin, farmId, loadAreas])

  useEffect(() => {
    if (isAdmin && !farmId && farms.length === 1) setFarmId(String(farms[0].farm_id))
  }, [isAdmin, farms, farmId])

  const loadReport = useCallback(async () => {
    const fid = isAdmin ? farmId : undefined
    if (isAdmin && !fid) {
      setToast({ kind: 'error', message: '请选择农场' })
      setTimeout(() => setToast(null), 2200)
      return
    }
    try {
      const res = await api.get('/environment/report', {
        params: {
          farm_id: isAdmin ? farmId : undefined,
          plant_area: plantArea || undefined,
          from,
          to
        }
      })
      setReport(res.data)
    } catch (e) {
      setToast({ kind: 'error', message: e.response?.data?.message || '加载失败' })
      setTimeout(() => setToast(null), 2600)
    }
  }, [isAdmin, farmId, plantArea, from, to])

  useEffect(() => {
    if (isAdmin && !farmId) return
    loadReport()
  }, [isAdmin, farmId, plantArea, from, to, loadReport])

  const avg = report?.averages || {}

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <div>
          <h2>数据报表</h2>
          <p className="monitor-sub">
            统计时段内平均值、极值、前后半段趋势对比，以及环境异常记录次数（温度异常、湿度过低等由监测联动写入）。
          </p>
        </div>
      </div>

      <div className="filter-bar">
        {isAdmin ? (
          <div className="filter-item">
            <label>农场</label>
            <select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPlantArea('') }}>
              <option value="">请选择</option>
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
        <div className="filter-item">
          <label>开始</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="filter-item">
          <label>结束</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="primary-btn" onClick={loadReport}>
          生成报表
        </button>
      </div>

      {report ? (
        <>
          <div className="report-grid">
            <div className="report-card">
              <h4>采样点数</h4>
              <div className="big">{avg.sample_count ?? 0}</div>
              <div className="sub">区间 {report.period?.from} ~ {report.period?.to}</div>
            </div>
            <div className="report-card">
              <h4>平均温度</h4>
              <div className="big">{fmt(avg.avg_temp)}℃</div>
              <div className="sub">最低 {fmt(avg.min_temp)} / 最高 {fmt(avg.max_temp)}</div>
            </div>
            <div className="report-card">
              <h4>平均空气湿度</h4>
              <div className="big">{fmt(avg.avg_humidity)}%</div>
              <div className="sub">最低 {fmt(avg.min_humidity)} / 最高 {fmt(avg.max_humidity)}</div>
            </div>
            <div className="report-card">
              <h4>平均土壤湿度</h4>
              <div className="big">{fmt(avg.avg_soil_moisture)}%</div>
            </div>
            <div className="report-card">
              <h4>平均光照</h4>
              <div className="big">{avg.avg_light != null ? Math.round(Number(avg.avg_light)) : '--'} lux</div>
            </div>
            <div className="report-card">
              <h4>环境异常次数</h4>
              <div className="big">{report.anomalies?.total ?? 0}</div>
              <div className="sub">来自监测联动写入</div>
            </div>
          </div>

          <div className="trend-block">
            <h4>趋势分析（前后半段对比）</h4>
            <div className="trend-line">· 温度：{report.trend?.temperature}</div>
            <div className="trend-line">· 湿度：{report.trend?.humidity}</div>
          </div>

          <div className="trend-block">
            <h4>异常类型分布</h4>
            {(report.anomalies?.by_type || []).length === 0 ? (
              <div className="trend-line">本时段无异常记录</div>
            ) : (
              <table className="anomaly-table mobile-card-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>次数</th>
                  </tr>
                </thead>
                <tbody>
                  {report.anomalies.by_type.map((r) => (
                    <tr key={r.exception_type}>
                      <td data-label="类型">{r.exception_type}</td>
                      <td data-label="次数">{r.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}

      {toast ? <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div> : null}
    </div>
  )
}

export default MonitorReport
