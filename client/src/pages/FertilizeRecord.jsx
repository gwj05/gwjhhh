import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { notifyInventoryChanged } from '../utils/inventoryEvents'
import { useAuth } from '../context/AuthContext'
import './OperationPages.css'

const FERT_METHODS = ['撒施', '滴灌', '沟施', '叶面喷施', '冲施', '其他']

const getDatetimeLocal = (d) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const FertilizeRecord = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1
  const canCreate = [1, 2, 3].includes(user?.role_id)
  const canEdit = [1, 2].includes(user?.role_id)
  const canDelete = user?.role_id === 1

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState({
    farm_id: '',
    area_name: '',
    crop_id: '',
    from: '',
    to: ''
  })

  const [options, setOptions] = useState({ farms: [], areas: [], crops: [], materials: [] })
  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchOptions = useCallback(async () => {
    try {
      const res = await api.get('/operation/options', {
        params: {
          farm_id: isAdmin ? filters.farm_id : undefined,
          area_name: filters.area_name || undefined
        }
      })
      setOptions(res.data || { farms: [], areas: [], crops: [], materials: [] })
    } catch (e) {
      console.error('加载选项失败', e)
    }
  }, [isAdmin, filters.farm_id, filters.area_name])

  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/operation/list', {
        params: {
          page,
          pageSize,
          operation_type: '施肥',
          ...filters,
          farm_id: isAdmin ? filters.farm_id : undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
      setStats(res.data?.stats || {})
    } catch (e) {
      showToast(e.response?.data?.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters, isAdmin])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [form, setForm] = useState({
    farm_id: '',
    area_name: '',
    crop_id: '',
    material_id: '',
    op_subtype: '',
    method: '',
    amount: '',
    unit: 'kg',
    operation_time: '',
    operation_detail: '',
    remark: ''
  })

  const fetchSuggest = useCallback(
    async (f) => {
      if (!f.area_name) return setSuggestions([])
      try {
        const res = await api.get('/operation/suggest', {
          params: {
            operation_type: '施肥',
            farm_id: isAdmin ? (f.farm_id || filters.farm_id) : undefined,
            area_name: f.area_name,
            crop_id: f.crop_id || undefined
          }
        })
        setSuggestions(res.data?.tips || [])
      } catch {
        setSuggestions([])
      }
    },
    [isAdmin, filters.farm_id]
  )

  useEffect(() => {
    if (showForm) fetchSuggest(form)
  }, [showForm, form, fetchSuggest])

  const openCreate = () => {
    if (!canCreate) return
    setEditing(null)
    setSuggestions([])
    setForm({
      farm_id: '',
      area_name: '',
      crop_id: '',
      material_id: '',
      op_subtype: '',
      method: '',
      amount: '',
      unit: 'kg',
      operation_time: getDatetimeLocal(new Date()),
      operation_detail: '',
      remark: ''
    })
    setShowForm(true)
  }

  const openEdit = (r) => {
    if (!canEdit) return
    setEditing(r)
    setForm({
      farm_id: r.farm_id || '',
      area_name: r.area_name || '',
      crop_id: r.crop_id || '',
      material_id: r.material_id || '',
      op_subtype: r.op_subtype || '',
      method: r.method || '',
      amount: r.amount ?? '',
      unit: r.unit || 'kg',
      operation_time: r.operation_time
        ? new Date(r.operation_time).toISOString().slice(0, 16)
        : getDatetimeLocal(new Date()),
      operation_detail: r.operation_detail || '',
      remark: r.remark || ''
    })
    setShowForm(true)
  }

  const submitForm = async () => {
    if (!form.area_name) return showToast('请选择种植区域', 'error')
    if (!form.material_id) return showToast('请选择农资', 'error')
    const amt = Number(form.amount)
    if (Number.isNaN(amt) || amt <= 0) return showToast('使用量必须大于0', 'error')
    if (!form.method) return showToast('请选择操作方式', 'error')
    try {
      setSubmitting(true)
      if (editing) {
        await api.put(`/operation/update/${editing.record_id}`, {
          ...form,
          farm_id: isAdmin ? form.farm_id : undefined
        })
        showToast('更新成功')
        notifyInventoryChanged()
      } else {
        await api.post('/operation/create', {
          operation_type: '施肥',
          farm_id: isAdmin ? form.farm_id : undefined,
          area_name: form.area_name,
          crop_id: form.crop_id || null,
          material_id: form.material_id,
          op_subtype: form.op_subtype || null,
          method: form.method,
          amount: amt,
          unit: form.unit || 'kg',
          operation_time: form.operation_time || null,
          operation_detail: form.operation_detail || null,
          remark: form.remark || null
        })
        showToast('新增成功（已自动扣减库存并写入流水）')
        notifyInventoryChanged()
      }
      setShowForm(false)
      fetchList()
    } catch (e) {
      showToast(e.response?.data?.message || '提交失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (r) => {
    if (!canDelete) return
    if (!window.confirm('确认删除该施肥记录？仅管理员可操作，且不自动回滚历史库存。')) return
    try {
      await api.delete(`/operation/delete/${r.record_id}`)
      showToast('删除成功')
      fetchList()
    } catch (e) {
      showToast(e.response?.data?.message || '删除失败', 'error')
    }
  }

  return (
    <div className="operation-page">
      <div className="op-header">
        <div>
          <h2>施肥记录</h2>
          <div className="op-sub">提交后自动扣减农资库存、写入库存流水（来源：施肥），并同步到操作记录查询。</div>
        </div>
        {canCreate ? (
          <button type="button" className="primary-btn" onClick={openCreate}>
            新增施肥
          </button>
        ) : null}
      </div>

      <div className="stats-row cols-2">
        <div className="stat-card">
          <div className="label">施肥次数（当前筛选）</div>
          <div className="value">{stats.fertilize_count ?? total}</div>
        </div>
        <div className="stat-card">
          <div className="label">记录条数</div>
          <div className="value">{total}</div>
        </div>
      </div>

      <div className="filter-card">
        <div className="filter-row">
          {isAdmin && (
            <div className="filter-item">
              <label>农场</label>
              <select
                value={filters.farm_id}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, farm_id: e.target.value, area_name: '', crop_id: '' }))
                }
              >
                <option value="">全部</option>
                {options.farms.map((f) => (
                  <option key={f.farm_id} value={f.farm_id}>
                    {f.farm_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-item">
            <label>区域</label>
            <select
              value={filters.area_name}
              onChange={(e) => setFilters((p) => ({ ...p, area_name: e.target.value, crop_id: '' }))}
            >
              <option value="">全部</option>
              {options.areas.map((a) => (
                <option key={a.area_name} value={a.area_name}>
                  {a.area_name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label>作物</label>
            <select
              value={filters.crop_id}
              onChange={(e) => setFilters((p) => ({ ...p, crop_id: e.target.value }))}
            >
              <option value="">全部</option>
              {options.crops.map((c) => (
                <option key={c.crop_id} value={c.crop_id}>
                  {c.crop_name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label>开始</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="filter-item">
            <label>结束</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="filter-actions">
            <button type="button" className="outline-btn" onClick={() => setPage(1)}>
              筛选
            </button>
          </div>
        </div>
      </div>

      <div className="table-card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <table className="op-table mobile-card-table">
            <thead>
              <tr>
                <th>农场</th>
                <th>区域</th>
                <th>作物</th>
                <th>农资</th>
                <th>使用量</th>
                <th>方式</th>
                <th>操作内容</th>
                <th>操作时间</th>
                <th>操作人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_id}>
                  <td data-label="农场">{r.farm_name || '--'}</td>
                  <td data-label="区域">{r.area_name || '--'}</td>
                  <td data-label="作物">{r.crop_name || '--'}</td>
                  <td data-label="农资">{r.material_name || '--'}</td>
                  <td data-label="使用量">
                    {r.amount != null ? `${r.amount}${r.unit || ''}` : '--'}
                  </td>
                  <td data-label="方式">{r.method || '--'}</td>
                  <td data-label="操作内容">{r.operation_detail || '--'}</td>
                  <td data-label="操作时间">{r.operation_time ? new Date(r.operation_time).toLocaleString() : '--'}</td>
                  <td data-label="操作人">{r.operator_name || '--'}</td>
                  <td data-label="操作">
                    <div className="row-actions">
                      {canEdit ? (
                        <button type="button" className="mini-btn" onClick={() => openEdit(r)}>
                          编辑
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button type="button" className="mini-btn danger" onClick={() => handleDelete(r)}>
                          删除
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pagination">
          <div>
            共 {total} 条，第 {page} / {pageCount} 页
          </div>
          <div className="page-controls">
            <button
              type="button"
              className="page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <span className="page-current">{page}</span>
            <button
              type="button"
              className="page-btn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              下一页
            </button>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value={10}>10 / 页</option>
              <option value={20}>20 / 页</option>
              <option value={50}>50 / 页</option>
            </select>
          </div>
        </div>
      </div>

      {showForm ? (
        <div className="modal" onClick={() => !submitting && setShowForm(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? '编辑施肥记录' : '新增施肥记录'}</h3>
            {suggestions.length > 0 ? (
              <div className="tips-box">
                {suggestions.map((t, i) => (
                  <div key={i} className={`tip ${t.level}`}>
                    {t.text}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="form-grid">
              {isAdmin ? (
                <>
                  <label>农场</label>
                  <select
                    value={form.farm_id}
                    onChange={(e) => setForm((p) => ({ ...p, farm_id: e.target.value }))}
                  >
                    <option value="">请选择</option>
                    {options.farms.map((f) => (
                      <option key={f.farm_id} value={f.farm_id}>
                        {f.farm_name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label>种植区域</label>
              <select
                value={form.area_name}
                onChange={(e) => setForm((p) => ({ ...p, area_name: e.target.value }))}
              >
                <option value="">请选择</option>
                {options.areas.map((a) => (
                  <option key={a.area_name} value={a.area_name}>
                    {a.area_name}
                  </option>
                ))}
              </select>
              <label>作物</label>
              <select
                value={form.crop_id}
                onChange={(e) => setForm((p) => ({ ...p, crop_id: e.target.value }))}
              >
                <option value="">可选</option>
                {options.crops.map((c) => (
                  <option key={c.crop_id} value={c.crop_id}>
                    {c.crop_name}
                  </option>
                ))}
              </select>
              <label>农资名称</label>
              <select
                value={form.material_id}
                onChange={(e) => setForm((p) => ({ ...p, material_id: e.target.value }))}
              >
                <option value="">请选择</option>
                {options.materials.map((m) => (
                  <option key={m.material_id} value={m.material_id}>
                    {m.material_name}（库存 {m.stock_num}）
                  </option>
                ))}
              </select>
              <label>肥料类型</label>
              <input
                value={form.op_subtype}
                onChange={(e) => setForm((p) => ({ ...p, op_subtype: e.target.value }))}
                placeholder="如：氮肥 / 复合肥（可选）"
              />
              <label>使用量</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              />
              <label>单位</label>
              <select
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              >
                <option value="kg">kg</option>
                <option value="吨">吨</option>
                <option value="L">L</option>
                <option value="袋">袋</option>
              </select>
              <label>操作方式</label>
              <select
                value={form.method}
                onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
              >
                <option value="">请选择</option>
                {FERT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <label>操作时间</label>
              <input
                type="datetime-local"
                value={form.operation_time}
                onChange={(e) => setForm((p) => ({ ...p, operation_time: e.target.value }))}
              />
              <label>操作内容</label>
              <input
                value={form.operation_detail}
                onChange={(e) => setForm((p) => ({ ...p, operation_detail: e.target.value }))}
                placeholder="可留空，将按字段自动生成"
              />
              <label>备注</label>
              <input
                value={form.remark}
                onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="outline-btn" onClick={() => setShowForm(false)} disabled={submitting}>
                取消
              </button>
              <button type="button" className="primary-btn" onClick={submitForm} disabled={submitting}>
                {submitting ? '提交中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div> : null}
    </div>
  )
}

export default FertilizeRecord
