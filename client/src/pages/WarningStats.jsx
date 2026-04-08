import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { notifyWarningChanged } from '../utils/warningEvents'
import './WarningPages.css'

const WarningStats = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    by_status: [],
    by_type: [],
    by_farm: []
  })
  const [loading, setLoading] = useState(false)
  const [rulesLoading, setRulesLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const chartStatusRef = useRef(null)
  const chartTypeRef = useRef(null)
  const chartFarmRef = useRef(null)
  const instStatus = useRef(null)
  const instType = useRef(null)
  const instFarm = useRef(null)

  const loadStats = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/warning/stats', {
        params: {
          from: from || undefined,
          to: to || undefined
        }
      })
      setStats({
        total: res.data?.total ?? 0,
        by_status: res.data?.by_status || [],
        by_type: res.data?.by_type || [],
        by_farm: res.data?.by_farm || []
      })
    } catch (e) {
      showToast(e.response?.data?.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const disposeAll = () => {
    instStatus.current?.dispose()
    instType.current?.dispose()
    instFarm.current?.dispose()
    instStatus.current = null
    instType.current = null
    instFarm.current = null
  }

  useEffect(() => {
    const palette = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4']

    disposeAll()
    if (chartStatusRef.current) {
      instStatus.current = echarts.init(chartStatusRef.current)
      instStatus.current.setOption({
        tooltip: { trigger: 'item' },
        series: [{
          type: 'pie',
          radius: ['36%', '68%'],
          data: (stats.by_status || []).map((r) => ({
            name: r.name || '未知',
            value: r.value
          })),
          itemStyle: { color: (p) => palette[p.dataIndex % palette.length] },
          label: { formatter: '{b}\n{c} ({d}%)' }
        }]
      })
    }

    if (chartTypeRef.current) {
      instType.current = echarts.init(chartTypeRef.current)
      const names = (stats.by_type || []).map((r) => r.name || '未知')
      const vals = (stats.by_type || []).map((r) => r.value)
      instType.current.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 48, right: 16, top: 24, bottom: names.length > 6 ? 80 : 48 },
        xAxis: { type: 'category', data: names, axisLabel: { rotate: 24, interval: 0, fontSize: 11 } },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{
          type: 'bar',
          data: vals,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#67c23a' },
              { offset: 1, color: '#b3e19d' }
            ])
          }
        }]
      })
    }

    if (chartFarmRef.current) {
      instFarm.current = echarts.init(chartFarmRef.current)
      const names = (stats.by_farm || []).map((r) => r.name || '未知')
      const vals = (stats.by_farm || []).map((r) => r.value)
      instFarm.current.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 48, right: 16, top: 24, bottom: 48 },
        xAxis: { type: 'category', data: names, axisLabel: { rotate: names.length > 4 ? 20 : 0, interval: 0 } },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{
          type: 'bar',
          data: vals,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#e6a23c' },
              { offset: 1, color: '#f3d19e' }
            ])
          }
        }]
      })
    }

    const onResize = () => {
      instStatus.current?.resize()
      instType.current?.resize()
      instFarm.current?.resize()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      disposeAll()
    }
  }, [stats])

  const runRules = async () => {
    try {
      setRulesLoading(true)
      await api.post('/warning/run-rules')
      showToast('规则扫描已执行')
      notifyWarningChanged()
      loadStats()
    } catch (e) {
      showToast(e.response?.data?.message || '执行失败', 'error')
    } finally {
      setRulesLoading(false)
    }
  }

  return (
    <div className="warning-module-page">
      <div className="warning-module-header">
        <h2>处理状态统计</h2>
        <p className="warning-module-sub">
          按处理状态、异常类型、农场维度汇总；可选日期范围。管理员可手动触发全库环境规则扫描（与自动检测逻辑一致）。
        </p>
      </div>

      <div className="warning-toolbar">
        <div className="field">
          <label>开始日期</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>结束日期</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="btn-primary" onClick={loadStats} disabled={loading}>查询</button>
        {isAdmin ? (
          <button type="button" className="btn-ghost" onClick={runRules} disabled={rulesLoading}>
            {rulesLoading ? '扫描中…' : '手动触发规则扫描'}
          </button>
        ) : null}
      </div>

      <div className="warning-stats-summary">
        <div className="warning-stat-card">
          <div className="num">{stats.total}</div>
          <div className="lbl">异常总数（当前筛选范围）</div>
        </div>
      </div>

      <div className="warning-chart-row">
        <div className="warning-chart-box">
          <h4>按处理状态</h4>
          <div ref={chartStatusRef} className="warning-chart-el" />
        </div>
        <div className="warning-chart-box">
          <h4>按异常类型</h4>
          <div ref={chartTypeRef} className="warning-chart-el" />
        </div>
        <div className="warning-chart-box">
          <h4>按农场</h4>
          <div ref={chartFarmRef} className="warning-chart-el" />
        </div>
      </div>

      {toast ? (
        <div className={`warning-toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </div>
  )
}

export default WarningStats
