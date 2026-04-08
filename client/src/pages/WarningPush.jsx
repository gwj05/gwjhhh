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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="warning-module-page">
      <div className="warning-module-header">
        <h2>异常推送记录</h2>
        <p className="warning-module-sub">
          异常产生时系统自动写入推送记录（站内信）。管理员可查看全部推送；农场用户仅能看到发给自己的记录。
        </p>
      </div>

      <div className="warning-toolbar">
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
        <button type="button" className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={loadPushes} disabled={loading}>
          刷新
        </button>
      </div>

      <div className="warning-table-card">
        {loading && rows.length === 0 ? (
          <div className="warning-empty">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="warning-empty">暂无推送记录</div>
        ) : (
          <table className="warning-data-table">
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
                  <td>{r.push_time ? new Date(r.push_time).toLocaleString() : '—'}</td>
                  <td>{r.push_method || '—'}</td>
                  <td>{r.receiver_name || r.receiver_id}</td>
                  <td>
                    {r.farm_name} · {r.crop_name || '—'} · {r.plant_area || '—'}
                  </td>
                  <td>{r.exception_type}</td>
                  <td>{r.handle_status}</td>
                  <td>{r.read_status === '已读' || r.read_status === 1 || r.read_status === '1' ? '已读' : '未读'}</td>
                  <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.exception_detail || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
