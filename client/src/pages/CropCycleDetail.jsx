import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useParams } from 'react-router-dom'
import './CropCycle.css'

const METRICS = [
  { key: 'temperature', label: '温度(℃)' },
  { key: 'humidity', label: '空气湿度(%)' },
  { key: 'light', label: '光照强度(代理)' },
  { key: 'soil_moisture', label: '土壤湿度(代理：%H)' },
  { key: 'soil_ph', label: '土壤pH' }
]

const RANGES = [
  { key: '24h', label: '近24小时' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' }
]

const OP_TYPES = ['浇水', '施肥', '喷药', '修剪', '除草']

const CropCycleDetail = () => {
  const { cropId } = useParams()
  const { user } = useAuth()

  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [range, setRange] = useState('7d')
  const [metric, setMetric] = useState('temperature')

  const [opModalOpen, setOpModalOpen] = useState(false)
  const [opMode, setOpMode] = useState('add') // add | edit
  const [opEditingRecordId, setOpEditingRecordId] = useState(null)

  const [opForm, setOpForm] = useState({
    operation_type: '浇水',
    operation_detail: '',
    operation_time: ''
  })

  const [stageModalOpen, setStageModalOpen] = useState(false)
  const [stageModalStage, setStageModalStage] = useState(null)

  const chartWrapRef = useRef(null)
  const chartInsRef = useRef(null)

  const canManage = useMemo(() => {
    if (!detail) return false
    if (user?.role_id === 1) return true
    return user?.farm_id && detail?.crop?.farm_id === user.farm_id
  }, [detail, user])

  const canDeleteOperation = user?.role_id === 1

  const loadDetail = useCallback(async () => {
    if (!cropId) return
    try {
      setLoading(true)
      const res = await api.get(`/crop/cycle/detail/${cropId}`, { params: { range } })
      setDetail(res.data)
    } catch (e) {
      console.error('加载周期详情失败', e)
      alert(e.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [cropId, range])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  // ECharts 按需加载后渲染/更新
  useEffect(() => {
    if (!detail?.env?.history?.length) return
    if (!chartWrapRef.current) return

    const xData = detail.env.history.map(d => {
      const t = new Date(d.monitor_time)
      return `${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`
    })
    const yData = detail.env.history.map(d => d[metric]).map(v => (v == null ? null : Number(v)))

    let cancelled = false
    ;(async () => {
      const mod = await import('echarts')
      if (cancelled) return
      const echarts = mod.default || mod
      if (!chartWrapRef.current) return
      if (!chartInsRef.current) {
        chartInsRef.current = echarts.init(chartWrapRef.current)
      }
      const option = {
        tooltip: {
          trigger: 'axis'
        },
        xAxis: {
          type: 'category',
          data: xData,
          boundaryGap: false,
          axisLabel: { interval: Math.max(0, Math.floor(xData.length / 10)) }
        },
        yAxis: {
          type: 'value',
          name: METRICS.find(m => m.key === metric)?.label || ''
        },
        series: [
          {
            name: '趋势',
            type: 'line',
            data: yData,
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.08 }
          }
        ]
      }
      chartInsRef.current.setOption(option)
    })()
    return () => {
      cancelled = true
    }
  }, [detail, metric])

  useEffect(() => {
    // 初始化时处理 resize
    const handler = () => {
      if (chartInsRef.current) chartInsRef.current.resize()
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (chartInsRef.current) {
        chartInsRef.current.dispose()
        chartInsRef.current = null
      }
    }
  }, [])

  // 可手动切换阶段的权限
  const canEditStage = canManage

  const currentStage = detail?.stage?.current_stage_key
  const stageSchedule = detail?.stage?.schedule || []

  const openStageDetail = (st) => {
    setStageModalStage(st)
    setStageModalOpen(true)
  }

  const confirmSwitchStage = async (stageKey) => {
    if (!canEditStage) return
    if (!stageKey) return
    try {
      const note = window.prompt('可选备注（例如：提前/延后调整）', '')
      await api.post(`/crop/cycle/stage/${cropId}`, { stageKey, note: note || null })
      setStageModalOpen(false)
      await loadDetail()
    } catch (e) {
      console.error('阶段切换失败', e)
      alert(e.response?.data?.message || '阶段切换失败')
    }
  }

  const openAddOperation = () => {
    if (!canManage) return
    setOpMode('add')
    setOpEditingRecordId(null)
    setOpForm({
      operation_type: '浇水',
      operation_detail: '',
      operation_time: ''
    })
    setOpModalOpen(true)
  }

  const openEditOperation = (record) => {
    if (!canManage) return
    setOpMode('edit')
    setOpEditingRecordId(record.operation_record_id)
    setOpForm({
      operation_type: record.operation_type || '浇水',
      operation_detail: record.operation_detail || record.content || '',
      operation_time: record.operation_time ? record.operation_time.slice(0, 16) : ''
    })
    setOpModalOpen(true)
  }

  // 从后端timeline里恢复操作表单字段
  const operationTimelineRecords = useMemo(() => {
    if (!detail?.timeline) return []
    return detail.timeline.map(t => {
      if (t.record_type === 'operation') {
        return {
          ...t,
          operation_record_id: t.operation_record_id,
          operation_type: t.operation_type,
          operation_detail: t.operation_detail,
          operation_time: t.record_time
        }
      }
      return t
    })
  }, [detail])

  const submitOperation = async () => {
    if (!canManage) return
    const timeVal = opForm.operation_time || null
    try {
      if (opMode === 'add') {
        await api.post(`/crop/cycle/operation/${cropId}`, {
          operation_type: opForm.operation_type,
          operation_detail: opForm.operation_detail,
          operation_time: timeVal
        })
      } else {
        await api.put(`/crop/cycle/operation/${cropId}/${opEditingRecordId}`, {
          operation_type: opForm.operation_type,
          operation_detail: opForm.operation_detail,
          operation_time: timeVal
        })
      }
      setOpModalOpen(false)
      await loadDetail()
    } catch (e) {
      console.error('保存操作失败', e)
      alert(e.response?.data?.message || '保存失败')
    }
  }

  const deleteOperation = async (record) => {
    if (!canDeleteOperation) return
    if (!window.confirm('确认删除该农事操作记录？')) return
    try {
      await api.delete(`/crop/cycle/operation/${cropId}/${record.operation_record_id}`)
      await loadDetail()
    } catch (e) {
      console.error('删除失败', e)
      alert(e.response?.data?.message || '删除失败')
    }
  }

  const deleteStageLog = async (record) => {
    if (!canDeleteOperation) return
    if (!record.stage_log_id) return
    if (!window.confirm('确认删除该手动阶段变更记录？')) return
    try {
      await api.delete(`/crop/cycle/stage-log/${cropId}/${record.stage_log_id}`)
      await loadDetail()
    } catch (e) {
      console.error('删除阶段日志失败', e)
      alert(e.response?.data?.message || '删除失败')
    }
  }

  const refresh = async () => {
    await loadDetail()
  }

  // 预警展示
  const alertItems = detail?.alerts?.items || []
  const suggestions = detail?.alerts?.suggestions || []
  const alertStatus = detail?.alerts?.status || '正常'

  const metricLabel = METRICS.find(m => m.key === metric)?.label || metric
  const latest = detail?.env?.latest || null
  const latestValue = latest ? latest[metric] : null

  return (
    <div className="cycle-detail-page">
      {loading && !detail && <div className="loading">加载中...</div>}
      {!detail ? null : (
        <>
          <div className="cycle-detail-top">
            <div className="cycle-detail-card">
              <div className="cycle-title-row">
                <div>
                  <div className="cycle-h2">{detail.crop.crop_name}</div>
                  <div className="cycle-muted">区域：{detail.crop.plant_area || '--'} / 农场：{detail.crop.farm_name}</div>
                </div>
                <div className={`status-pill ${alertStatus === '异常' ? 'status-danger' : alertStatus === '已完成' ? 'status-gray' : 'status-normal'}`}>
                  {alertStatus}
                </div>
              </div>

              <div className="cycle-kv">
                <div className="kv-item">
                  <div className="kv-label">种植时间</div>
                  <div className="kv-value">{detail.crop.sow_time ? new Date(detail.crop.sow_time).toLocaleDateString() : '--'}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">预计收获</div>
                  <div className="kv-value">{detail.crop.expected_harvest_date ? new Date(detail.crop.expected_harvest_date).toLocaleDateString() : '--'}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">当前阶段</div>
                  <div className="kv-value">{detail.stage.current_stage_label}</div>
                </div>
                <div className="kv-item">
                  <div className="kv-label">阶段进度</div>
                  <div className="kv-value">{detail.stage.progress}%</div>
                </div>
              </div>
            </div>

            <div className="cycle-detail-actions">
              <button className="outline-btn" onClick={refresh}>实时刷新</button>
              {canManage && <button className="primary-btn" onClick={openAddOperation}>新增农事操作</button>}
            </div>
          </div>

          <div className="cycle-grid">
            <div className="cycle-left">
              <div className="panel-card">
                <div className="panel-title">生长阶段进度</div>
                <div className="stage-progress-wrap">
                  <div className="stage-progress-bar">
                    <div className="stage-progress-fill" style={{ width: `${detail.stage.progress}%` }} />
                  </div>
                  <div className="stage-progress-text">{detail.stage.progress}%</div>
                </div>

                <div className="stage-steps">
                  {stageSchedule.map(st => {
                    const active = st.key === currentStage
                    return (
                      <div
                        key={st.key}
                        className={`stage-step ${active ? 'active' : ''} ${canEditStage ? 'clickable' : ''}`}
                          onClick={() => openStageDetail(st)}
                        role="button"
                      >
                        <div className="stage-step-title">{st.label}</div>
                        <div className="stage-step-time">
                          {st.start ? new Date(st.start).toLocaleDateString() : '--'} - {st.end ? new Date(st.end).toLocaleDateString() : '--'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="panel-card">
                <div className="panel-title-row">
                  <div className="panel-title">时间轴</div>
                  <button className="outline-btn" onClick={openAddOperation} disabled={!canManage}>
                    添加记录
                  </button>
                </div>
                <div className="timeline-list">
                  {(detail.timeline || []).length === 0 ? (
                    <div className="empty-state-panel">暂无时间轴记录</div>
                  ) : (
                    operationTimelineRecords.map((t, idx) => (
                      <div key={`${t.record_id || idx}`} className="timeline-item">
                        <div className="timeline-time">
                          {t.record_time ? new Date(t.record_time).toLocaleString() : '--'}
                        </div>
                        <div className="timeline-body">
                          <div className="timeline-kind">
                            {t.record_type === 'operation' ? '农事操作' : t.record_type === 'stage_log' ? '阶段变化(手动)' : '阶段变化(推算)'}
                          </div>
                          <div className="timeline-content">{t.content}</div>
                          <div className="timeline-operator">操作人：{t.operator_name || '--'}</div>
                        </div>
                        {(t.record_type === 'operation' || t.record_type === 'stage_log') && (
                          <div className="timeline-actions">
                            {t.record_type === 'stage_log' && (
                              <button
                                className="mini-btn danger"
                                onClick={() => deleteStageLog(t)}
                                disabled={!canDeleteOperation}
                                title={canDeleteOperation ? '管理员可删除' : '无权限'}
                              >
                                删除
                              </button>
                            )}
                            {t.record_type === 'operation' && (
                              <>
                                <button
                                  className="mini-btn"
                                  onClick={() => openEditOperation(t)}
                                  disabled={!canManage}
                                >
                                  编辑
                                </button>
                                <button
                                  className="mini-btn danger"
                                  onClick={() => deleteOperation(t)}
                                  disabled={!canDeleteOperation}
                                  title={canDeleteOperation ? '管理员可删除' : '无权限'}
                                >
                                  删除
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="cycle-right">
              <div className="panel-card">
                <div className="panel-title-row">
                  <div className="panel-title">环境数据</div>
                  <div className="chart-controls">
                    <select value={metric} onChange={e => setMetric(e.target.value)}>
                      {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    <select value={range} onChange={e => setRange(e.target.value)}>
                      {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="chart-latest">
                  当前：{metricLabel} = {latestValue == null ? '--' : latestValue}
                </div>
                <div className="chart-wrap" ref={chartWrapRef} />
              </div>

              <div className="panel-card">
                <div className="panel-title">预警与建议</div>
                <div className={`alert-box ${alertStatus === '异常' ? 'alert-danger' : alertStatus === '已完成' ? 'alert-gray' : 'alert-normal'}`}>
                  <div className="alert-status">
                    {alertStatus === '异常' ? '存在异常' : alertStatus === '已完成' ? '周期已完成' : '环境正常'}
                  </div>
                  <div className="alert-items">
                    {alertItems.length === 0 ? <div className="muted">暂无异常提示</div> : alertItems.map((it, i) => <div key={i} className="alert-item">{it}</div>)}
                  </div>
                </div>

                <div className="exceptions-box">
                  <div className="exceptions-title">病虫害/异常记录</div>
                  {(detail.alerts.unhandled_exceptions || []).length === 0 ? (
                    <div className="muted">暂无未处理异常</div>
                  ) : (
                    <div className="exceptions-list">
                      {detail.alerts.unhandled_exceptions.map((e) => (
                        <div key={e.exception_id} className="exception-item">
                          {e.exception_type}（{e.exception_time ? new Date(e.exception_time).toLocaleString() : '--'}）
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="suggestions-box">
                  <div className="suggestions-title">建议操作</div>
                  <div className="suggestions-list">
                    {suggestions.map((s, i) => <div key={i} className="suggestion-item">- {s}</div>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {opModalOpen && (
        <div className="modal" onClick={() => setOpModalOpen(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h3>{opMode === 'add' ? '新增农事操作' : '编辑农事操作'}</h3>
            <div className="form-grid">
              <label>操作类型</label>
              <select value={opForm.operation_type} onChange={e => setOpForm({ ...opForm, operation_type: e.target.value })}>
                {OP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label>操作时间（可选）</label>
              <input
                type="datetime-local"
                value={opForm.operation_time || ''}
                onChange={e => setOpForm({ ...opForm, operation_time: e.target.value })}
              />
              <label>内容</label>
              <textarea
                rows={4}
                value={opForm.operation_detail}
                onChange={e => setOpForm({ ...opForm, operation_detail: e.target.value })}
                placeholder="例如：浇水 200L，持续 30min"
              />
            </div>
            <div className="form-actions">
              <button className="outline-btn" onClick={() => setOpModalOpen(false)}>取消</button>
              <button className="primary-btn" onClick={submitOperation}>确认</button>
            </div>
          </div>
        </div>
      )}

      {stageModalOpen && stageModalStage && (
        <div className="modal" onClick={() => setStageModalOpen(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h3>阶段详情：{stageModalStage.label}</h3>
            <div className="form-grid">
              <label>开始时间</label>
              <div style={{ paddingTop: 8 }}>
                {stageModalStage.start ? new Date(stageModalStage.start).toLocaleString() : '--'}
              </div>
              <label>结束时间</label>
              <div style={{ paddingTop: 8 }}>
                {stageModalStage.end ? new Date(stageModalStage.end).toLocaleString() : '--'}
              </div>
            </div>
            <div className="form-actions">
              <button className="outline-btn" onClick={() => setStageModalOpen(false)}>关闭</button>
              {canEditStage && (
                <button
                  className="primary-btn"
                  onClick={() => confirmSwitchStage(stageModalStage.key)}
                >
                  切换到该阶段
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CropCycleDetail

