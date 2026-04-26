import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './OperationPages.css'

const OperationRecordQuery = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [filters, setFilters] = useState({
    farm_id: '',
    area_name: '',
    crop_id: '',
    operation_type: '',
    from: '',
    to: ''
  })

  const [options, setOptions] = useState({ farms: [], areas: [], crops: [] })
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
      setOptions(res.data || { farms: [], areas: [], crops: [] })
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
          ...filters,
          operation_type: filters.operation_type || undefined
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
  }, [page, pageSize, filters])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isMobile) {
      setShowMobileFilters(false)
    }
  }, [isMobile])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  return (
    <div className="operation-page">
      <div className="op-header">
        <div>
          <h2>操作记录查询</h2>
          <div className="op-sub">汇总施肥与灌溉记录，仅查看、不可在此新增或修改。</div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="label">总操作次数</div>
          <div className="value">{stats.total_ops || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">施肥次数</div>
          <div className="value">{stats.fertilize_count || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">灌溉次数</div>
          <div className="value">{stats.irrigate_count || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">总用水量(L)</div>
          <div className="value">{Number(stats.total_water || 0).toFixed(1)}</div>
        </div>
      </div>

      <div className="filter-card">
        {isMobile ? (
          <div className="mobile-toolbar-actions">
            <button
              type="button"
              className="mobile-icon-btn"
              onClick={() => setShowMobileFilters((v) => !v)}
              title="搜索"
              aria-label="搜索"
            >
              🔍
            </button>
          </div>
        ) : null}
        <div className={`filter-row ${isMobile && !showMobileFilters ? 'mobile-collapsed' : ''}`}>
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
            <label>操作类型</label>
            <select
              value={filters.operation_type}
              onChange={(e) => setFilters((p) => ({ ...p, operation_type: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="施肥">施肥</option>
              <option value="灌溉">灌溉</option>
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
        ) : rows.length === 0 ? (
          <div className="loading">暂无数据</div>
        ) : (
          <table className="op-table mobile-card-table">
            <thead>
              <tr>
                <th>操作类型</th>
                <th>农场</th>
                <th>区域</th>
                <th>作物</th>
                <th>农资</th>
                <th>操作内容</th>
                <th>操作时间</th>
                <th>操作人</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.record_id}>
                  <td data-label="操作类型">{r.operation_type}</td>
                  <td data-label="农场">{r.farm_name || '--'}</td>
                  <td data-label="区域">{r.area_name || '--'}</td>
                  <td data-label="作物">{r.crop_name || '--'}</td>
                  <td data-label="农资">
                    {r.operation_type === '施肥'
                      ? r.material_name || '--'
                      : '--'}
                  </td>
                  <td data-label="操作内容">{r.operation_detail || '--'}</td>
                  <td data-label="操作时间">{r.operation_time ? new Date(r.operation_time).toLocaleString() : '--'}</td>
                  <td data-label="操作人">{r.operator_name || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isMobile && !loading && rows.length > 0 ? (
          <div className="mobile-record-list">
            {rows.map((r) => (
              <article key={`m-${r.record_id}`} className="mobile-record-card">
                <div className="mobile-record-head">
                  <div className="mobile-record-title">{r.operation_type}</div>
                  <span className="tag tag-normal">{r.crop_name || '未知作物'}</span>
                </div>
                <div className="mobile-record-grid">
                  <div><span className="k">农场</span><span className="v">{r.farm_name || '--'}</span></div>
                  <div><span className="k">区域</span><span className="v">{r.area_name || '--'}</span></div>
                  <div><span className="k">农资</span><span className="v">{r.operation_type === '施肥' ? (r.material_name || '--') : '--'}</span></div>
                  <div><span className="k">操作人</span><span className="v">{r.operator_name || '--'}</span></div>
                  <div><span className="k">操作时间</span><span className="v">{r.operation_time ? new Date(r.operation_time).toLocaleString() : '--'}</span></div>
                  <div><span className="k">操作内容</span><span className="v">{r.operation_detail || '--'}</span></div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

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

      {toast ? <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div> : null}
    </div>
  )
}

export default OperationRecordQuery
