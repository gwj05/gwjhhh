import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage } from '../utils/errorMessage'

/**
 * /farm/detail 入口：
 * — 已有当前农场 → 直达 /farm/detail/:id
 * — 非管理员 → 所属农场详情
 * — 管理员且未选具体农场 → 本页选择农场（不再跳转到农场列表，避免与「列表」菜单混淆）
 */
const FarmDetailEntry = () => {
  const navigate = useNavigate()
  const { user, currentFarmId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [farms, setFarms] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setError(null)

      if (currentFarmId) {
        navigate(`/farm/detail/${currentFarmId}`, { replace: true })
        return
      }

      if (user?.role_id !== 1 && user?.farm_id) {
        navigate(`/farm/detail/${user.farm_id}`, { replace: true })
        return
      }

      if (user?.role_id === 1) {
        try {
          const res = await api.get('/farm/list', {
            params: { page: 1, pageSize: 500, sortField: 'farm_name', sortOrder: 'asc' }
          })
          if (!cancelled) {
            setFarms(res.data?.data || [])
          }
        } catch (e) {
          if (!cancelled) {
            setError(getErrorMessage(e, '加载农场列表失败'))
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
        return
      }

      if (!cancelled) {
        setError('暂无农场数据，请先在农场列表中创建农场。')
        setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate, user?.role_id, user?.farm_id, currentFarmId])

  if (currentFarmId || (user?.role_id !== 1 && user?.farm_id)) {
    return (
      <div className="farm-detail-entry-page farm-detail-entry-loading">
        <p>正在进入农场详情…</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="farm-detail-entry-page farm-detail-entry-loading">
        <p>加载中…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="farm-detail-entry-page">
        <div className="farm-detail-entry-card farm-detail-entry-card--narrow">
          <p className="farm-detail-entry-error">{error}</p>
          <Link className="farm-detail-entry-link" to="/farm/list">
            前往农场列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="farm-detail-entry-page">
      <div className="farm-detail-entry-header">
        <h1 className="farm-detail-entry-title">农场详情</h1>
        <p className="farm-detail-entry-desc">
          当前为「全部农场」上下文。请选择一个农场查看详情、环境与数据；新增、编辑或删除农场请使用左侧菜单中的「农场列表」。
        </p>
        <Link className="farm-detail-entry-link farm-detail-entry-link--inline" to="/farm/list">
          打开农场列表（管理）
        </Link>
      </div>

      {farms.length === 0 ? (
        <div className="farm-detail-entry-card">
          <p className="farm-detail-entry-empty">暂无农场数据，请先在农场列表中创建。</p>
          <Link className="farm-detail-entry-link" to="/farm/list">
            前往农场列表
          </Link>
        </div>
      ) : (
        <ul className="farm-detail-entry-grid">
          {farms.map((f) => (
            <li key={f.farm_id}>
              <button
                type="button"
                className="farm-detail-entry-item"
                onClick={() => navigate(`/farm/detail/${f.farm_id}`)}
              >
                <span className="farm-detail-entry-item-name">{f.farm_name || `农场 #${f.farm_id}`}</span>
                <span className="farm-detail-entry-item-meta">
                  {f.principal_name ? `负责人：${f.principal_name}` : '进入详情 →'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FarmDetailEntry
