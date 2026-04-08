import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { notifyInventoryChanged } from '../utils/inventoryEvents'
import { useAuth } from '../context/AuthContext'
import './MaterialPurchase.css'

const MATERIAL_TYPES = [
  { value: '种子', label: '种子' },
  { value: '化肥', label: '化肥' },
  { value: '农药', label: '农药' },
  { value: '工具', label: '工具' }
]

const statusTag = (s) => {
  if (s === '待入库') return 'tag-warn'
  if (s === '已入库') return 'tag-normal'
  return 'tag-off'
}

const MaterialPurchase = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1
  const isManager = user?.role_id === 2
  const canCreate = [1, 2].includes(user?.role_id)
  const canInbound = [1, 2].includes(user?.role_id)
  const canDelete = user?.role_id === 1

  const [stats, setStats] = useState({ total_amount: 0, month_count: 0, pending_count: 0 })
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [filters, setFilters] = useState({
    material_name: '',
    farm_id: '',
    purchase_status: '',
    from: '',
    to: ''
  })

  const [farms, setFarms] = useState([])
  const [materialOptions, setMaterialOptions] = useState([])

  const [showForm, setShowForm] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    material_id: '',
    farm_id: '',
    purchase_qty: 1,
    unit_price: '',
    supplier: '',
    purchase_time: '',
    remark: ''
  })

  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false)
  const [newMaterialSubmitting, setNewMaterialSubmitting] = useState(false)
  const [newMaterialForm, setNewMaterialForm] = useState({
    material_name: '',
    material_type: '化肥',
    price: '',
    spec: ''
  })

  const fetchStats = useCallback(async () => {
    const res = await api.get('/material/purchase/stats', {
      params: {
        farm_id: isAdmin ? filters.farm_id : undefined,
        from: filters.from || undefined,
        to: filters.to || undefined
      }
    })
    setStats(res.data || { total_amount: 0, month_count: 0, pending_count: 0 })
  }, [filters.farm_id, filters.from, filters.to, isAdmin])

  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/material/purchase/list', {
        params: {
          page,
          pageSize,
          ...filters,
          farm_id: isAdmin ? filters.farm_id : undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      console.error('获取采购记录失败', e)
      showToast(e.response?.data?.message || '获取失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters, isAdmin])

  useEffect(() => {
    fetchList()
    fetchStats()
  }, [fetchList, fetchStats])

  const reloadMaterialOptions = useCallback(async () => {
    try {
      if (isAdmin) {
        const farmRes = await api.get('/farm/list', { params: { page: 1, pageSize: 1000 } })
        setFarms(farmRes.data?.data || [])
      }
      const farmForOptions = isAdmin ? ((showForm ? form.farm_id : filters.farm_id) || undefined) : undefined
      const matRes = await api.get('/material/purchase/material-options', {
        params: { farm_id: farmForOptions }
      })
      setMaterialOptions(matRes.data || [])
    } catch (e) {
      console.error('加载农资选项失败', e)
    }
  }, [isAdmin, filters.farm_id, showForm, form.farm_id])

  useEffect(() => {
    reloadMaterialOptions()
  }, [reloadMaterialOptions])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const onMaterialChange = (materialId) => {
    const m = materialOptions.find(x => String(x.material_id) === String(materialId))
    setForm(prev => ({
      ...prev,
      material_id: materialId,
      unit_price: m ? m.unit_price : '',
      farm_id: isAdmin ? (m?.farm_id || prev.farm_id) : prev.farm_id
    }))
  }

  const openCreate = () => {
    if (!canCreate) return
    setEditingRow(null)
    setForm({
      material_id: '',
      farm_id: isAdmin ? '' : (user?.farm_id != null ? String(user.farm_id) : ''),
      purchase_qty: 1,
      unit_price: '',
      supplier: '',
      purchase_time: '',
      remark: ''
    })
    setShowForm(true)
  }

  const openNewMaterialModal = () => {
    if (isAdmin && !form.farm_id) {
      showToast('请先选择所属农场', 'error')
      return
    }
    setNewMaterialForm({
      material_name: '',
      material_type: '化肥',
      price: '',
      spec: ''
    })
    setShowNewMaterialModal(true)
  }

  const submitNewMaterial = async () => {
    const name = (newMaterialForm.material_name || '').trim()
    const p = Number(newMaterialForm.price)
    if (!name) return showToast('请填写农资名称', 'error')
    if (Number.isNaN(p) || p < 0) return showToast('单价必须为非负数', 'error')
    try {
      setNewMaterialSubmitting(true)
      const payload = {
        material_name: name,
        material_type: newMaterialForm.material_type,
        spec: (newMaterialForm.spec || '').trim() || null,
        price: p,
        stock_num: 0,
        safety_stock_num: 0
      }
      if (isAdmin) payload.farm_id = Number(form.farm_id)
      const res = await api.post('/material/create', payload)
      const mid = res.data?.material_id
      await reloadMaterialOptions()
      if (mid != null) {
        setForm(prev => ({
          ...prev,
          material_id: String(mid),
          unit_price: String(p)
        }))
      }
      setShowNewMaterialModal(false)
      showToast('农资已创建并填入采购单')
      notifyInventoryChanged()
    } catch (e) {
      showToast(e.response?.data?.message || '创建农资失败', 'error')
    } finally {
      setNewMaterialSubmitting(false)
    }
  }
  const openEdit = (row) => {
    if (!canCreate) return
    if (row.purchase_status !== '待入库') return
    setEditingRow(row)
    setForm({
      material_id: row.material_id,
      farm_id: row.farm_id,
      purchase_qty: row.purchase_qty,
      unit_price: row.unit_price,
      supplier: row.supplier || '',
      purchase_time: row.purchase_time ? new Date(row.purchase_time).toISOString().slice(0, 16) : '',
      remark: row.remark || ''
    })
    setShowForm(true)
  }

  const submitForm = async () => {
    const qty = Number(form.purchase_qty)
    const price = Number(form.unit_price)
    if (!form.material_id) return showToast('请选择农资', 'error')
    if (Number.isNaN(qty) || qty <= 0) return showToast('采购数量必须大于0', 'error')
    if (Number.isNaN(price) || price < 0) return showToast('单价必须为非负数', 'error')
    try {
      setSubmitting(true)
      const payload = {
        ...form,
        farm_id: isAdmin ? form.farm_id : undefined
      }
      if (editingRow) {
        await api.put(`/material/purchase/update/${editingRow.purchase_id}`, payload)
        showToast('采购记录更新成功')
      } else {
        const res = await api.post('/material/purchase/create', payload)
        const d = res.data || {}
        if (d.auto_inbound && d.inbound) {
          const ib = d.inbound
          showToast(
            `采购已创建并自动入库：入库 ${ib.inbound_qty}，库存 ${ib.before_stock} → ${ib.after_stock}`
          )
          notifyInventoryChanged()
        } else {
          showToast(d.message || '采购记录新增成功')
        }
      }
      setShowForm(false)
      setPage(1)
      fetchList()
      fetchStats()
    } catch (e) {
      showToast(e.response?.data?.message || '提交失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInbound = async (row) => {
    if (!canInbound || row.purchase_status !== '待入库') return
    if (!window.confirm(`确认将采购单 ${row.purchase_no} 入库？`)) return
    try {
      const res = await api.post(`/material/purchase/inbound/${row.purchase_id}`)
      const d = res.data || {}
      showToast(`入库成功：数量 ${d.inbound_qty}，库存 ${d.before_stock} → ${d.after_stock}`)
      notifyInventoryChanged()
      fetchList()
      fetchStats()
    } catch (e) {
      showToast(e.response?.data?.message || '入库失败', 'error')
    }
  }

  const handleDelete = async (row) => {
    if (!canDelete) return
    if (!window.confirm('确认删除该采购记录？')) return
    try {
      await api.delete(`/material/purchase/delete/${row.purchase_id}`)
      showToast('删除成功')
      fetchList()
      fetchStats()
    } catch (e) {
      showToast(e.response?.data?.message || '删除失败', 'error')
    }
  }

  const handleCancel = async (row) => {
    if (!canCreate || row.purchase_status !== '待入库') return
    if (!window.confirm('确认取消该采购记录？')) return
    try {
      await api.post(`/material/purchase/cancel/${row.purchase_id}`)
      showToast('已取消')
      fetchList()
      fetchStats()
    } catch (e) {
      showToast(e.response?.data?.message || '取消失败', 'error')
    }
  }

  const totalAmountPreview = Number(form.purchase_qty || 0) * Number(form.unit_price || 0)

  return (
    <div className="material-purchase-page">
      <div className="purchase-header">
        <h2>采购记录</h2>
        {canCreate && <button className="primary-btn" onClick={openCreate}>新增采购</button>}
      </div>
      <p className="purchase-hint">新增采购单默认<strong>自动入库</strong>并更新库存；也可在列表中对「待入库」记录手动入库。</p>

      <div className="stats-row">
        <div className="stat-card">
          <div className="label">总采购金额</div>
          <div className="value">{stats.total_amount}</div>
        </div>
        <div className="stat-card">
          <div className="label">本月采购次数</div>
          <div className="value">{stats.month_count}</div>
        </div>
        <div className="stat-card warn">
          <div className="label">待入库数量</div>
          <div className="value">{stats.pending_count}</div>
        </div>
      </div>

      <div className="filter-card">
        <div className="filter-row">
          <div className="filter-item">
            <label>农资名称</label>
            <input value={filters.material_name} onChange={e => setFilters(p => ({ ...p, material_name: e.target.value }))} />
          </div>
          {isAdmin && (
            <div className="filter-item">
              <label>农场</label>
              <select value={filters.farm_id} onChange={e => setFilters(p => ({ ...p, farm_id: e.target.value }))}>
                <option value="">全部</option>
                {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}
              </select>
            </div>
          )}
          <div className="filter-item">
            <label>采购状态</label>
            <select value={filters.purchase_status} onChange={e => setFilters(p => ({ ...p, purchase_status: e.target.value }))}>
              <option value="">全部</option>
              <option value="待入库">待入库</option>
              <option value="已入库">已入库</option>
              <option value="已取消">已取消</option>
            </select>
          </div>
          <div className="filter-item">
            <label>开始日期</label>
            <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
          </div>
          <div className="filter-item">
            <label>结束日期</label>
            <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
          </div>
          <div className="filter-actions">
            <button className="outline-btn" onClick={() => setPage(1)}>筛选</button>
          </div>
        </div>
      </div>

      <div className="table-card">
        {loading ? <div className="loading">加载中...</div> : (
          <table className="purchase-table">
            <thead>
              <tr>
                <th>采购单号</th>
                <th>农资名称</th>
                <th>所属农场</th>
                <th>数量</th>
                <th>单价</th>
                <th>总金额</th>
                <th>采购状态</th>
                <th>采购时间</th>
                <th>操作人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map(r => (
                <tr key={r.purchase_id}>
                  <td>{r.purchase_no}</td>
                  <td>{r.material_name}</td>
                  <td>{r.farm_name}</td>
                  <td>{r.purchase_qty}</td>
                  <td>{r.unit_price}</td>
                  <td>{r.total_amount}</td>
                  <td><span className={`tag ${statusTag(r.purchase_status)}`}>{r.purchase_status}</span></td>
                  <td>{r.purchase_time ? new Date(r.purchase_time).toLocaleString() : '--'}</td>
                  <td>{r.operator_name || '--'}</td>
                  <td>
                    <div className="row-actions">
                      {canInbound && r.purchase_status === '待入库' && (
                        <button className="mini-btn" onClick={() => handleInbound(r)}>入库</button>
                      )}
                      {canCreate && r.purchase_status === '待入库' && (
                        <>
                          <button className="mini-btn" onClick={() => openEdit(r)}>编辑</button>
                          <button className="mini-btn" onClick={() => handleCancel(r)}>取消</button>
                        </>
                      )}
                      {canDelete && <button className="mini-btn danger" onClick={() => handleDelete(r)}>删除</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pagination">
          <div>共 {total} 条，第 {page} / {pageCount} 页</div>
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

      {showForm && (
        <div className="modal" onClick={() => setShowForm(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h3>{editingRow ? '编辑采购记录' : '新增采购记录'}</h3>
            <div className="form-grid">
              {isAdmin && (
                <>
                  <label>所属农场</label>
                  <select value={form.farm_id} onChange={e => {
                    const farmId = e.target.value
                    setForm(p => ({ ...p, farm_id: farmId, material_id: '', unit_price: '' }))
                  }}>
                    <option value="">请先选择农场</option>
                    {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}
                  </select>
                </>
              )}

              <label>选择农资</label>
              <div className="material-field-row">
                <select
                  value={form.material_id}
                  onChange={e => onMaterialChange(e.target.value)}
                  disabled={isAdmin && !form.farm_id}
                >
                  <option value="">{isAdmin && !form.farm_id ? '请先选择农场' : '请选择已有农资'}</option>
                  {materialOptions.map(m => <option key={m.material_id} value={m.material_id}>{m.material_name}</option>)}
                </select>
                <button
                  type="button"
                  className="linkish-btn"
                  onClick={openNewMaterialModal}
                  disabled={isAdmin && !form.farm_id}
                >
                  新增农资
                </button>
              </div>
              {isAdmin && !form.farm_id ? (
                <>
                  <label></label>
                  <div className="helper-text">请先选择所属农场，再选择或新增农资</div>
                </>
              ) : null}

              <label>采购数量</label>
              <input type="number" value={form.purchase_qty} onChange={e => setForm(p => ({ ...p, purchase_qty: e.target.value }))} />
              <label>单价</label>
              <input type="number" step="0.01" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: e.target.value }))} />
              <label>总金额</label>
              <div className="calc-val">{Number.isNaN(totalAmountPreview) ? '--' : totalAmountPreview.toFixed(2)}</div>
              <label>供应商</label>
              <input value={form.supplier} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} />
              <label>采购时间</label>
              <input type="datetime-local" value={form.purchase_time} onChange={e => setForm(p => ({ ...p, purchase_time: e.target.value }))} />
              <label>备注</label>
              <input value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} />
            </div>
            <div className="form-actions">
              <button className="outline-btn" onClick={() => setShowForm(false)} disabled={submitting}>取消</button>
              <button className="primary-btn" onClick={submitForm} disabled={submitting}>{submitting ? '提交中...' : '确认'}</button>
            </div>
          </div>
        </div>
      )}

      {showNewMaterialModal && (
        <div className="modal nested-modal" onClick={() => !newMaterialSubmitting && setShowNewMaterialModal(false)}>
          <div className="modal-panel nested-panel" onClick={e => e.stopPropagation()}>
            <h3>新增农资（绑定当前农场）</h3>
            <div className="form-grid">
              <label>农资名称</label>
              <input
                value={newMaterialForm.material_name}
                onChange={e => setNewMaterialForm(p => ({ ...p, material_name: e.target.value }))}
                placeholder="如：复合肥 15-15-15"
              />
              <label>类型</label>
              <select
                value={newMaterialForm.material_type}
                onChange={e => setNewMaterialForm(p => ({ ...p, material_type: e.target.value }))}
              >
                {MATERIAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <label>单价</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newMaterialForm.price}
                onChange={e => setNewMaterialForm(p => ({ ...p, price: e.target.value }))}
                placeholder="元"
              />
              <label>规格</label>
              <input
                value={newMaterialForm.spec}
                onChange={e => setNewMaterialForm(p => ({ ...p, spec: e.target.value }))}
                placeholder="如：50kg/袋"
              />
            </div>
            <p className="helper-text" style={{ marginTop: 8 }}>创建后初始库存为 0，提交本采购单时将一并入库。</p>
            <div className="form-actions">
              <button type="button" className="outline-btn" onClick={() => setShowNewMaterialModal(false)} disabled={newMaterialSubmitting}>取消</button>
              <button type="button" className="primary-btn" onClick={submitNewMaterial} disabled={newMaterialSubmitting}>
                {newMaterialSubmitting ? '提交中...' : '创建并填入采购单'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  )
}

export default MaterialPurchase

