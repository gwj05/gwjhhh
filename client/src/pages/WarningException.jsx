import React, { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { notifyWarningChanged } from '../utils/warningEvents'
import { useToast } from '../ui/Toast/ToastProvider'
import { getErrorMessage } from '../utils/errorMessage'
import Button from '../ui/Button/Button'
import './WarningPages.css'

const EXCEPTION_TYPE_PRESETS = [
  '温度异常',
  '湿度过低',
  '土壤干旱',
  '病虫害',
  '缺水',
  '倒伏',
  '其他'
]

const SOURCE_LABEL = {
  manual: '手动',
  rule: '规则',
  environment: '环境',
  ml: '机器学习预测'
}

const LEVEL_LABEL = { 1: '紧急', 2: '普通', 3: '提示' }

const getProbMeta = (prob) => {
  const p = Number(prob)
  if (!Number.isFinite(p)) return { label: '—', cls: '' }
  const pct = Math.round(p * 100)
  if (pct >= 70) return { label: `${pct}%`, cls: 'risk-high' }
  if (pct >= 40) return { label: `${pct}%`, cls: 'risk-mid' }
  return { label: `${pct}%`, cls: 'risk-low' }
}

const WarningException = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1
  const isWorker = user?.role_id === 3

  const [farms, setFarms] = useState([])
  const [farmFilter, setFarmFilter] = useState('')
  const [handleStatus, setHandleStatus] = useState('')
  const [exceptionType, setExceptionType] = useState('')
  const [sourceType, setSourceType] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [manualFarm, setManualFarm] = useState('')
  const [crops, setCrops] = useState([])
  const [devices, setDevices] = useState([])
  const [manualForm, setManualForm] = useState({
    crop_id: '',
    device_id: '',
    exception_type: '温度异常',
    exception_detail: '',
    warning_level: 2
  })

  const loadFarms = useCallback(async () => {
    try {
      const res = await api.get('/farm/list', { params: { page: 1, pageSize: 200 } })
      setFarms(res.data?.data || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/warning/exceptions', {
        params: {
          page,
          pageSize,
          farm_id: isAdmin && farmFilter ? farmFilter : undefined,
          handle_status: handleStatus || undefined,
          exception_type: exceptionType || undefined,
          source_type: sourceType || undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      toast.error(getErrorMessage(e, '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, isAdmin, farmFilter, handleStatus, exceptionType, sourceType])

  useEffect(() => {
    loadFarms()
  }, [loadFarms])

  useEffect(() => {
    loadList()
  }, [loadList])

  const loadCropsForFarm = async (farmId) => {
    if (!farmId) {
      setCrops([])
      return
    }
    try {
      const res = await api.get('/crop/list', {
        params: { farm_id: farmId, page: 1, pageSize: 500 }
      })
      setCrops(res.data?.data || [])
    } catch (e) {
      setCrops([])
    }
  }

  const loadDevicesForFarm = async (farmId) => {
    if (!farmId) {
      setDevices([])
      return
    }
    try {
      const res = await api.get('/warning/devices', { params: { farm_id: farmId } })
      setDevices(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setDevices([])
    }
  }

  const openManual = () => {
    const fid = !isAdmin && user?.farm_id ? String(user.farm_id) : farmFilter || ''
    setManualFarm(fid)
    setManualForm({
      crop_id: '',
      device_id: '',
      exception_type: '温度异常',
      exception_detail: '',
      warning_level: 2
    })
    setModalOpen(true)
    if (fid) {
      loadCropsForFarm(fid)
      loadDevicesForFarm(fid)
    } else {
      setCrops([])
      setDevices([])
    }
  }

  useEffect(() => {
    if (!modalOpen) return
    if (manualFarm) {
      loadCropsForFarm(manualFarm)
      loadDevicesForFarm(manualFarm)
    }
  }, [manualFarm, modalOpen])

  const submitManual = async (e) => {
    e.preventDefault()
    try {
      await api.post('/warning/exceptions', {
        farm_id: manualFarm ? Number(manualFarm) : undefined,
        crop_id: Number(manualForm.crop_id),
        device_id: Number(manualForm.device_id),
        exception_type: manualForm.exception_type,
        exception_detail: manualForm.exception_detail || null,
        warning_level: Number(manualForm.warning_level)
      })
      toast.success('已记录并推送')
      setModalOpen(false)
      notifyWarningChanged()
      loadList()
    } catch (err) {
      toast.error(getErrorMessage(err, '提交失败'))
    }
  }

  const updateStatus = async (id, handle_status) => {
    try {
      await api.put(`/warning/exceptions/${id}/status`, { handle_status })
      toast.success('状态已更新')
      notifyWarningChanged()
      loadList()
    } catch (err) {
      toast.error(getErrorMessage(err, '更新失败'))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="warning-module-page">
      <div className="warning-module-header">
        <h2>作物异常记录</h2>
        <p className="warning-module-sub">
          环境阈值触发或规则扫描会自动生成异常；也可手动登记。支持按处理状态、来源与类型筛选，并与推送、首页预警联动。
        </p>
      </div>

      <div className="warning-toolbar">
        {isAdmin ? (
          <div className="field">
            <label>农场</label>
            <select value={farmFilter} onChange={(e) => { setFarmFilter(e.target.value); setPage(1) }}>
              <option value="">全部</option>
              {farms.map((f) => (
                <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label>处理状态</label>
          <select value={handleStatus} onChange={(e) => { setHandleStatus(e.target.value); setPage(1) }}>
            <option value="">全部</option>
            <option value="未处理">未处理</option>
            <option value="已处理">已处理</option>
            <option value="已忽略">已忽略</option>
          </select>
        </div>
        <div className="field">
          <label>来源</label>
          <select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setPage(1) }}>
            <option value="">全部</option>
            <option value="manual">手动</option>
            <option value="rule">规则</option>
            <option value="environment">环境</option>
            <option value="ml">机器学习预测</option>
          </select>
        </div>
        <div className="field grow">
          <label>异常类型</label>
          <input
            placeholder="筛选关键字"
            value={exceptionType}
            onChange={(e) => { setExceptionType(e.target.value); setPage(1) }}
          />
        </div>
        <div className="warning-toolbar-actions">
          <Button variant="primary" onClick={openManual}>手动登记异常</Button>
          <Button variant="ghost" onClick={loadList} disabled={loading}>刷新</Button>
        </div>
      </div>

      <div className="warning-table-card">
        {loading && rows.length === 0 ? (
          <div className="warning-empty">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="warning-empty">暂无记录</div>
        ) : (
          <table className="warning-data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>来源</th>
                <th>等级</th>
                <th>农场 / 区域 / 作物</th>
                <th>设备</th>
                <th>状态</th>
                <th>详情</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.exception_id}>
                  <td>{r.exception_time ? new Date(r.exception_time).toLocaleString() : '—'}</td>
                  <td>
                    <div className="type-cell">
                      <span>{(String(r.source_type || '') === 'ml' || r.exception_type === '预测预警') ? '预测预警' : r.exception_type}</span>
                      {(String(r.source_type || '') === 'ml' || r.exception_type === '预测预警') ? (
                        <span className="badge-ml">预测</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{SOURCE_LABEL[r.source_type] || r.source_type || '手动'}</td>
                  <td>{LEVEL_LABEL[r.warning_level] || r.warning_level}</td>
                  <td>
                    {r.farm_name} · {r.plant_area || '—'} · {r.crop_name || '—'}
                  </td>
                  <td>{r.device_name}</td>
                  <td>
                    <span className={`badge-status ${r.handle_status === '未处理' ? 'pending' : 'done'}`}>
                      {r.handle_status}
                    </span>
                  </td>
                  <td className="detail-cell">
                    {(() => {
                      const isMl = String(r.source_type || '') === 'ml' || r.exception_type === '预测预警'
                      if (!isMl) return <span className="detail-plain">{r.exception_detail || '—'}</span>
                      const meta = getProbMeta(r.predicted_prob)
                      return (
                        <>
                          <div className="ml-row">
                            <span className="ml-k">预测概率</span>
                            <span className={`ml-v ${meta.cls}`}>{meta.label}</span>
                          </div>
                          <div className="ml-row">
                            <span className="ml-k">来源</span>
                            <span className="ml-v">机器学习预测</span>
                          </div>
                          <div className="ml-row compare">
                            <span className="ml-k">对比</span>
                            <span className="ml-v">规则预警：未触发；预测预警：已触发</span>
                          </div>
                          {r.exception_detail ? <div className="detail-plain">{r.exception_detail}</div> : null}
                        </>
                      )
                    })()}
                  </td>
                  <td>
                    <select
                      value={r.handle_status}
                      onChange={(e) => updateStatus(r.exception_id, e.target.value)}
                      style={{ minWidth: 100, padding: '6px 8px', borderRadius: 8, border: '1px solid #dcdfe6' }}
                    >
                      <option value="未处理">未处理</option>
                      <option value="已处理">已处理</option>
                      {!isWorker ? <option value="已忽略">已忽略</option> : null}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="warning-pagination">
        <span>共 {total} 条</span>
        <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
        <span>{page} / {totalPages}</span>
        <Button size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
      </div>

      {modalOpen ? (
        <div className="warning-modal-overlay" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="warning-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3>手动登记异常</h3>
            <form onSubmit={submitManual}>
              <div className="warning-form-grid">
                <div>
                  <label>农场</label>
                  <select
                    required
                    value={manualFarm}
                    onChange={(e) => {
                      setManualFarm(e.target.value)
                      setManualForm((s) => ({ ...s, crop_id: '', device_id: '' }))
                    }}
                    disabled={!isAdmin && !!user?.farm_id}
                  >
                    <option value="">请选择</option>
                    {farms.map((f) => (
                      <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>关联作物</label>
                  <select
                    required
                    value={manualForm.crop_id}
                    onChange={(e) => setManualForm((s) => ({ ...s, crop_id: e.target.value }))}
                  >
                    <option value="">请选择</option>
                    {crops.map((c) => (
                      <option key={c.crop_id} value={c.crop_id}>
                        {(c.crop_name || c.crop_type || `作物#${c.crop_id}`)} — {c.plant_area || ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>关联设备（须属同农场）</label>
                  <select
                    required
                    value={manualForm.device_id}
                    onChange={(e) => setManualForm((s) => ({ ...s, device_id: e.target.value }))}
                  >
                    <option value="">请选择</option>
                    {devices.map((d) => (
                      <option key={d.device_id} value={d.device_id}>{d.device_name} · {d.monitor_area}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>异常类型</label>
                  <select
                    value={manualForm.exception_type}
                    onChange={(e) => setManualForm((s) => ({ ...s, exception_type: e.target.value }))}
                  >
                    {EXCEPTION_TYPE_PRESETS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>严重程度</label>
                  <select
                    value={manualForm.warning_level}
                    onChange={(e) => setManualForm((s) => ({ ...s, warning_level: e.target.value }))}
                  >
                    <option value={1}>紧急</option>
                    <option value={2}>普通</option>
                    <option value={3}>提示</option>
                  </select>
                </div>
                <div>
                  <label>详情说明</label>
                  <textarea
                    value={manualForm.exception_detail}
                    onChange={(e) => setManualForm((s) => ({ ...s, exception_detail: e.target.value }))}
                    placeholder="可选"
                  />
                </div>
              </div>
              <div className="warning-modal-footer">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
                <Button variant="primary" type="submit">提交</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default WarningException
