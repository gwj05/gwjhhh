import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { notifyInventoryChanged } from '../utils/inventoryEvents'
import { useAuth } from '../context/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'
import './MaterialWarning.css'

const MATERIAL_TYPES = ['种子', '化肥', '农药', '工具']

function getStockTag(state) {
  if (state === '库存不足') return { className: 'tag-warn', text: '库存不足' }
  if (state === '缺货') return { className: 'tag-danger', text: '缺货' }
  return { className: 'tag-normal', text: state || '-' }
}

const MaterialWarning = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1
  const canUpdateStock = [1, 2, 3].includes(user?.role_id)
  const navigate = useNavigate()
  const location = useLocation()

  const initialStatus = useMemo(() => {
    const q = new URLSearchParams(location.search)
    const s = q.get('status')
    return ['low', 'out', ''].includes(s) ? s : ''
  }, [location.search])

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ total_materials: 0, low_count: 0, out_count: 0, warning_total: 0 })

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [type, setType] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [farmFilterId, setFarmFilterId] = useState('')
  const [farms, setFarms] = useState([])

  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/material/warnings', {
        params: {
          page,
          pageSize,
          type,
          status,
          farm_id: isAdmin ? farmFilterId : undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
      setStats(res.data?.stats || { total_materials: 0, low_count: 0, out_count: 0, warning_total: 0 })
    } catch (e) {
      console.error('加载库存预警失败', e)
      showToast(e.response?.data?.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, type, status, farmFilterId, isAdmin])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (stats.warning_total > 0) {
      showToast(`当前有 ${stats.warning_total} 条库存预警，请及时处理`, 'error')
    }
    if (stats.out_count > 0) {
      showToast(`存在 ${stats.out_count} 条缺货预警，请立即补充库存`, 'error')
    }
  }, [stats.warning_total, stats.out_count])

  useEffect(() => {
    const run = async () => {
      if (!isAdmin) return
      try {
        const res = await api.get('/farm/list', { params: { page: 1, pageSize: 1000 } })
        setFarms(res.data?.data || [])
      } catch (e) {
        console.error('加载农场失败', e)
      }
    }
    run()
  }, [isAdmin])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  // 入库弹窗
  const getNow = () => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockSubmitting, setStockSubmitting] = useState(false)
  const [stockError, setStockError] = useState('')
  const [stockMaterial, setStockMaterial] = useState(null)
  const [stockForm, setStockForm] = useState({ delta_qty: 1, operation_time: getNow(), reason: '' })

  const openInModal = (row) => {
    if (!canUpdateStock) return
    setStockMaterial(row)
    setStockError('')
    setStockForm({ delta_qty: 1, operation_time: getNow(), reason: '' })
    setStockModalOpen(true)
  }
  const closeInModal = () => {
    setStockModalOpen(false)
    setStockSubmitting(false)
    setStockError('')
    setStockMaterial(null)
  }
  const submitIn = async () => {
    if (!stockMaterial) return
    const delta = Number(stockForm.delta_qty)
    if (Number.isNaN(delta) || delta <= 0) {
      setStockError('入库数量必须大于 0')
      return
    }
    try {
      setStockSubmitting(true)
      const res = await api.post(`/material/stock/${stockMaterial.material_id}`, {
        change_type: 'IN',
        delta_qty: delta,
        operation_time: stockForm.operation_time || null,
        reason: stockForm.reason || null,
        source_type: '手动入库'
      })
      const before = Number(stockMaterial.stock_num || 0)
      const after = Number(res.data?.new_stock ?? before + delta)
      showToast(`入库成功：数量 ${delta}，库存 ${before} → ${after}`)
      notifyInventoryChanged()
      closeInModal()
      fetchData()
    } catch (e) {
      const msg = e.response?.data?.message || '入库失败'
      setStockError(msg)
      showToast(msg, 'error')
    } finally {
      setStockSubmitting(false)
    }
  }

  return (
    <div className="material-warning-page">
      <div className="warning-header">
        <h2>库存预警</h2>
      </div>

      <div className="warning-stats">
        <div className="stat-card">
          <div className="stat-label">总农资数</div>
          <div className="stat-value">{stats.total_materials}</div>
        </div>
        <div className="stat-card warn">
          <div className="stat-label">预警数量</div>
          <div className="stat-value">{stats.low_count}</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">缺货数量</div>
          <div className="stat-value">{stats.out_count}</div>
        </div>
      </div>

      <div className="warning-filter-card">
        <div className="filter-row">
          {isAdmin && (
            <div className="filter-item">
              <label>所属农场</label>
              <select value={farmFilterId} onChange={e => setFarmFilterId(e.target.value)}>
                <option value="">全部</option>
                {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}
              </select>
            </div>
          )}
          <div className="filter-item">
            <label>类型</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="">全部</option>
              {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <label>状态</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="low">库存不足</option>
              <option value="out">缺货</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="outline-btn" onClick={() => setPage(1)}>筛选</button>
          </div>
        </div>
      </div>

      <div className="table-card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state-panel">暂无预警数据</div>
        ) : (
          <table className="warning-table">
            <thead>
              <tr>
                <th>农资名称</th>
                <th>所属农场</th>
                <th>类型</th>
                <th>当前库存</th>
                <th>安全库存</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const tag = getStockTag(r.stock_state)
                return (
                  <tr key={r.material_id} className={r.stock_state === '缺货' ? 'row-danger' : ''}>
                    <td>{r.material_name}</td>
                    <td>{r.farm_name}</td>
                    <td>{r.material_type}</td>
                    <td>{r.stock_num}</td>
                    <td>{r.safety_stock_num}</td>
                    <td><span className={`tag ${tag.className}`}>{tag.text}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="mini-btn" onClick={() => openInModal(r)}>去入库</button>
                        <button className="mini-btn" onClick={() => navigate('/material/list')}>查看详情</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="pagination">
          <div className="page-info">共 {total} 条，第 {page} / {pageCount} 页</div>
          <div className="page-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
            <span className="page-current">{page}</span>
            <button className="page-btn" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>下一页</button>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
              <option value={10}>10 / 页</option>
              <option value={20}>20 / 页</option>
              <option value={50}>50 / 页</option>
            </select>
          </div>
        </div>
      </div>

      {stockModalOpen && stockMaterial && (
        <div className="modal" onClick={closeInModal}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h3>去入库：{stockMaterial.material_name}</h3>
            <div className="stock-meta">当前库存：<b>{stockMaterial.stock_num}</b></div>
            <div className="form-grid">
              <label>入库数量</label>
              <input type="number" value={stockForm.delta_qty} onChange={e => setStockForm(s => ({ ...s, delta_qty: e.target.value }))} disabled={stockSubmitting} />
              <label>入库时间</label>
              <input type="datetime-local" value={stockForm.operation_time} onChange={e => setStockForm(s => ({ ...s, operation_time: e.target.value }))} disabled={stockSubmitting} />
              <label>备注</label>
              <input value={stockForm.reason} onChange={e => setStockForm(s => ({ ...s, reason: e.target.value }))} disabled={stockSubmitting} />
            </div>
            {stockError ? <div className="stock-error">{stockError}</div> : null}
            <div className="form-actions">
              <button className="outline-btn" onClick={closeInModal} disabled={stockSubmitting}>取消</button>
              <button className="primary-btn" onClick={submitIn} disabled={stockSubmitting}>{stockSubmitting ? '提交中...' : '确认入库'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  )
}

export default MaterialWarning

