import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './StockFlow.css'

const formatDt = (v) => {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN', { hour12: false })
}

const StockFlow = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const [filters, setFilters] = useState({
    change_type: '',
    farm_id: '',
    material_name: '',
    from: '',
    to: ''
  })

  const [farms, setFarms] = useState([])
  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const fetchList = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/material/stock-flow/list', {
        params: {
          page,
          pageSize,
          change_type: filters.change_type || undefined,
          farm_id: isAdmin ? (filters.farm_id || undefined) : undefined,
          material_name: filters.material_name || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      console.error('库存流水加载失败', e)
      showToast(e.response?.data?.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters, isAdmin])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isMobile) setShowMobileFilters(false)
  }, [isMobile])

  useEffect(() => {
    const run = async () => {
      if (!isAdmin) return
      try {
        const farmRes = await api.get('/farm/list', { params: { page: 1, pageSize: 1000 } })
        setFarms(farmRes.data?.data || [])
      } catch (e) {
        console.error('加载农场失败', e)
      }
    }
    run()
  }, [isAdmin])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  return (
    <div className="stock-flow-page">
      <div className="stock-flow-header">
        <div>
          <h2>库存流水</h2>
          <div className="stock-flow-hint">
            采购入账走采购入库流水；列表手动入出库、施肥/灌溉选用农资时的扣减均在此统一查询。
          </div>
        </div>
      </div>

      {isMobile ? (
        <div className="filter-toggle-card">
          <div className="mobile-toolbar-actions">
            <button
              type="button"
              className="mobile-icon-btn"
              onClick={() => setShowMobileFilters((v) => !v)}
              title={showMobileFilters ? '收起筛选' : '展开筛选'}
              aria-label={showMobileFilters ? '收起筛选' : '展开筛选'}
            >
              🔍
            </button>
            <div style={{ color: 'var(--cockpit-text-secondary)', fontSize: 12 }}>
              {showMobileFilters ? '搜索条件' : '点击展开搜索'}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`filter-card ${isMobile && !showMobileFilters ? 'mobile-collapsed' : ''}`}>
        <div className="filter-row">
          <div className="filter-item">
            <label>操作类型</label>
            <select
              value={filters.change_type}
              onChange={(e) => setFilters((p) => ({ ...p, change_type: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="IN">入库</option>
              <option value="OUT">出库</option>
            </select>
          </div>
          {isAdmin && (
            <div className="filter-item">
              <label>农场</label>
              <select
                value={filters.farm_id}
                onChange={(e) => setFilters((p) => ({ ...p, farm_id: e.target.value }))}
              >
                <option value="">全部</option>
                {farms.map((f) => (
                  <option key={f.farm_id} value={f.farm_id}>
                    {f.farm_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-item">
            <label>农资名称</label>
            <input
              value={filters.material_name}
              onChange={(e) => setFilters((p) => ({ ...p, material_name: e.target.value }))}
              placeholder="模糊搜索"
            />
          </div>
          <div className="filter-item">
            <label>开始日期</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="filter-item">
            <label>结束日期</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="filter-actions">
            <button
              className="primary-btn"
              type="button"
              onClick={() => {
                setPage(1)
                if (isMobile) setShowMobileFilters(false)
              }}
            >
              筛选
            </button>
          </div>
        </div>
      </div>

      <div className="table-card">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <table className="flow-table mobile-card-table">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>农资名称</th>
                <th>农场</th>
                <th>操作类型</th>
                <th>操作来源</th>
                <th>数量</th>
                <th>操作人</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => (
                <tr key={r.stock_log_id}>
                  <td data-label="操作时间">{formatDt(r.created_at)}</td>
                  <td data-label="农资名称">{r.material_name}</td>
                  <td data-label="农场">{r.farm_name}</td>
                  <td data-label="操作类型">
                    <span className={`tag-flow ${r.change_type === 'IN' ? 'tag-flow-in' : 'tag-flow-out'}`}>
                      {r.change_type === 'IN' ? '入库' : '出库'}
                    </span>
                  </td>
                  <td data-label="操作来源">{r.flow_source_label || '-'}</td>
                  <td data-label="数量" className={r.change_type === 'IN' ? 'qty-in' : 'qty-out'}>
                    {r.change_type === 'IN' ? '+' : '-'}
                    {r.delta_qty}
                  </td>
                  <td data-label="操作人">{r.operator_name || '-'}</td>
                  <td data-label="备注">{r.reason || r.usage_purpose || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pagination">
          <div>共 {total} 条</div>
          <div className="page-controls">
            <span className="page-current">第 {page} / {pageCount} 页</span>
            <button
              type="button"
              className="page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="page-btn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
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
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  每页 {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {toast ? (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </div>
  )
}

export default StockFlow
