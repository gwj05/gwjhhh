import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './FarmManager.css'

const FarmManager = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('list') // list / logs
  const [loading, setLoading] = useState(false)
  const [principals, setPrincipals] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedIds, setSelectedIds] = useState([])
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [showMobileFiltersList, setShowMobileFiltersList] = useState(false)
  const [showMobileFiltersLogs, setShowMobileFiltersLogs] = useState(false)
  const [expandedPrincipalIds, setExpandedPrincipalIds] = useState(() => new Set())
  const [expandedLogIds, setExpandedLogIds] = useState(() => new Set())
  
  // 筛选条件
  const [filters, setFilters] = useState({
    real_name: '',
    phone: '',
    permission_scope: '',
    farm_id: ''
  })

  // 绑定表单
  const [showBindForm, setShowBindForm] = useState(false)
  const [bindForm, setBindForm] = useState({
    farm_id: '',
    user_ids: [],
    principal_type: '主'
  })
  const [availablePrincipals, setAvailablePrincipals] = useState([])
  const [availableFarms, setAvailableFarms] = useState([])
  const [bindSubmitting, setBindSubmitting] = useState(false)

  // 权限编辑表单
  const [showPermissionForm, setShowPermissionForm] = useState(false)
  const [editingBinding, setEditingBinding] = useState(null)
  const [permissionForm, setPermissionForm] = useState({
    view_modules: [],
    operation_permissions: {}
  })
  const [permissionSubmitting, setPermissionSubmitting] = useState(false)

  // 操作日志
  const [logs, setLogs] = useState([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logFilters, setLogFilters] = useState({
    farm_id: '',
    operation_type: '',
    time_from: '',
    time_to: ''
  })

  const [toast, setToast] = useState(null)

  const isAdmin = user?.role_id === 1

  // 显示提示
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 获取负责人列表
  const fetchPrincipals = async () => {
    try {
      setLoading(true)
      const params = {
        page,
        pageSize,
        ...filters
      }
      // 移除空值参数
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null || params[key] === undefined) {
          delete params[key]
        }
      })
      console.log('获取负责人列表，参数:', params)
      const res = await api.get('/principal/list', { params })
      console.log('负责人列表响应:', res.data)
      setPrincipals(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch (error) {
      console.error('获取负责人列表失败:', error)
      console.error('错误详情:', error.response?.data)
      showToast(error.response?.data?.message || '获取负责人列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  // 页面加载和筛选条件变化时获取数据
  useEffect(() => {
    if (activeTab === 'list') {
      fetchPrincipals()
    } else {
      fetchLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters, activeTab, logPage, logFilters])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 获取可绑定的负责人列表
  const fetchAvailablePrincipals = async (farmId) => {
    try {
      const res = await api.get('/principal/available', {
        params: { farm_id: farmId }
      })
      setAvailablePrincipals(res.data || [])
    } catch (error) {
      console.error('获取可绑定负责人列表失败:', error)
      showToast('获取可绑定负责人列表失败', 'error')
    }
  }

  // 获取农场列表（用于下拉选择）
  const fetchFarms = async () => {
    try {
      const res = await api.get('/farm/list', {
        params: { page: 1, pageSize: 100 }
      })
      setAvailableFarms(res.data.data || [])
    } catch (error) {
      console.error('获取农场列表失败:', error)
    }
  }

  // 打开绑定表单
  const handleOpenBindForm = () => {
    setBindForm({
      farm_id: filters.farm_id || '',
      user_ids: [],
      principal_type: '主'
    })
    setShowBindForm(true)
    fetchFarms()
    if (filters.farm_id) {
      fetchAvailablePrincipals(filters.farm_id)
    }
  }

  // 绑定负责人
  const handleBind = async () => {
    if (!bindForm.farm_id || bindForm.user_ids.length === 0) {
      showToast('请选择农场和负责人', 'error')
      return
    }

    try {
      setBindSubmitting(true)
      const res = await api.post('/principal/bind', bindForm)
      showToast(res.data.message || '绑定成功')
      setShowBindForm(false)
      setSelectedIds([])
      // 重置表单
      setBindForm({
        farm_id: '',
        user_ids: [],
        principal_type: '主'
      })
      // 重置筛选条件并刷新列表
      setFilters({
        real_name: '',
        phone: '',
        permission_scope: '',
        farm_id: ''
      })
      setPage(1)
      // 延迟一下再获取，确保数据库已更新
      setTimeout(() => {
        fetchPrincipals()
      }, 500)
    } catch (error) {
      console.error('绑定失败:', error)
      showToast(error.response?.data?.message || '绑定失败', 'error')
    } finally {
      setBindSubmitting(false)
    }
  }

  // 打开权限编辑表单
  const handleOpenPermissionForm = (principal) => {
    setEditingBinding(principal)
    setPermissionForm({
      view_modules: principal.permission.view_modules || [],
      operation_permissions: principal.permission.operation_permissions || {}
    })
    setShowPermissionForm(true)
  }

  // 保存权限
  const handleSavePermission = async () => {
    if (!editingBinding) return

    try {
      setPermissionSubmitting(true)
      await api.put(`/principal/permission/${editingBinding.binding_id}`, permissionForm)
      showToast('权限更新成功')
      setShowPermissionForm(false)
      setEditingBinding(null)
      fetchPrincipals()
    } catch (error) {
      console.error('更新权限失败:', error)
      showToast(error.response?.data?.message || '更新权限失败', 'error')
    } finally {
      setPermissionSubmitting(false)
    }
  }

  // 解除绑定
  const handleUnbind = async (bindingIds, isMain = false) => {
    let unbindAllSub = false
    if (isMain) {
      const confirm = window.confirm('是否同步解除所有副负责人？\n点击"确定"解绑所有，点击"取消"仅解绑主负责人')
      unbindAllSub = confirm
    } else {
      const confirm = window.confirm('解除后该用户无法操作本农场数据，是否确认？')
      if (!confirm) return
    }

    try {
      const res = await api.delete('/principal/unbind', {
        data: {
          binding_ids: bindingIds,
          unbind_all_sub: unbindAllSub
        }
      })
      showToast(res.data.message || '解绑成功')
      setSelectedIds([])
      fetchPrincipals()
    } catch (error) {
      console.error('解绑失败:', error)
      showToast(error.response?.data?.message || '解绑失败', 'error')
    }
  }

  // 批量解绑
  const handleBatchUnbind = () => {
    if (selectedIds.length === 0) {
      showToast('请选择要解绑的负责人', 'error')
      return
    }
    handleUnbind(selectedIds)
  }

  // 获取操作日志
  const fetchLogs = async () => {
    try {
      setLoading(true)
      const res = await api.get('/principal/logs', {
        params: {
          page: logPage,
          pageSize,
          ...logFilters
        }
      })
      setLogs(res.data.data || [])
      setLogTotal(res.data.total || 0)
    } catch (error) {
      console.error('获取操作日志失败:', error)
      showToast(error.response?.data?.message || '获取操作日志失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  // 导出日志
  const handleExportLogs = async () => {
    try {
      const res = await api.get('/principal/logs/export', {
        params: logFilters,
        responseType: 'blob'
      })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'principal_logs.csv')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
      showToast('导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      showToast('导出失败', 'error')
    }
  }

  // 权限范围标签
  const getPermissionScopeTag = (scope) => {
    if (scope === 'single') {
      return <span className="scope-tag single">单个农场</span>
    }
    return <span className="scope-tag multiple">多个农场</span>
  }

  // 负责人类型标签
  const getPrincipalTypeTag = (type) => {
    if (type === '主') {
      return <span className="principal-tag main">主</span>
    }
    return <span className="principal-tag sub">副</span>
  }

  // 权限模块标签
  const getPermissionTags = (principal) => {
    const modules = principal.permission.view_modules || []
    if (modules.length === 0) {
      return <span className="permission-empty">暂无权限</span>
    }
    const moduleNames = {
      crop: '作物',
      device: '设备',
      warning: '预警',
      environment: '环境'
    }
    return (
      <div className="permission-tags">
        {modules.map(module => (
          <span key={module} className="permission-tag">
            {moduleNames[module] || module}
          </span>
        ))}
      </div>
    )
  }

  const pageCount = Math.ceil(total / pageSize)
  const logPageCount = Math.ceil(logTotal / pageSize)
  const formatMobileTime = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div className="farm-manager-page">
      <div className="farm-manager-header">
        <h2>负责人管理</h2>
        <div className="farm-manager-tabs">
          <button
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            负责人列表
          </button>
          <button
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            操作日志
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <>
          <div className="farm-manager-actions">
            <button className="primary-btn" onClick={handleOpenBindForm}>
              <span className="btn-icon">＋</span>
              绑定负责人
            </button>
            {selectedIds.length > 0 && (
              <>
                <button className="outline-btn" onClick={handleBatchUnbind}>
                  <span className="btn-icon">解除</span>
                  批量解绑
                </button>
              </>
            )}
          </div>
          {isMobile ? (
            <div className="mobile-toolbar-actions">
              <button
                type="button"
                className="mobile-icon-btn"
                onClick={() => setShowMobileFiltersList((v) => !v)}
                title="筛选"
                aria-label="筛选"
              >
                ⚙
              </button>
            </div>
          ) : null}
          {isMobile && showMobileFiltersList ? <div className="mobile-sheet-backdrop" onClick={() => setShowMobileFiltersList(false)} /> : null}

          <div className={`farm-filter-panel ${isMobile ? (showMobileFiltersList ? 'mobile-filter-sheet' : 'mobile-collapsed') : ''}`}>
            <div className="filter-row">
              <div className="filter-item">
                <label>负责人姓名：</label>
                <input
                  value={filters.real_name}
                  onChange={e => setFilters({ ...filters, real_name: e.target.value })}
                  placeholder="支持模糊搜索"
                />
              </div>
              <div className="filter-item">
                <label>手机号：</label>
                <input
                  value={filters.phone}
                  onChange={e => setFilters({ ...filters, phone: e.target.value })}
                  placeholder="精准搜索"
                />
              </div>
              <div className="filter-item">
                <label>权限范围：</label>
                <select
                  value={filters.permission_scope}
                  onChange={e => setFilters({ ...filters, permission_scope: e.target.value })}
                >
                  <option value="">全部</option>
                  <option value="single">单个农场</option>
                  <option value="multiple">多个农场</option>
                </select>
              </div>
              <div className="filter-item buttons">
                <button className="outline-btn" onClick={() => {
                  setPage(1)
                  fetchPrincipals()
                }}>
                  查询
                </button>
                <button
                  className="outline-btn"
                  onClick={() => {
                    setFilters({
                      real_name: '',
                      phone: '',
                      permission_scope: '',
                      farm_id: ''
                    })
                    setPage(1)
                    // 重置后自动查询
                    setTimeout(() => {
                      fetchPrincipals()
                    }, 100)
                  }}
                >
                  重置
                </button>
                {isMobile ? (
                  <button className="outline-btn" onClick={() => setShowMobileFiltersList(false)}>
                    关闭
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {!loading && principals.length === 0 ? (
            <div className="empty-state">
              <p>暂无绑定的负责人</p>
              <button className="primary-btn" onClick={handleOpenBindForm}>
                绑定负责人
              </button>
            </div>
          ) : (
            <>
              <div className="farm-table-wrapper">
                <table className="farm-table mobile-card-table">
                  <thead>
                    <tr>
                      <th className="th-check">
                        <input
                          type="checkbox"
                          checked={
                            principals.length > 0 &&
                            selectedIds.length === principals.length
                          }
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedIds(principals.map(p => p.binding_id))
                            } else {
                              setSelectedIds([])
                            }
                          }}
                        />
                      </th>
                      <th>姓名</th>
                      <th>手机号</th>
                      <th>角色</th>
                      <th>负责人类型</th>
                      <th>权限范围</th>
                      <th>权限模块</th>
                      <th>绑定时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                          加载中...
                        </td>
                      </tr>
                    ) : principals.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      principals.map(principal => (
                        <tr key={principal.binding_id}>
                          <td className="td-check">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(principal.binding_id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedIds([...selectedIds, principal.binding_id])
                                } else {
                                  setSelectedIds(selectedIds.filter(id => id !== principal.binding_id))
                                }
                              }}
                            />
                          </td>
                          <td data-label="姓名">{principal.real_name}</td>
                          <td data-label="手机号">{principal.phone}</td>
                          <td data-label="角色">{principal.role_name}</td>
                          <td data-label="负责人类型">{getPrincipalTypeTag(principal.principal_type)}</td>
                          <td data-label="权限范围">{getPermissionScopeTag(principal.permission_scope)}</td>
                          <td data-label="权限模块">{getPermissionTags(principal)}</td>
                          <td data-label="绑定时间">{new Date(principal.bind_time).toLocaleString('zh-CN')}</td>
                          <td data-label="操作">
                            <button
                              className="table-btn"
                              onClick={() => handleOpenPermissionForm(principal)}
                            >
                              <span className="btn-icon">✏️</span>
                              编辑权限
                            </button>
                            {(isAdmin || principal.principal_type === '主') && (
                              <button
                                className="table-btn danger-link"
                                onClick={() =>
                                  handleUnbind(
                                    [principal.binding_id],
                                    principal.principal_type === '主'
                                  )
                                }
                              >
                                <span className="btn-icon">解除</span>
                                解绑
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {isMobile && !loading && principals.length > 0 ? (
                  <div className="mobile-record-list">
                    {principals.map((principal) => (
                      <article key={`m-${principal.binding_id}`} className="mobile-record-card">
                        <div className="mobile-record-head">
                          <label className="mobile-select-check">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(principal.binding_id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedIds([...selectedIds, principal.binding_id])
                                } else {
                                  setSelectedIds(selectedIds.filter(id => id !== principal.binding_id))
                                }
                              }}
                            />
                          </label>
                          <div className="mobile-record-title">{principal.real_name}</div>
                          {getPrincipalTypeTag(principal.principal_type)}
                        </div>
                        <div className="mobile-record-grid">
                          <div><span className="k">手机号</span><span className="v">{principal.phone}</span></div>
                          <div><span className="k">角色</span><span className="v">{principal.role_name}</span></div>
                          {expandedPrincipalIds.has(principal.binding_id) ? (
                            <>
                              <div><span className="k">权限范围</span><span className="v">{principal.permission_scope === 'single' ? '单个农场' : '多个农场'}</span></div>
                              <div><span className="k">绑定时间</span><span className="v">{formatMobileTime(principal.bind_time)}</span></div>
                              <div className="is-full"><span className="k">权限模块</span><span className="v">{(principal.permission.view_modules || []).join('、') || '暂无权限'}</span></div>
                            </>
                          ) : null}
                        </div>
                        <div className="mobile-record-actions">
                          <button className="mini-btn" onClick={() => handleOpenPermissionForm(principal)}>编辑权限</button>
                          {(isAdmin || principal.principal_type === '主') ? (
                            <button
                              className="mini-btn danger"
                              onClick={() => handleUnbind([principal.binding_id], principal.principal_type === '主')}
                            >
                              解绑
                            </button>
                          ) : null}
                          <button
                            className="mini-btn"
                            onClick={() => setExpandedPrincipalIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(principal.binding_id)) next.delete(principal.binding_id)
                              else next.add(principal.binding_id)
                              return next
                            })}
                          >
                            {expandedPrincipalIds.has(principal.binding_id) ? '收起' : '更多'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="farm-pagination">
                <div className="page-info">
                  共 {total} 条，页 {page} / {pageCount}
                </div>
                <div className="page-controls">
                  <button
                    className="page-btn"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                  >
                    上一页
                  </button>
                  <span className="page-current">{page}</span>
                  <button
                    className="page-btn"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= pageCount}
                  >
                    下一页
                  </button>
                  <select
                    value={pageSize}
                    onChange={e => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                  >
                    <option value={10}>10条/页</option>
                    <option value={20}>20条/页</option>
                    <option value={50}>50条/页</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'logs' && (
        <>
          <div className="farm-manager-actions">
            <button className="outline-btn" onClick={handleExportLogs}>
              <span className="btn-icon">⬇</span>
              导出Excel
            </button>
          </div>
          {isMobile ? (
            <div className="mobile-toolbar-actions">
              <button
                type="button"
                className="mobile-icon-btn"
                onClick={() => setShowMobileFiltersLogs((v) => !v)}
                title="筛选"
                aria-label="筛选"
              >
                ⚙
              </button>
            </div>
          ) : null}
          {isMobile && showMobileFiltersLogs ? <div className="mobile-sheet-backdrop" onClick={() => setShowMobileFiltersLogs(false)} /> : null}

          <div className={`farm-filter-panel ${isMobile ? (showMobileFiltersLogs ? 'mobile-filter-sheet' : 'mobile-collapsed') : ''}`}>
            <div className="filter-row">
              <div className="filter-item">
                <label>操作类型：</label>
                <select
                  value={logFilters.operation_type}
                  onChange={e =>
                    setLogFilters({ ...logFilters, operation_type: e.target.value })
                  }
                >
                  <option value="">全部</option>
                  <option value="绑定">绑定</option>
                  <option value="解绑">解绑</option>
                  <option value="改权限">改权限</option>
                </select>
              </div>
              <div className="filter-item">
                <label>操作时间：</label>
                <input
                  type="date"
                  value={logFilters.time_from}
                  onChange={e =>
                    setLogFilters({ ...logFilters, time_from: e.target.value })
                  }
                />
                <span className="filter-sep">-</span>
                <input
                  type="date"
                  value={logFilters.time_to}
                  onChange={e =>
                    setLogFilters({ ...logFilters, time_to: e.target.value })
                  }
                />
              </div>
              <div className="filter-item buttons">
                <button className="outline-btn" onClick={fetchLogs}>
                  查询
                </button>
                <button
                  className="outline-btn"
                  onClick={() => {
                    setLogFilters({
                      farm_id: '',
                      operation_type: '',
                      time_from: '',
                      time_to: ''
                    })
                    setLogPage(1)
                  }}
                >
                  重置
                </button>
                {isMobile ? (
                  <button className="outline-btn" onClick={() => setShowMobileFiltersLogs(false)}>
                    关闭
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="farm-table-wrapper">
            <table className="farm-table mobile-card-table">
              <thead>
                <tr>
                  <th>农场名称</th>
                  <th>负责人姓名</th>
                  <th>操作类型</th>
                  <th>操作内容</th>
                  <th>操作时间</th>
                  <th>操作人</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }}>
                      加载中...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }}>
                      暂无日志
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.log_id}>
                      <td data-label="农场名称">{log.farm_name || '-'}</td>
                      <td data-label="负责人姓名">{log.real_name || '-'}</td>
                      <td data-label="操作类型">
                        <span className={`log-type log-type-${log.operation_type}`}>
                          {log.operation_type}
                        </span>
                      </td>
                      <td data-label="操作内容">{log.operation_content || '-'}</td>
                      <td data-label="操作时间">
                        {new Date(log.operation_time).toLocaleString('zh-CN')}
                      </td>
                      <td data-label="操作人">{log.operator_name || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {isMobile && !loading && logs.length > 0 ? (
              <div className="mobile-record-list">
                {logs.map((log) => (
                  <article key={`m-log-${log.log_id}`} className="mobile-record-card">
                    <div className="mobile-record-head">
                      <div className="mobile-record-title">{log.real_name || '-'}</div>
                      <span className={`log-type log-type-${log.operation_type}`}>{log.operation_type}</span>
                    </div>
                    <div className="mobile-record-grid">
                      <div><span className="k">农场</span><span className="v">{log.farm_name || '-'}</span></div>
                      <div><span className="k">操作人</span><span className="v">{log.operator_name || '-'}</span></div>
                      {expandedLogIds.has(log.log_id) ? (
                        <>
                          <div className="is-full"><span className="k">操作内容</span><span className="v">{log.operation_content || '-'}</span></div>
                          <div><span className="k">操作时间</span><span className="v">{formatMobileTime(log.operation_time)}</span></div>
                        </>
                      ) : null}
                    </div>
                    <div className="mobile-record-actions">
                      <button
                        className="mini-btn"
                        onClick={() => setExpandedLogIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(log.log_id)) next.delete(log.log_id)
                          else next.add(log.log_id)
                          return next
                        })}
                      >
                        {expandedLogIds.has(log.log_id) ? '收起' : '更多'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <div className="farm-pagination">
            <div className="page-info">
              共 {logTotal} 条，页 {logPage} / {logPageCount}
            </div>
            <div className="page-controls">
              <button
                className="page-btn"
                onClick={() => setLogPage(logPage - 1)}
                disabled={logPage <= 1}
              >
                上一页
              </button>
              <span className="page-current">{logPage}</span>
              <button
                className="page-btn"
                onClick={() => setLogPage(logPage + 1)}
                disabled={logPage >= logPageCount}
              >
                下一页
              </button>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value))
                  setLogPage(1)
                }}
              >
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
            </div>
          </div>
        </>
      )}

      {/* 绑定表单弹窗 */}
      {showBindForm && (
        <div className="modal-backdrop" onClick={() => setShowBindForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>绑定负责人</h3>
            <div className="modal-body">
              <div className="form-row">
                <label>农场：</label>
                <select
                  value={bindForm.farm_id}
                  onChange={e => {
                    const farmId = e.target.value
                    setBindForm({ ...bindForm, farm_id: farmId, user_ids: [] })
                    if (farmId) {
                      fetchAvailablePrincipals(farmId)
                    } else {
                      setAvailablePrincipals([])
                    }
                  }}
                >
                  <option value="">请选择农场</option>
                  {availableFarms.map(farm => (
                    <option key={farm.farm_id} value={farm.farm_id}>
                      {farm.farm_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>负责人类型：</label>
                <select
                  value={bindForm.principal_type}
                  onChange={e =>
                    setBindForm({ ...bindForm, principal_type: e.target.value })
                  }
                >
                  <option value="主">主负责人</option>
                  <option value="副">副负责人</option>
                </select>
              </div>
              <div className="form-row">
                <label>选择负责人：</label>
                {bindForm.farm_id ? (
                  <div className="checkbox-group">
                    {availablePrincipals.length === 0 ? (
                      <div className="empty-hint">暂无可绑定的负责人</div>
                    ) : (
                      availablePrincipals.map(p => (
                        <label key={p.user_id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={bindForm.user_ids.includes(p.user_id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setBindForm({
                                  ...bindForm,
                                  user_ids: [...bindForm.user_ids, p.user_id]
                                })
                              } else {
                                setBindForm({
                                  ...bindForm,
                                  user_ids: bindForm.user_ids.filter(id => id !== p.user_id)
                                })
                              }
                            }}
                          />
                          <span>
                            {p.real_name} ({p.phone})
                            {p.current_farm_name && (
                              <span className="warning-text">
                                {' '}
                                已绑定：{p.current_farm_name}
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="empty-hint">请先选择农场</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="outline-btn" onClick={() => setShowBindForm(false)}>
                取消
              </button>
              <button
                className="primary-btn"
                onClick={handleBind}
                disabled={bindSubmitting}
              >
                {bindSubmitting ? '绑定中...' : '确认绑定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 权限编辑弹窗 */}
      {showPermissionForm && editingBinding && (
        <div className="modal-backdrop" onClick={() => setShowPermissionForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>编辑权限 - {editingBinding.real_name}</h3>
            <div className="modal-body">
              <div className="form-row">
                <label>可查看的模块：</label>
                <div className="checkbox-group">
                  {[
                    { key: 'crop', label: '作物' },
                    { key: 'device', label: '设备' },
                    { key: 'warning', label: '预警' },
                    { key: 'environment', label: '环境' }
                  ].map(module => (
                    <label key={module.key} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={permissionForm.view_modules.includes(module.key)}
                        onChange={e => {
                          if (e.target.checked) {
                            setPermissionForm({
                              ...permissionForm,
                              view_modules: [
                                ...permissionForm.view_modules,
                                module.key
                              ]
                            })
                          } else {
                            setPermissionForm({
                              ...permissionForm,
                              view_modules: permissionForm.view_modules.filter(
                                m => m !== module.key
                              )
                            })
                          }
                        }}
                      />
                      <span>{module.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <label>操作权限：</label>
                <div className="permission-table">
                  {permissionForm.view_modules.map(module => {
                    const moduleNames = {
                      crop: '作物',
                      device: '设备',
                      warning: '预警',
                      environment: '环境'
                    }
                    return (
                      <div key={module} className="permission-row">
                        <span className="permission-module">
                          {moduleNames[module] || module}：
                        </span>
                        <select
                          value={permissionForm.operation_permissions[module] || 'view'}
                          onChange={e => {
                            setPermissionForm({
                              ...permissionForm,
                              operation_permissions: {
                                ...permissionForm.operation_permissions,
                                [module]: e.target.value
                              }
                            })
                          }}
                        >
                          <option value="view">仅查看</option>
                          <option value="edit">可编辑</option>
                          <option value="delete">可删除</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="outline-btn"
                onClick={() => setShowPermissionForm(false)}
              >
                取消
              </button>
              <button
                className="primary-btn"
                onClick={handleSavePermission}
                disabled={permissionSubmitting}
              >
                {permissionSubmitting ? '保存中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast提示 */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default FarmManager

