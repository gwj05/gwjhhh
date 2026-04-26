import React, { useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import './FarmList.css'

const defaultFilters = {
  farm_name: '',
  principal_name: '',
  status: '',
  created_from: '',
  created_to: ''
}

const FarmList = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState(defaultFilters)
  const [sortField, setSortField] = useState('farm_name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [farms, setFarms] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [hoverOverview, setHoverOverview] = useState(null)
  const [hoverFarmId, setHoverFarmId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingFarm, setEditingFarm] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [principals, setPrincipals] = useState([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [form, setForm] = useState({
    farm_name: '',
    address: '',
    phone: '',
    principal_id: '',
    longitude: '',
    latitude: ''
  })

  const isAdmin = user?.role_id === 1

  const fetchFarms = async (resetPage = false) => {
    try {
      setLoading(true)
      const currentPage = resetPage ? 1 : page
      const res = await api.get('/farm/list', {
        params: {
          page: currentPage,
          pageSize,
          ...filters,
          sortField,
          sortOrder
        }
      })
      setFarms(res.data.data || [])
      setTotal(res.data.total || 0)
      if (resetPage) setPage(1)
      setSelectedIds([])
    } catch (error) {
      console.error('获取农场列表失败:', error)
      alert(error.response?.data?.message || '获取农场列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFarms(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortField, sortOrder])

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

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  const handleSearch = () => {
    fetchFarms(true)
  }

  const handleReset = () => {
    setFilters(defaultFilters)
    setSortField('farm_name')
    setSortOrder('asc')
    setPage(1)
    fetchFarms(true)
  }

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(farms.map(f => f.farm_id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const statusTag = (status) => {
    if (status === 'alarm') return <span className="status-tag status-alarm">告警</span>
    if (status === 'warning') return <span className="status-tag status-warning">预警</span>
    return <span className="status-tag status-normal">正常</span>
  }

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize]
  )

  const changePage = (delta) => {
    setPage(prev => {
      let next = prev + delta
      if (next < 1) next = 1
      if (next > pageCount) next = pageCount
      return next
    })
  }

  const handleDelete = async (farmId) => {
    if (!isAdmin) {
      alert('仅超级管理员可删除农场')
      return
    }
    const confirm1 = window.confirm('是否确认删除？')
    if (!confirm1) return
    try {
      await api.delete(`/farm/delete/${farmId}`)
      alert('删除成功')
      fetchFarms(false)
    } catch (error) {
      console.error('删除农场失败:', error)
      alert(error.response?.data?.message || '删除失败')
    }
  }

  const handleMouseEnterFarm = async (farmId) => {
    setHoverFarmId(farmId)
    try {
      const res = await api.get(`/farm/overview/${farmId}`)
      setHoverOverview(res.data)
    } catch (error) {
      console.error('获取农场概览失败:', error)
    }
  }

  const handleMouseLeaveFarm = () => {
    setHoverFarmId(null)
    setHoverOverview(null)
  }

  const loadPrincipals = async () => {
    try {
      const res = await api.get('/farm/principals')
      setPrincipals(res.data || [])
    } catch (error) {
      console.error('获取负责人列表失败:', error)
    }
  }

  // 打开新增/编辑表单
  const handleCreate = () => {
    setEditingFarm(null)
    setForm({
      farm_name: '',
      address: '',
      phone: '',
      principal_id: '',
      longitude: '',
      latitude: ''
    })
    setShowForm(true)
    loadPrincipals()
  }

  const handleEdit = (farm) => {
    setEditingFarm(farm)
    setForm({
      farm_name: farm.farm_name || '',
      address: farm.address || '',
      phone: farm.phone || '',
      principal_id: farm.principal_id || '',
      longitude: farm.longitude || '',
      latitude: farm.latitude || ''
    })
    setShowForm(true)
    loadPrincipals()
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/farm/export', { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'farms.csv')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('导出失败:', error)
      alert(error.response?.data?.message || '导出失败')
    }
  }

  return (
    <div className="farm-list-page">
      <div className="farm-list-header">
        <h2>农场列表</h2>
        <div className="farm-list-actions">
          <button className="primary-btn" onClick={handleCreate}>
            <span className="btn-icon">＋</span>
            新增农场
          </button>
          <button className="primary-outline-btn" onClick={handleExport}>
            <span className="btn-icon">⬇</span>
            批量导出
          </button>
        </div>
      </div>

      <div className="farm-filter-panel">
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
          <div className="filter-item">
            <label>农场名称：</label>
            <input
              name="farm_name"
              value={filters.farm_name}
              onChange={handleFilterChange}
              placeholder="支持模糊搜索"
            />
          </div>
          <div className="filter-item">
            <label>负责人姓名：</label>
            <input
              name="principal_name"
              value={filters.principal_name}
              onChange={handleFilterChange}
              placeholder="支持模糊搜索"
            />
          </div>
          <div className="filter-item">
            <label>农场状态：</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">全部</option>
              <option value="normal">正常</option>
              <option value="warning">预警</option>
              <option value="alarm">告警</option>
            </select>
          </div>
          <div className="filter-item advanced-toggle">
            <span
              className="advanced-link"
              onClick={() => setShowAdvanced(prev => !prev)}
            >
              {showAdvanced ? '收起高级筛选 ▲' : '高级筛选 ▼'}
            </span>
          </div>
        </div>
        {showAdvanced && (
          <div className="filter-row advanced-row">
            <div className="filter-item">
              <label>创建时间：</label>
              <input
                name="created_from"
                type="date"
                value={filters.created_from}
                onChange={handleFilterChange}
              />
              <span className="filter-sep">-</span>
              <input
                name="created_to"
                type="date"
                value={filters.created_to}
                onChange={handleFilterChange}
              />
            </div>
          </div>
        )}
        <div className="filter-row filter-actions-row">
          <div className="filter-item buttons">
            <button className="outline-btn" onClick={handleSearch}>
              查询
            </button>
            <button className="outline-btn" onClick={handleReset}>
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="farm-table-wrapper">
        {selectedIds.length > 0 && (
          <div className="batch-bar">
            <span>已选择 {selectedIds.length} 项</span>
            <button onClick={handleExport}>批量导出</button>
            <button onClick={() => alert('批量绑定负责人功能可在此实现')}>
              批量绑定负责人
            </button>
          </div>
        )}
        <table className="farm-table mobile-card-table">
          <thead>
            <tr>
              <th className="th-check">
                <input
                  type="checkbox"
                  checked={
                    farms.length > 0 &&
                    selectedIds.length === farms.length
                  }
                  onChange={handleSelectAll}
                />
              </th>
              <th onClick={() => toggleSort('farm_name')}>
                农场名称
                {sortField === 'farm_name' && (
                  <span className="sort-indicator">
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th>负责人</th>
              <th className="col-center">联系电话</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center' }}>
                  加载中...
                </td>
              </tr>
            ) : farms.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center' }}>
                  暂无数据
                </td>
              </tr>
            ) : (
              farms.map(farm => (
                <tr key={farm.farm_id}>
                  <td className="td-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(farm.farm_id)}
                      onChange={() => handleSelectOne(farm.farm_id)}
                    />
                  </td>
                  <td
                    data-label="农场名称"
                    className="farm-name-cell"
                    onMouseEnter={() => handleMouseEnterFarm(farm.farm_id)}
                    onMouseLeave={handleMouseLeaveFarm}
                    onClick={() => navigate(`/farm/detail/${farm.farm_id}`)}
                    title="点击查看详情"
                  >
                    {farm.farm_name}
                    {hoverFarmId === farm.farm_id && hoverOverview && (
                      <div className="farm-overview-popover">
                        <div className="overview-section">
                          <div className="overview-title">实时环境</div>
                          {hoverOverview.environment ? (
                            <div className="overview-env">
                              <span>温度：{hoverOverview.environment.temperature}℃</span>
                              <span>湿度：{hoverOverview.environment.humidity}%</span>
                              <span>pH：{hoverOverview.environment.soil_ph}</span>
                            </div>
                          ) : (
                            <div className="overview-empty">暂无环境数据</div>
                          )}
                        </div>
                        <div className="overview-section">
                          <div className="overview-title">设备在线率</div>
                          <div className="overview-device">
                            <span>
                              在线 {hoverOverview.devices.device_online || 0} /
                              总计 {hoverOverview.devices.device_total || 0}
                            </span>
                          </div>
                        </div>
                        <div className="overview-section">
                          <div className="overview-title">未处理预警</div>
                          <div className="overview-warning">
                            {hoverOverview.warnings.unhandled_warnings || 0} 条
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td data-label="负责人">{farm.principal_name || '-'}</td>
                  <td className="col-center" data-label="联系电话">{farm.phone || '-'}</td>
                  <td data-label="状态">{statusTag(farm.status)}</td>
                  <td data-label="操作">
                    <button className="table-btn" onClick={() => handleEdit(farm)}>
                      <span className="btn-icon">✏️</span>
                      编辑
                    </button>
                    {isAdmin && (
                      <button
                        className="table-btn danger-link"
                        onClick={() => handleDelete(farm.farm_id)}
                      >
                        <span className="btn-icon">🗑️</span>
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {isMobile && loading ? <div className="warning-empty">加载中...</div> : null}
        {isMobile && !loading && farms.length === 0 ? <div className="warning-empty">暂无数据</div> : null}
        {isMobile && !loading && farms.length > 0 ? (
          <div className="mobile-record-list">
            {farms.map((farm) => (
              <article key={`m-${farm.farm_id}`} className="mobile-record-card">
                <div className="mobile-record-head">
                  <label className="mobile-select-check">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(farm.farm_id)}
                      onChange={() => handleSelectOne(farm.farm_id)}
                    />
                  </label>
                  <div
                    className="mobile-record-title"
                    onClick={() => navigate(`/farm/detail/${farm.farm_id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {farm.farm_name}
                  </div>
                  {statusTag(farm.status)}
                </div>
                <div className="mobile-record-grid">
                  <div><span className="k">负责人</span><span className="v">{farm.principal_name || '-'}</span></div>
                  <div><span className="k">联系电话</span><span className="v">{farm.phone || '-'}</span></div>
                </div>
                <div className="mobile-record-actions">
                  <button className="mini-btn" onClick={() => navigate(`/farm/detail/${farm.farm_id}`)}>详情</button>
                  <button className="mini-btn" onClick={() => handleEdit(farm)}>编辑</button>
                  {isAdmin ? <button className="mini-btn danger" onClick={() => handleDelete(farm.farm_id)}>删除</button> : null}
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
          <button className="page-btn" onClick={() => changePage(-1)} disabled={page <= 1}>
            上一页
          </button>
          <span className="page-current">{page}</span>
          <button className="page-btn" onClick={() => changePage(1)} disabled={page >= pageCount}>
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

      {showForm && (
        <div className="farm-form-modal-backdrop">
          <div className="farm-form-modal">
            <h3>{editingFarm ? '编辑农场' : '新增农场'}</h3>
            <div className="farm-form-body">
              <div className="farm-form-row">
                <label>农场名称<span className="required">*</span></label>
                <input
                  value={form.farm_name}
                  onChange={e => setForm({ ...form, farm_name: e.target.value })}
                  placeholder="请输入农场名称"
                />
              </div>
              <div className="farm-form-row">
                <label>地址</label>
                <input
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="请输入农场地址"
                />
              </div>
              <div className="farm-form-row">
                <label>联系电话</label>
                <input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="请输入联系电话"
                />
              </div>
              <div className="farm-form-row">
                <label>经纬度</label>
                <div className="coord-inputs">
                  <input
                    value={form.longitude}
                    onChange={e => setForm({ ...form, longitude: e.target.value })}
                    placeholder="经度，如 116.397000"
                  />
                  <input
                    value={form.latitude}
                    onChange={e => setForm({ ...form, latitude: e.target.value })}
                    placeholder="纬度，如 39.908000"
                  />
                </div>
                <div className="coord-tip">可后续接入地图选点，这里先支持手动输入</div>
              </div>
              <div className="farm-form-row">
                <label>负责人<span className="required">*</span></label>
                <select
                  value={form.principal_id}
                  onChange={e => setForm({ ...form, principal_id: e.target.value })}
                >
                  <option value="">请选择农场管理员</option>
                  {principals.map(p => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.real_name}（{p.phone}）
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="farm-form-footer">
              <button
                onClick={() => {
                  if (formSubmitting) return
                  setShowForm(false)
                }}
              >
                取消
              </button>
              <button
                className="primary-btn"
                disabled={formSubmitting}
                onClick={async () => {
                  if (!form.farm_name) {
                    alert('农场名称不能为空')
                    return
                  }
                  // 简单经纬度格式校验
                  const lon = form.longitude ? Number(form.longitude) : null
                  const lat = form.latitude ? Number(form.latitude) : null
                  if (form.longitude && (isNaN(lon) || lon < -180 || lon > 180)) {
                    alert('经度格式不正确，必须是 -180~180 的数字')
                    return
                  }
                  if (form.latitude && (isNaN(lat) || lat < -90 || lat > 90)) {
                    alert('纬度格式不正确，必须是 -90~90 的数字')
                    return
                  }

                  try {
                    setFormSubmitting(true)
                    if (editingFarm) {
                      if (!window.confirm('确认保存对该农场的修改？')) {
                        setFormSubmitting(false)
                        return
                      }
                      await api.put(`/farm/update/${editingFarm.farm_id}`, {
                        ...form,
                        principal_id: Number(form.principal_id),
                        longitude: lon,
                        latitude: lat
                      })
                      alert('修改成功')
                    } else {
                      if (!window.confirm('确认创建该农场？')) {
                        setFormSubmitting(false)
                        return
                      }
                      await api.post('/farm/create', {
                        ...form,
                        principal_id: Number(form.principal_id),
                        longitude: lon,
                        latitude: lat
                      })
                      alert('创建成功')
                    }
                    setShowForm(false)
                    fetchFarms(true)
                  } catch (error) {
                    console.error('保存农场失败:', error)
                    alert(error.response?.data?.message || '保存失败')
                  } finally {
                    setFormSubmitting(false)
                  }
                }}
              >
                {formSubmitting ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FarmList


