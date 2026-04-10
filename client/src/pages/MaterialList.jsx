import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { notifyInventoryChanged } from '../utils/inventoryEvents'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../ui/Toast/ToastProvider'
import { getErrorMessage } from '../utils/errorMessage'
import Button from '../ui/Button/Button'
import './MaterialList.css'

const MATERIAL_TYPES = [
  { value: '种子', label: '种子' },
  { value: '化肥', label: '化肥' },
  { value: '农药', label: '农药' },
  { value: '工具', label: '工具' }
]

function getStockTag(state) {
  if (state === '正常') return { className: 'tag-normal', text: '正常' }
  if (state === '库存不足') return { className: 'tag-warn', text: '库存不足' }
  if (state === '缺货') return { className: 'tag-danger', text: '缺货' }
  if (state === '下架') return { className: 'tag-off', text: '下架' }
  return { className: 'tag-normal', text: state || '-' }
}

const MaterialList = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role_id === 1
  const isOperator = user?.role_id === 2
  const canCreateEdit = isAdmin || isOperator
  const canDelete = isAdmin
  const canUpdateStock = [1, 2, 3].includes(user?.role_id)

  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState('')
  const [stockState, setStockState] = useState('') // normal/low/out/off
  const [farmFilterId, setFarmFilterId] = useState('') // admin only

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const toast = useToast()

  const showToast = (message, kind = 'success') => {
    if (kind === 'error') toast.error(message)
    else if (kind === 'warn') toast.warn(message)
    else if (kind === 'info') toast.info(message)
    else toast.success(message)
  }

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/material/list', {
        params: {
          page,
          pageSize,
          keyword,
          type,
          stockState,
          farm_id: isAdmin ? farmFilterId : undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      console.error('加载农资列表失败', e)
      toast.error(getErrorMessage(e, '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, type, stockState, farmFilterId, isAdmin])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  // ---- 表单/弹窗 ----
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [formMode, setFormMode] = useState('add') // add/edit
  const [editingId, setEditingId] = useState(null)

  const [formFarmId, setFormFarmId] = useState('')
  const [farms, setFarms] = useState([])

  const [form, setForm] = useState({
    material_name: '',
    material_type: '种子',
    brand: '',
    spec: '',
    price: '',
    stock_num: 0,
    safety_stock_num: 0,
    shelf_status: 'ON'
  })

  const openAdd = async () => {
    if (!canCreateEdit) return
    setFormMode('add')
    setEditingId(null)
    setForm({
      material_name: '',
      material_type: '种子',
      brand: '',
      spec: '',
      price: '',
      stock_num: 0,
      safety_stock_num: 0,
      shelf_status: 'ON'
    })
    if (isAdmin) {
      setFormFarmId(farms?.[0]?.farm_id || '')
    } else {
      setFormFarmId(user?.farm_id || '')
    }
    setFormModalOpen(true)
  }

  const openEdit = (row) => {
    if (!canCreateEdit) return
    setFormMode('edit')
    setEditingId(row.material_id)
    setForm({
      material_name: row.material_name || '',
      material_type: row.material_type || '种子',
      brand: row.brand || '',
      spec: row.spec || '',
      price: row.price != null ? String(row.price) : '',
      stock_num: row.stock_num != null ? row.stock_num : 0,
      safety_stock_num: row.safety_stock_num != null ? row.safety_stock_num : 0,
      shelf_status: row.shelf_status || 'ON'
    })
    if (isAdmin) setFormFarmId(row.farm_id)
    setFormModalOpen(true)
  }

  const validateForm = () => {
    if (!form.material_name?.trim()) {
      showToast('农资名称为必填', 'warn')
      return false
    }
    if (!form.material_type) {
      showToast('农资类型为必填', 'warn')
      return false
    }
    const p = Number(form.price)
    if (Number.isNaN(p) || p < 0) {
      showToast('单价必须为非负数', 'warn')
      return false
    }
    const sn = Number(form.stock_num)
    if (Number.isNaN(sn) || sn < 0) {
      showToast('库存数量必须为非负数', 'warn')
      return false
    }
    const ss = Number(form.safety_stock_num)
    if (Number.isNaN(ss) || ss < 0) {
      showToast('安全库存必须为非负数', 'warn')
      return false
    }
    if (isAdmin && !formFarmId) {
      showToast('请选择所属农场', 'warn')
      return false
    }
    return true
  }

  const submitForm = async () => {
    if (!validateForm()) return
    const confirmMsg = formMode === 'add' ? '确认新增该农资？' : '确认修改该农资？'
    if (!window.confirm(confirmMsg)) return

    try {
      const payload = {
        farm_id: isAdmin ? formFarmId : user?.farm_id,
        material_name: form.material_name.trim(),
        material_type: form.material_type,
        brand: form.brand?.trim() || null,
        spec: form.spec?.trim() || null,
        price: Number(form.price),
        stock_num: Number(form.stock_num),
        safety_stock_num: Number(form.safety_stock_num),
        shelf_status: form.shelf_status
      }

      if (formMode === 'add') {
        await api.post('/material/create', payload)
        showToast('新增成功')
      } else {
        await api.put(`/material/update/${editingId}`, payload)
        showToast('编辑成功')
      }
      setFormModalOpen(false)
      setPage(1)
      fetchMaterials()
    } catch (e) {
      console.error('提交失败', e)
      showToast(e.response?.data?.message || '操作失败', 'error')
    }
  }

  const deleteMaterial = async (row) => {
    if (!canDelete) return
    if (!window.confirm('确认删除该农资？此操作不可恢复。')) return
    if (!window.confirm('请再次确认删除操作（不可恢复）。')) return
    try {
      await api.delete(`/material/delete/${row.material_id}`)
      showToast('删除成功')
      fetchMaterials()
    } catch (e) {
      console.error('删除失败', e)
      showToast(e.response?.data?.message || '删除失败', 'error')
    }
  }

  const toggleShelf = async (row) => {
    if (!isAdmin) return
    const next = row.shelf_status === 'OFF' ? 'ON' : 'OFF'
    if (!window.confirm(`确认${next === 'ON' ? '上架' : '下架'}该农资？`)) return
    try {
      await api.post(`/material/shelf/${row.material_id}`, { shelf_status: next })
      showToast('状态更新成功')
      fetchMaterials()
    } catch (e) {
      console.error('上下架失败', e)
      showToast(e.response?.data?.message || '更新失败', 'error')
    }
  }

  const getDatetimeLocalNow = () => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // 库存变动弹窗
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockModalMaterial, setStockModalMaterial] = useState(null)
  const [stockSubmitting, setStockSubmitting] = useState(false)
  const [stockError, setStockError] = useState('')
  const [stockForm, setStockForm] = useState({
    change_type: 'IN',
    delta_qty: 1,
    operation_time: getDatetimeLocalNow(),
    source_type: '手动入库',
    out_source: '手动出库',
    usage: '',
    reason: ''
  })

  const openStockModal = (row, changeType) => {
    if (!canUpdateStock) return
    const targetType = changeType === 'OUT' ? 'OUT' : 'IN'
    if (targetType === 'OUT' && Number(row.stock_num || 0) <= 0) {
      showToast('库存不足，无法出库', 'error')
      return
    }
    setStockModalMaterial(row)
    setStockError('')
    setStockForm({
      change_type: targetType,
      delta_qty: 1,
      operation_time: getDatetimeLocalNow(),
      source_type: targetType === 'IN' ? '手动入库' : '',
      out_source: '手动出库',
      usage: '',
      reason: ''
    })
    setStockModalOpen(true)
  }

  const closeStockModal = () => {
    setStockModalOpen(false)
    setStockModalMaterial(null)
    setStockSubmitting(false)
    setStockError('')
    setStockForm({
      change_type: 'IN',
      delta_qty: 1,
      operation_time: getDatetimeLocalNow(),
      source_type: '手动入库',
      out_source: '手动出库',
      usage: '',
      reason: ''
    })
  }

  const submitStock = async () => {
    if (!stockModalMaterial) return
    const delta = Number(stockForm.delta_qty)
    if (Number.isNaN(delta) || delta <= 0) {
      setStockError('数量不能为空，且必须大于 0')
      return
    }
    if (stockForm.change_type === 'IN' && !stockForm.source_type) {
      setStockError('请选择入库来源')
      return
    }
    const beforeStock = Number(stockModalMaterial.stock_num || 0)
    if (stockForm.change_type === 'OUT' && delta > beforeStock) {
      setStockError('库存不足，无法出库')
      return
    }
    try {
      setStockSubmitting(true)
      setStockError('')
      const confirmMsg = stockForm.change_type === 'IN' ? '确认入库？' : '确认出库？'
      if (!window.confirm(confirmMsg)) return
      const res = await api.post(`/material/stock/${stockModalMaterial.material_id}`, {
        change_type: stockForm.change_type,
        delta_qty: delta,
        operation_time: stockForm.operation_time || null,
        reason: stockForm.reason || null,
        source_type: stockForm.change_type === 'IN' ? stockForm.source_type : null,
        out_source: stockForm.change_type === 'OUT' ? (stockForm.out_source || '手动出库') : undefined,
        usage: stockForm.change_type === 'OUT' ? (stockForm.usage || null) : null
      })
      const afterStock = Number(res.data?.new_stock ?? (stockForm.change_type === 'IN' ? beforeStock + delta : beforeStock - delta))
      const actionText = stockForm.change_type === 'IN' ? '入库成功' : '出库成功'
      showToast(`${actionText}：数量 ${delta}，库存 ${beforeStock} → ${afterStock}`)
      notifyInventoryChanged()
      closeStockModal()
      fetchMaterials()
    } catch (e) {
      console.error('库存变动失败', e)
      const msg = e.response?.data?.message || '服务器错误，请稍后重试'
      setStockError(msg)
      showToast(msg, 'error')
    } finally {
      setStockSubmitting(false)
    }
  }

  // 详情弹窗
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const openDetail = async (row) => {
    try {
      const res = await api.get(`/material/detail/${row.material_id}`)
      setDetail(res.data || null)
      setDetailModalOpen(true)
    } catch (e) {
      console.error('加载详情失败', e)
      showToast(e.response?.data?.message || '加载失败', 'error')
    }
  }

  // ---- admin farms list ----
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

  return (
    <div className="material-list-page">
      <div className="material-header">
        <div>
          <h2>农资列表</h2>
          <div className="material-sub">管理种子/化肥/农药/工具库存与上下架</div>
        </div>
        <div className="material-actions">
          <button className="primary-btn" onClick={openAdd} disabled={!canCreateEdit}>
            ＋ 新增农资
          </button>
        </div>
      </div>

      <div className="material-filter-card">
        <div className="filter-row">
          <div className="filter-item">
            <label>农资名称：</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="支持模糊查询"
            />
          </div>
          <div className="filter-item">
            <label>农资类型：</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">全部</option>
              {MATERIAL_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label>状态：</label>
            <select value={stockState} onChange={(e) => setStockState(e.target.value)}>
              <option value="">全部</option>
              <option value="normal">正常</option>
              <option value="low">库存不足</option>
              <option value="out">缺货</option>
              <option value="off">下架</option>
            </select>
          </div>
          {isAdmin && (
            <div className="filter-item">
              <label>所属农场：</label>
              <select value={farmFilterId} onChange={(e) => setFarmFilterId(e.target.value)}>
                <option value="">全部</option>
                {farms.map(f => (
                  <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-actions">
            <button className="outline-btn" onClick={() => { setPage(1) }}>
              搜索
            </button>
            <button className="outline-btn" onClick={() => { setKeyword(''); setType(''); setStockState(''); setFarmFilterId(''); setPage(1) }}>
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="table-card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : rows.length === 0 ? (
          <div className="empty-state-panel">暂无数据</div>
        ) : (
          <table className="material-table">
            <thead>
              <tr>
                <th>农资名称</th>
                <th>所属农场</th>
                <th>类型</th>
                <th>品牌</th>
                <th>规格</th>
                <th>单价</th>
                <th>库存</th>
                <th>安全库存</th>
                <th>状态</th>
                <th>创建时间</th>
                <th style={{ width: 290 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tag = getStockTag(r.stock_state)
                const rowDanger = r.stock_state === '缺货'
                return (
                  <tr key={r.material_id} className={rowDanger ? 'row-danger' : ''}>
                    <td>{r.material_name}</td>
                    <td>{r.farm_name}</td>
                    <td>{r.material_type}</td>
                    <td>{r.brand || '--'}</td>
                    <td>{r.spec || '--'}</td>
                    <td>{r.price != null ? r.price : '--'}</td>
                    <td>{r.stock_num}</td>
                    <td>{r.safety_stock_num}</td>
                    <td>
                      {(r.stock_state === '库存不足' || r.stock_state === '缺货') ? (
                        <button
                          className={`tag ${tag.className} tag-link`}
                          onClick={() => navigate(`/material/warning?status=${r.stock_state === '缺货' ? 'out' : 'low'}`)}
                          title="点击查看库存预警"
                        >
                          {tag.text}
                        </button>
                      ) : (
                        <span className={`tag ${tag.className}`}>{tag.text}</span>
                      )}
                    </td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '--'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="mini-btn" onClick={() => openDetail(r)}>
                          详情
                        </button>
                        {canCreateEdit && (
                          <button className="mini-btn" onClick={() => openEdit(r)}>
                            编辑
                          </button>
                        )}
                        {canDelete && (
                          <button className="mini-btn danger" onClick={() => deleteMaterial(r)}>
                            删除
                          </button>
                        )}
                        {canUpdateStock && (
                          <>
                            <button className="mini-btn" onClick={() => openStockModal(r, 'IN')}>
                              入库
                            </button>
                            <button className="mini-btn" onClick={() => openStockModal(r, 'OUT')}>
                              出库
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="pagination">
          <div className="page-info">
            共 {total} 条，第 {page} / {pageCount} 页
          </div>
          <div className="page-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(1)}>
              首页
            </button>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              上一页
            </button>
            <span className="page-current">{page}</span>
            <button className="page-btn" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
              下一页
            </button>
            <button className="page-btn" disabled={page >= pageCount} onClick={() => setPage(pageCount)}>
              尾页
            </button>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
              <option value={10}>10 / 页</option>
              <option value={20}>20 / 页</option>
              <option value={50}>50 / 页</option>
            </select>
          </div>
        </div>
      </div>

      {/* Toast：已迁移为全局 ToastProvider */}

      {/* 新增/编辑 */}
      {formModalOpen && (
        <div className="modal" onClick={() => setFormModalOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>{formMode === 'add' ? '新增农资' : '编辑农资'}</h3>

            <div className="form-grid">
              {isAdmin && (
                <>
                  <label>所属农场</label>
                  <select value={formFarmId} onChange={(e) => setFormFarmId(e.target.value)}>
                    {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}
                  </select>
                </>
              )}

              <label>农资名称</label>
              <input value={form.material_name} onChange={(e) => setForm(s => ({ ...s, material_name: e.target.value }))} />

              <label>农资类型</label>
              <select value={form.material_type} onChange={(e) => setForm(s => ({ ...s, material_type: e.target.value }))}>
                {MATERIAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <label>品牌</label>
              <input value={form.brand} onChange={(e) => setForm(s => ({ ...s, brand: e.target.value }))} placeholder="可选" />

              <label>规格</label>
              <input value={form.spec} onChange={(e) => setForm(s => ({ ...s, spec: e.target.value }))} placeholder="例如：50kg/袋" />

              <label>单价</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm(s => ({ ...s, price: e.target.value }))}
              />

              <label>库存数量</label>
              <input
                type="number"
                value={form.stock_num}
                onChange={(e) => setForm(s => ({ ...s, stock_num: e.target.value }))}
              />

              <label>安全库存</label>
              <input
                type="number"
                value={form.safety_stock_num}
                onChange={(e) => setForm(s => ({ ...s, safety_stock_num: e.target.value }))}
              />

              <label>上下架</label>
              <select value={form.shelf_status} onChange={(e) => setForm(s => ({ ...s, shelf_status: e.target.value }))}>
                <option value="ON">上架</option>
                <option value="OFF">下架</option>
              </select>
            </div>

            <div className="form-actions">
              <button className="outline-btn" onClick={() => setFormModalOpen(false)}>取消</button>
              <button className="primary-btn" onClick={submitForm}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* 入库/出库 */}
      {stockModalOpen && stockModalMaterial && (
        <div className="modal" onClick={closeStockModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>
              {stockForm.change_type === 'OUT' ? '出库' : '入库'}：{stockModalMaterial.material_name}
            </h3>
            <div className="stock-meta">
              当前库存：<b>{stockModalMaterial.stock_num}</b>
              {stockForm.change_type === 'OUT' ? '（出库不得超过当前库存）' : ''}
            </div>
            <div className="form-grid">
              <label>{stockForm.change_type === 'OUT' ? '出库数量' : '入库数量'}</label>
              <input
                type="number"
                value={stockForm.delta_qty}
                onChange={(e) => setStockForm(s => ({ ...s, delta_qty: e.target.value }))}
                disabled={stockSubmitting}
              />

              <label>{stockForm.change_type === 'OUT' ? '出库时间' : '入库时间'}</label>
              <input
                type="datetime-local"
                value={stockForm.operation_time || ''}
                onChange={(e) => setStockForm(s => ({ ...s, operation_time: e.target.value }))}
                disabled={stockSubmitting}
              />

              {stockForm.change_type === 'IN' && (
                <>
                  <label>入库来源</label>
                  <select
                    value={stockForm.source_type || ''}
                    onChange={e => setStockForm(s => ({ ...s, source_type: e.target.value }))}
                    disabled={stockSubmitting}
                  >
                    <option value="手动入库">手动入库</option>
                    <option value="调整库存">调整库存</option>
                    <option value="其他">其他</option>
                  </select>
                </>
              )}

              {stockForm.change_type === 'OUT' && (
                <>
                  <label>出库来源</label>
                  <select
                    value={stockForm.out_source || '手动出库'}
                    onChange={(e) => setStockForm(s => ({ ...s, out_source: e.target.value }))}
                    disabled={stockSubmitting}
                  >
                    <option value="手动出库">手动出库</option>
                    <option value="使用">使用</option>
                    <option value="施肥">施肥</option>
                    <option value="灌溉">灌溉</option>
                  </select>
                  <label>使用用途（可选）</label>
                  <input
                    value={stockForm.usage}
                    onChange={(e) => setStockForm(s => ({ ...s, usage: e.target.value }))}
                    placeholder="例如：番茄区施用"
                    disabled={stockSubmitting}
                  />
                </>
              )}

              <label>备注</label>
              <input
                value={stockForm.reason}
                onChange={(e) => setStockForm(s => ({ ...s, reason: e.target.value }))}
                placeholder={stockForm.change_type === 'OUT' ? '出库备注（可选）' : '入库备注（可选）'}
                disabled={stockSubmitting}
              />
            </div>
            {stockError ? <div className="stock-error">{stockError}</div> : null}
            <div className="form-actions">
              <button className="outline-btn" onClick={closeStockModal} disabled={stockSubmitting}>取消</button>
              <button className="primary-btn" onClick={submitStock} disabled={stockSubmitting}>
                {stockSubmitting ? '提交中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情 */}
      {detailModalOpen && detail && (
        <div className="modal" onClick={() => setDetailModalOpen(false)}>
          <div className="modal-panel detail-panel" onClick={(e) => e.stopPropagation()}>
            <h3>农资详情</h3>

            <div className="detail-kv">
              <div className="kv-row">
                <div className="kv-label">名称</div>
                <div className="kv-value">{detail.material.material_name}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">类型</div>
                <div className="kv-value">{detail.material.material_type}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">所属农场</div>
                <div className="kv-value">{detail.material.farm_name || '--'}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">品牌</div>
                <div className="kv-value">{detail.material.brand || '--'}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">规格</div>
                <div className="kv-value">{detail.material.spec || '--'}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">单价</div>
                <div className="kv-value">{detail.material.price}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">库存/安全库存</div>
                <div className="kv-value">{detail.material.stock_num} / {detail.material.safety_stock_num}</div>
              </div>
              <div className="kv-row">
                <div className="kv-label">状态</div>
                <div className="kv-value">
                  <span className={`tag ${getStockTag(detail.material.stock_state).className}`}>
                    {detail.material.stock_state}
                  </span>
                </div>
              </div>
              <div className="kv-row">
                <div className="kv-label">上下架</div>
                <div className="kv-value">{detail.material.shelf_status === 'OFF' ? '下架' : '上架'}</div>
              </div>
            </div>

            <div className="detail-logs">
              <div className="detail-logs-title">库存变动记录（最近10条）</div>
              {(!detail.logs || detail.logs.length === 0) ? (
                <div className="muted">暂无变动记录</div>
              ) : (
                <div className="logs-list">
                  {detail.logs.map(l => (
                    <div key={l.stock_log_id} className="log-item">
                      <div className="log-time">{l.created_at ? new Date(l.created_at).toLocaleString() : '--'}</div>
                      <div className="log-body">
                        <div className="log-type">
                          {l.change_type === 'IN' ? '入库' : '出库'}：{l.delta_qty}
                        </div>
                        {l.change_type === 'IN' && l.source_type ? (
                          <div className="log-reason">来源：{l.source_type}</div>
                        ) : null}
                        {l.change_type === 'OUT' && l.usage ? (
                          <div className="log-reason">用途：{l.usage}</div>
                        ) : null}
                        <div className="log-reason">{l.reason || '--'}</div>
                        <div className="log-operator">操作人：{l.operator_name || '--'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button className="primary-btn" onClick={() => setDetailModalOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MaterialList

