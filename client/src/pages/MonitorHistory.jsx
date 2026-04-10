import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import {
  aggregateHistoryRows,
  formatAxisLabel,
  formatFullDateTime,
  formatSeriesValue,
  getChartGranularity,
  parseHistoryRange
} from '../utils/monitorHistoryChart'
import './MonitorPages.css'

const MonitorHistory = () => {
  const { user, currentFarmId } = useAuth()
  const isAdmin = user?.role_id === 1
  const chartRef = useRef(null)
  const chartInst = useRef(null)

  const [farms, setFarms] = useState([])
  const [areas, setAreas] = useState([])
  const [farmId, setFarmId] = useState('')
  const [plantArea, setPlantArea] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [series, setSeries] = useState([])
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

  // 与顶栏「全局农场」一致：管理员选中某农场时同步到本页筛选
  useEffect(() => {
    if (!isAdmin) return
    if (currentFarmId) setFarmId(String(currentFarmId))
    else setFarmId('')
  }, [isAdmin, currentFarmId])

  useEffect(() => {
    if (isAdmin && !currentFarmId && !farmId && farms.length === 1) {
      setFarmId(String(farms[0].farm_id))
    }
  }, [isAdmin, currentFarmId, farms, farmId])

  const loadHistory = useCallback(async () => {
    const fid = isAdmin ? farmId : undefined
    if (isAdmin && !fid) {
      setToast({ kind: 'error', message: '请选择农场' })
      setTimeout(() => setToast(null), 2200)
      return
    }
    try {
      const res = await api.get('/environment/history', {
        params: {
          farm_id: isAdmin ? farmId : undefined,
          plant_area: plantArea || undefined,
          from,
          to,
          limit: 800
        }
      })
      setSeries(res.data?.data || [])
    } catch (e) {
      setToast({ kind: 'error', message: e.response?.data?.message || '加载失败' })
      setTimeout(() => setToast(null), 2600)
    }
  }, [isAdmin, farmId, plantArea, from, to])

  useEffect(() => {
    if (isAdmin && !farmId) return
    loadHistory()
  }, [isAdmin, farmId, plantArea, from, to, loadHistory])

  const chartMeta = useMemo(() => {
    const { axisMode, bucket, label } = getChartGranularity(from, to)
    const { fromMs, toMs } = parseHistoryRange(from, to)
    const aggregated = aggregateHistoryRows(series, bucket)
    return { axisMode, bucket, label, fromMs, toMs, aggregated }
  }, [from, to, series])

  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    let cancelled = false

    const applyChart = (echarts) => {
      if (!chartRef.current) return
      if (!chartInst.current) chartInst.current = echarts.init(chartRef.current)
      const c = chartInst.current

    const { axisMode, fromMs, toMs, aggregated } = chartMeta
    const axisFmt = axisMode

    const toPoint = (ts, v) => (v != null && !Number.isNaN(v) ? [ts, v] : [ts, null])

    const opt = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter(params) {
          if (!params || !params.length) return ''
          const ts = params[0].value[0]
          const head = formatFullDateTime(ts)
          const lines = params
            .map((p) => {
              const v = p.value[1]
              const txt = formatSeriesValue(p.seriesName, v)
              return `${p.marker}${p.seriesName}：${txt}`
            })
            .join('<br/>')
          return `${head}<br/>${lines}`
        }
      },
      legend: {
        data: ['温度℃', '湿度%', '土壤湿度%', '光照lux'],
        bottom: 36
      },
      grid: { left: 52, right: 28, top: 36, bottom: 108 },
      dataZoom: [
        { type: 'inside', start: 0, end: 100, filterMode: 'none' },
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 22,
          bottom: 8,
          filterMode: 'none',
          showDetail: false
        }
      ],
      xAxis: {
        type: 'time',
        min: fromMs,
        max: toMs,
        boundaryGap: false,
        axisLabel: {
          formatter: (v) => formatAxisLabel(typeof v === 'number' ? v : new Date(v).getTime(), axisFmt),
          hideOverlap: true,
          fontSize: 11,
          rotate: axisFmt === 'ym' ? 0 : 22
        },
        splitLine: { show: false }
      },
      yAxis: [
        { type: 'value', name: '温/湿', splitLine: { lineStyle: { type: 'dashed' } } },
        { type: 'value', name: '光照', splitLine: { show: false } }
      ],
      series: [
        {
          name: '温度℃',
          type: 'line',
          smooth: true,
          showSymbol: aggregated.length <= 48,
          connectNulls: true,
          data: aggregated.map((r) => toPoint(r.ts, r.temperature)),
          itemStyle: { color: '#f56c6c' }
        },
        {
          name: '湿度%',
          type: 'line',
          smooth: true,
          showSymbol: aggregated.length <= 48,
          connectNulls: true,
          data: aggregated.map((r) => toPoint(r.ts, r.humidity)),
          itemStyle: { color: '#409eff' }
        },
        {
          name: '土壤湿度%',
          type: 'line',
          smooth: true,
          showSymbol: aggregated.length <= 48,
          connectNulls: true,
          data: aggregated.map((r) => toPoint(r.ts, r.soil_moisture)),
          itemStyle: { color: '#67c23a' }
        },
        {
          name: '光照lux',
          type: 'line',
          smooth: true,
          yAxisIndex: 1,
          showSymbol: aggregated.length <= 48,
          connectNulls: true,
          data: aggregated.map((r) => toPoint(r.ts, r.light_lux)),
          itemStyle: { color: '#e6a23c' }
        }
      ]
    }
    c.setOption(opt, true)
    }

    ;(async () => {
      const mod = await import('echarts')
      if (cancelled) return
      const echarts = mod.default || mod
      applyChart(echarts)
    })()
    return () => {
      cancelled = true
    }
  }, [chartMeta])

  useEffect(() => {
    const onR = () => chartInst.current?.resize()
    window.addEventListener('resize', onR)
    return () => {
      window.removeEventListener('resize', onR)
      chartInst.current?.dispose()
      chartInst.current = null
    }
  }, [])

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <div>
          <h2>历史环境数据</h2>
          <p className="monitor-sub">
            按时间范围与农场/区域筛选；X 轴随范围简化（当天 HH:mm，7 日内 MM-dd，30 天及以上 yyyy-MM），曲线为桶内均值；悬浮可看完整时间。底部可拖动缩放。
            {series.length > 0 ? ` 当前：${chartMeta.label}。` : ''}
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
          <label>开始日期</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="filter-item">
          <label>结束日期</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="primary-btn" onClick={loadHistory}>
          查询
        </button>
      </div>

      <div className="chart-wrap" ref={chartRef} />

      {series.length === 0 ? (
        <p className="monitor-sub" style={{ marginTop: 12 }}>当前条件下无数据，可缩短时间范围或等待模拟采集写入。</p>
      ) : null}

      {toast ? <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div> : null}
    </div>
  )
}

export default MonitorHistory
