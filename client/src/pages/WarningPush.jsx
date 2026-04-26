import React, { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './WarningPages.css'

const WarningPush = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [farms, setFarms] = useState([])
  const [farmFilter, setFarmFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'error') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const loadFarms = useCallback(async () => {
    if (!isAdmin) return
    try {
      const res = await api.get('/farm/list', { params: { page: 1, pageSize: 200 } })
      setFarms(res.data?.data || [])
    } catch (e) {
      console.error(e)
    }
  }, [isAdmin])

  const loadPushes = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/warning/pushes', {
        params: {
          page,
          pageSize,
          farm_id: isAdmin && farmFilter ? farmFilter : undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      showToast(e.response?.data?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, isAdmin, farmFilter])

  useEffect(() => {
    loadFarms()
  }, [loadFarms])

  useEffect(() => {
    loadPushes()
  }, [loadPushes])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const formatMobileTime = (value) => {
    if (!value) return '—'
    const d = new Date(value)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div className="warning-module-page">
      <div className="warning-module-header">
        <h2>异常推送记录</h2>
        <p className="warning-module-sub">
          异常产生时系统自动写入推送记录（站内信）。管理员可查看全部推送；农场用户仅能看到发给自己的记录。
        </p>
      </div>

      <div className={`warning-toolbar ${isMobile ? 'mobile-collapsed' : ''}`}>
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
        {isAdmin ? (
          <div className="field">
            <label>按农场筛选</label>
            <select value={farmFilter} onChange={(e) => { setFarmFilter(e.target.value); setPage(1) }}>
              <option value="">全部</option>
              {farms.map((f) => (
                <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="warning-toolbar-actions">
          <button type="button" className="btn-ghost" onClick={loadPushes} disabled={loading}>
            刷新
          </button>
        </div>
      </div>
      {isMobile && showMobileFilters ? <div className="mobile-sheet-backdrop" onClick={() => setShowMobileFilters(false)} /> : null}
      {isMobile ? (
        <div className={`warning-toolbar ${showMobileFilters ? 'mobile-filter-sheet' : 'mobile-collapsed'}`}>
          {isAdmin ? (
            <div className="field">
              <label>按农场筛选</label>
              <select value={farmFilter} onChange={(e) => { setFarmFilter(e.target.value); setPage(1) }}>
                <option value="">全部</option>
                {farms.map((f) => (
                  <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="warning-toolbar-actions">
            <button type="button" className="btn-ghost" onClick={loadPushes} disabled={loading}>
              刷新
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowMobileFilters(false)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <div className="warning-table-card">
        {loading && rows.length === 0 ? (
          <div className="warning-empty">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="warning-empty">暂无推送记录</div>
        ) : (
          <table className="warning-data-table mobile-card-table">
            <thead>
              <tr>
                <th>推送时间</th>
                <th>方式</th>
                <th>接收人</th>
                <th>农场 / 作物 / 区域</th>
                <th>异常类型</th>
                <th>处理状态</th>
                <th>已读</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.push_id}>
                  <td data-label="推送时间">{r.push_time ? new Date(r.push_time).toLocaleString() : '—'}</td>
                  <td data-label="方式">{r.push_method || '—'}</td>
                  <td data-label="接收人">{r.receiver_name || r.receiver_id}</td>
                  <td data-label="农场 / 作物 / 区域">
                    {r.farm_name} · {r.crop_name || '—'} · {r.plant_area || '—'}
                  </td>
                  <td data-label="异常类型">{r.exception_type}</td>
                  <td data-label="处理状态">{r.handle_status}</td>
                  <td data-label="已读">{r.read_status === '已读' || r.read_status === 1 || r.read_status === '1' ? '已读' : '未读'}</td>
                  <td data-label="详情" style={{ maxWidth: 260, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                    {r.exception_detail || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isMobile && !loading && rows.length > 0 ? (
          <div className="mobile-record-list">
            {rows.map((r) => (
              <article key={`m-${r.push_id}`} className="mobile-record-card">
                <div className="mobile-record-head">
                  <div className="mobile-record-title">{r.exception_type || '异常推送'}</div>
                  <span className={`tag ${(r.read_status === '已读' || r.read_status === 1 || r.read_status === '1') ? 'tag-normal' : 'tag-warn'}`}>
                    {(r.read_status === '已读' || r.read_status === 1 || r.read_status === '1') ? '已读' : '未读'}
                  </span>
                </div>
                <div className="mobile-record-grid">
                  <div><span className="k">推送时间</span><span className="v">{formatMobileTime(r.push_time)}</span></div>
                  <div><span className="k">方式</span><span className="v">{r.push_method || '—'}</span></div>
                  <div><span className="k">接收人</span><span className="v">{r.receiver_name || r.receiver_id || '—'}</span></div>
                  <div><span className="k">处理状态</span><span className="v">{r.handle_status || '—'}</span></div>
                  {expandedIds.has(r.push_id) ? (
                    <>
                      <div className="is-full"><span className="k">农场/作物</span><span className="v">{r.farm_name} · {r.crop_name || '—'}</span></div>
                      <div><span className="k">区域</span><span className="v">{r.plant_area || '—'}</span></div>
                      <div className="is-full"><span className="k">详情</span><span className="v">{r.exception_detail || '—'}</span></div>
                    </>
                  ) : null}
                </div>
                <div className="mobile-record-actions">
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => setExpandedIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(r.push_id)) next.delete(r.push_id)
                      else next.add(r.push_id)
                      return next
                    })}
                  >
                    {expandedIds.has(r.push_id) ? '收起' : '更多'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="warning-pagination">
        <span>共 {total} 条</span>
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
        <span>{page} / {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
      </div>

      {toast ? (
        <div className={`warning-toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </div>
  )
}

export default WarningPush
