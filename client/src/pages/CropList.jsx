import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import './CropList.css'

const defaultFilters = {
  crop_name: '',
  crop_category: '',
  crop_type: '',
  farm_id: '',
  plant_status: '',
  status: '', // 基于环境数据的状态：normal/warning/alarm
  sow_time_from: '',
  sow_time_to: ''
}

const CropList = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [filters, setFilters] = useState(defaultFilters)
  const [sortField, setSortField] = useState('sow_time')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [crops, setCrops] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [hoverOverview, setHoverOverview] = useState(null)
  const [hoverCropId, setHoverCropId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCrop, setEditingCrop] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [farms, setFarms] = useState([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [toast, setToast] = useState(null)
  const [showBatchFarmModal, setShowBatchFarmModal] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const overviewCardRef = useRef(null)

  const isAdmin = user?.role_id === 1
  const isFarmManager = user?.role_id === 2

  // 获取农场列表（用于下拉选择）
  useEffect(() => {
    const fetchFarms = async () => {
      try {
        const res = await api.get('/farm/list', {
          params: { page: 1, pageSize: 1000 }
        })
        setFarms(res.data.data || [])
      } catch (error) {
        console.error('获取农场列表失败:', error)
      }
    }
    fetchFarms()
  }, [])

  // 获取作物列表
  const fetchCrops = useCallback(async (resetPage = false) => {
    try {
      setLoading(true)
      const currentPage = resetPage ? 1 : page
      const res = await api.get('/crop/list', {
        params: {
          page: currentPage,
          pageSize,
          ...filters,
          sortField,
          sortOrder
        }
      })
      setCrops(res.data.data || [])
      setTotal(res.data.total || 0)
      if (resetPage) setPage(1)
      setSelectedIds([])
    } catch (error) {
      console.error('获取作物列表失败:', error)
      showToast(error.response?.data?.message || '获取作物列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters, sortField, sortOrder])

  useEffect(() => {
    fetchCrops(false)
  }, [page, pageSize, sortField, sortOrder])

  // 显示提示
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 获取作物概览（悬浮卡片）
  const fetchCropOverview = useCallback(async (cropId) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/crop/overview/${cropId}`)
        setHoverOverview(res.data)
      } catch (error) {
        console.error('获取作物概览失败:', error)
      }
    }, 300)
  }, [])

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  const handleSearch = () => {
    fetchCrops(true)
  }

  const handleReset = () => {
    setFilters(defaultFilters)
    setSortField('sow_time')
    setSortOrder('desc')
    setPage(1)
    fetchCrops(true)
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
      setSelectedIds(crops.map(c => c.crop_id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  // 状态标签
  const statusTag = (status) => {
    if (status === 'alarm') {
      return <span className="status-badge-circle status-alarm">告警</span>
    }
    if (status === 'warning') {
      return <span className="status-badge-circle status-warning">预警</span>
    }
    return <span className="status-badge-circle status-normal">正常</span>
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

  // 新增/编辑表单
  const [form, setForm] = useState({
    crop_name: '',
    crop_type: '',
    crop_category: '',
    farm_id: '',
    plant_area: '',
    sow_time: '',
    growth_cycle: '',
    suitable_temp_min: '',
    suitable_temp_max: '',
    suitable_humidity_min: '',
    suitable_humidity_max: '',
    suitable_ph_min: '',
    suitable_ph_max: '',
    plant_status: '生长中'
  })

  const handleCreate = () => {
    setEditingCrop(null)
    setForm({
      crop_name: '',
      crop_type: '',
      crop_category: '',
      farm_id: user?.farm_id || '',
      plant_area: '',
      sow_time: new Date().toISOString().split('T')[0],
      growth_cycle: '',
      suitable_temp_min: '',
      suitable_temp_max: '',
      suitable_humidity_min: '',
      suitable_humidity_max: '',
      suitable_ph_min: '',
      suitable_ph_max: '',
      plant_status: '生长中'
    })
    setShowForm(true)
  }

  const handleEdit = (crop) => {
    setEditingCrop(crop)
    setForm({
      crop_name: crop.crop_name || '',
      crop_type: crop.crop_type || '',
      crop_category: crop.crop_category || '',
      farm_id: crop.farm_id || '',
      plant_area: crop.plant_area || '',
      sow_time: crop.sow_time ? crop.sow_time.split('T')[0] : '',
      growth_cycle: crop.growth_cycle || '',
      suitable_temp_min: crop.suitable_temp_min || '',
      suitable_temp_max: crop.suitable_temp_max || '',
      suitable_humidity_min: crop.suitable_humidity_min || '',
      suitable_humidity_max: crop.suitable_humidity_max || '',
      suitable_ph_min: crop.suitable_ph_min || '',
      suitable_ph_max: crop.suitable_ph_max || '',
      plant_status: crop.plant_status || '生长中'
    })
    setShowForm(true)
  }

  const validateForm = () => {
    if (!form.crop_name.trim()) {
      showToast('作物名称不能为空', 'error')
      return false
    }
    if (!form.farm_id) {
      showToast('请选择种植农场', 'error')
      return false
    }
    // 验证区间格式
    const validateRange = (min, max, name) => {
      if (min && max) {
        const minNum = parseFloat(min)
        const maxNum = parseFloat(max)
        if (isNaN(minNum) || isNaN(maxNum)) {
          showToast(`${name}格式不正确`, 'error')
          return false
        }
        if (minNum >= maxNum) {
          showToast(`${name}下限应小于上限`, 'error')
          return false
        }
      }
      return true
    }
    if (!validateRange(form.suitable_temp_min, form.suitable_temp_max, '适宜温度')) return false
    if (!validateRange(form.suitable_humidity_min, form.suitable_humidity_max, '适宜湿度')) return false
    if (!validateRange(form.suitable_ph_min, form.suitable_ph_max, '适宜pH')) return false
    return true
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    const confirmMsg = editingCrop ? '确认修改该作物信息？' : '确认新增该作物？'
    if (!window.confirm(confirmMsg)) return

    try {
      setFormSubmitting(true)
      if (editingCrop) {
        await api.put(`/crop/update/${editingCrop.crop_id}`, form)
        showToast(`作物修改成功，ID：C${editingCrop.crop_id.toString().padStart(3, '0')}`)
      } else {
        const res = await api.post('/crop/create', form)
        showToast(`作物新增成功，ID：C${res.data.crop_id.toString().padStart(3, '0')}`)
      }
      setShowForm(false)
      fetchCrops(false)
    } catch (error) {
      console.error('提交失败:', error)
      showToast(error.response?.data?.message || '操作失败', 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async (crop) => {
    // 权限检查
    if (!isAdmin && user?.farm_id !== crop.farm_id) {
      showToast('无权删除该作物', 'error')
      return
    }

    const confirmMsg = '删除后该作物关联的环境数据/健康度分析将同步置为未关联状态，是否确认？'
    if (!window.confirm(confirmMsg)) return

    try {
      await api.delete(`/crop/delete/${crop.crop_id}`)
      showToast('删除成功')
      fetchCrops(false)
    } catch (error) {
      console.error('删除失败:', error)
      showToast(error.response?.data?.message || '删除失败', 'error')
    }
  }

  // 批量修改农场
  const handleBatchUpdateFarm = async () => {
    if (selectedIds.length === 0) {
      showToast('请先选择要修改的作物', 'error')
      return
    }
    setShowBatchFarmModal(true)
  }

  const confirmBatchUpdateFarm = async (targetFarmId) => {
    if (!targetFarmId) {
      showToast('请选择目标农场', 'error')
      return
    }
    if (!window.confirm(`确认将选中的 ${selectedIds.length} 个作物移动到目标农场？`)) return

    try {
      await api.put('/crop/batch-update-farm', {
        crop_ids: selectedIds,
        farm_id: targetFarmId
      })
      showToast(`成功修改 ${selectedIds.length} 个作物的种植农场`)
      setShowBatchFarmModal(false)
      setSelectedIds([])
      fetchCrops(false)
    } catch (error) {
      console.error('批量修改失败:', error)
      showToast(error.response?.data?.message || '批量修改失败', 'error')
    }
  }

  // 批量导出
  const handleExport = async () => {
    try {
      const params = new URLSearchParams(filters)
      const res = await api.get('/crop/export', {
        params,
        responseType: 'blob'
      })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `crops_${new Date().getTime()}.csv`
      link.click()
      showToast('导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      showToast('导出失败', 'error')
    }
  }

  // 快速筛选当前农场
  const handleQuickFilterFarm = (farmId) => {
    setFilters(prev => ({ ...prev, farm_id: farmId || '' }))
    fetchCrops(true)
  }

  // 获取当前用户可管理的农场
  const availableFarms = useMemo(() => {
    if (isAdmin) return farms
    return farms.filter(f => f.farm_id === user?.farm_id)
  }, [farms, isAdmin, user?.farm_id])

  return (
    <div className="crop-list-page">
      <div className="crop-list-header">
        <h2>作物列表</h2>
        <div className="crop-list-actions">
          <button className="primary-btn" onClick={handleCreate}>
            <span className="btn-icon">＋</span>
            新增作物
          </button>
          {selectedIds.length > 0 && (
            <>
              <button className="primary-outline-btn" onClick={handleBatchUpdateFarm}>
                批量修改农场
              </button>
              <button className="primary-outline-btn" onClick={handleExport}>
                <span className="btn-icon">⬇</span>
                批量导出
              </button>
            </>
          )}
        </div>
      </div>

      {/* 当前农场快捷筛选 */}
      {availableFarms.length > 0 && (
        <div className="quick-farm-filter">
          <span className="quick-filter-label">当前农场：</span>
          <button
            className={`quick-filter-btn ${!filters.farm_id ? 'active' : ''}`}
            onClick={() => handleQuickFilterFarm('')}
          >
            全部
          </button>
          {availableFarms.map(farm => (
            <button
              key={farm.farm_id}
              className={`quick-filter-btn ${filters.farm_id == farm.farm_id ? 'active' : ''}`}
              onClick={() => handleQuickFilterFarm(farm.farm_id)}
            >
              {farm.farm_name}
            </button>
          ))}
        </div>
      )}

      <div className="crop-filter-panel">
        <div className="filter-row">
          <div className="filter-item">
            <label>作物名称：</label>
            <input
              name="crop_name"
              value={filters.crop_name}
              onChange={handleFilterChange}
              placeholder="支持模糊搜索"
            />
          </div>
          <div className="filter-item">
            <label>作物类型：</label>
            <select
              name="crop_category"
              value={filters.crop_category}
              onChange={handleFilterChange}
            >
              <option value="">全部</option>
              <option value="果蔬">果蔬</option>
              <option value="粮食">粮食</option>
              <option value="经济作物">经济作物</option>
            </select>
          </div>
          <div className="filter-item">
            <label>种植状态：</label>
            <select
              name="plant_status"
              value={filters.plant_status}
              onChange={handleFilterChange}
            >
              <option value="">全部</option>
              <option value="生长中">生长中</option>
              <option value="成熟">成熟</option>
              <option value="已收割">已收割</option>
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
              <label>种植农场：</label>
              <select
                name="farm_id"
                value={filters.farm_id}
                onChange={handleFilterChange}
              >
                <option value="">全部</option>
                {availableFarms.map(farm => (
                  <option key={farm.farm_id} value={farm.farm_id}>
                    {farm.farm_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-item">
              <label>种植时间：</label>
              <input
                name="sow_time_from"
                type="date"
                value={filters.sow_time_from}
                onChange={handleFilterChange}
              />
              <span className="filter-sep">-</span>
              <input
                name="sow_time_to"
                type="date"
                value={filters.sow_time_to}
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

      <div className="crop-table-wrapper">
        {selectedIds.length > 0 && (
          <div className="batch-bar">
            <span>已选择 {selectedIds.length} 项</span>
            <button onClick={handleBatchUpdateFarm}>批量修改农场</button>
            <button onClick={handleExport}>批量导出</button>
          </div>
        )}

        {loading ? (
          <div className="skeleton-screen">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : (
          <table className="crop-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === crops.length && crops.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th onClick={() => toggleSort('crop_name')} className="sortable">
                  作物名称
                  {sortField === 'crop_name' && (
                    <span className="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th>作物类型</th>
                <th onClick={() => toggleSort('farm_name')} className="sortable">
                  种植农场
                  {sortField === 'farm_name' && (
                    <span className="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th>种植区域</th>
                <th onClick={() => toggleSort('sow_time')} className="sortable">
                  种植时间
                  {sortField === 'sow_time' && (
                    <span className="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th onClick={() => toggleSort('growth_cycle')} className="sortable">
                  生长周期
                  {sortField === 'growth_cycle' && (
                    <span className="sort-indicator">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="col-center">适宜湿度</th>
                <th className="col-center">适宜pH</th>
                <th className="col-center">状态</th>
                <th className="col-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {crops.length === 0 ? (
                <tr>
                  <td colSpan="11" className="empty-cell">
                    <div className="empty-state-panel">
                      <div className="empty-icon">🌾</div>
                      <div className="empty-text">暂无作物数据</div>
                    </div>
                  </td>
                </tr>
              ) : (
                crops.map(crop => (
                  <tr key={crop.crop_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(crop.crop_id)}
                        onChange={() => handleSelectOne(crop.crop_id)}
                      />
                    </td>
                    <td>
                      <span
                        className="crop-name-cell"
                        onMouseEnter={() => {
                          setHoverCropId(crop.crop_id)
                          fetchCropOverview(crop.crop_id)
                        }}
                        onMouseLeave={() => {
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current)
                          }
                          setTimeout(() => {
                            if (overviewCardRef.current && !overviewCardRef.current.matches(':hover')) {
                              setHoverOverview(null)
                              setHoverCropId(null)
                            }
                          }, 200)
                        }}
                      >
                        {crop.crop_name}
                      </span>
                      {hoverCropId === crop.crop_id && hoverOverview && (
                        <div
                          ref={overviewCardRef}
                          className="crop-overview-card"
                          onMouseEnter={() => setHoverCropId(crop.crop_id)}
                          onMouseLeave={() => {
                            setHoverOverview(null)
                            setHoverCropId(null)
                          }}
                        >
                          <div className="overview-title">作物概览</div>
                          <div className="overview-section">
                            <div className="overview-label">实时环境</div>
                            <div className="overview-data">
                              <span>温度：{hoverOverview.environment?.temperature ?? '--'}℃</span>
                              <span>湿度：{hoverOverview.environment?.humidity ?? '--'}%</span>
                              <span>pH：{hoverOverview.environment?.soil_ph ?? '--'}</span>
                            </div>
                          </div>
                          {hoverOverview.remaining_days !== null && (
                            <div className="overview-section">
                              <div className="overview-label">剩余生长周期</div>
                              <div className="overview-data highlight">
                                还剩 {hoverOverview.remaining_days} 天成熟
                              </div>
                            </div>
                          )}
                          {hoverOverview.health_score !== null && (
                            <div className="overview-section">
                              <div className="overview-label">健康度评分</div>
                              <div className="health-score-ring">
                                <svg viewBox="0 0 42 42" className="ring">
                                  <circle
                                    r="15.915"
                                    cx="21"
                                    cy="21"
                                    fill="transparent"
                                    stroke="#e0e0e0"
                                    strokeWidth="6"
                                  />
                                  <circle
                                    r="15.915"
                                    cx="21"
                                    cy="21"
                                    fill="transparent"
                                    stroke={hoverOverview.health_score >= 70 ? '#4caf50' : hoverOverview.health_score >= 40 ? '#ff9800' : '#f44336'}
                                    strokeWidth="6"
                                    strokeDasharray={`${hoverOverview.health_score} ${100 - hoverOverview.health_score}`}
                                    strokeDashoffset="25"
                                  />
                                </svg>
                                <span className="health-score-text">{hoverOverview.health_score}</span>
                              </div>
                            </div>
                          )}
                          {(crop.status === 'warning' || crop.status === 'alarm') && (
                            <div className="overview-section warning">
                              <div className="overview-label">预警提示</div>
                              <div className="overview-data warning-text">
                                {crop.temperature !== null && crop.suitable_temp_min && crop.suitable_temp_max &&
                                  (crop.temperature < crop.suitable_temp_min || crop.temperature > crop.suitable_temp_max) && (
                                    <div>当前温度 {crop.temperature}℃，超出适宜区间 {crop.suitable_temp_min}-{crop.suitable_temp_max}℃</div>
                                  )}
                                {crop.humidity !== null && crop.suitable_humidity_min && crop.suitable_humidity_max &&
                                  (crop.humidity < crop.suitable_humidity_min || crop.humidity > crop.suitable_humidity_max) && (
                                    <div>当前湿度 {crop.humidity}%，超出适宜区间 {crop.suitable_humidity_min}-{crop.suitable_humidity_max}%</div>
                                  )}
                                {crop.soil_ph !== null && crop.suitable_ph_min && crop.suitable_ph_max &&
                                  (crop.soil_ph < crop.suitable_ph_min || crop.soil_ph > crop.suitable_ph_max) && (
                                    <div>当前pH {crop.soil_ph}，超出适宜区间 {crop.suitable_ph_min}-{crop.suitable_ph_max}</div>
                                  )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{crop.crop_category || '--'}</td>
                    <td>{crop.farm_name}</td>
                    <td>{crop.plant_area || '--'}</td>
                    <td>{crop.sow_time ? crop.sow_time.split('T')[0] : '--'}</td>
                    <td>{crop.growth_cycle ? `${crop.growth_cycle}天` : '--'}</td>
                    <td className="col-center">
                      {crop.suitable_humidity_min && crop.suitable_humidity_max
                        ? `${crop.suitable_humidity_min}-${crop.suitable_humidity_max}%`
                        : '--'}
                    </td>
                    <td className="col-center">
                      {crop.suitable_ph_min && crop.suitable_ph_max
                        ? `${crop.suitable_ph_min}-${crop.suitable_ph_max}`
                        : '--'}
                    </td>
                    <td className="col-center">
                      <span
                        className="status-clickable"
                        onClick={() => {
                          if (filters.status === crop.status) {
                            setFilters(prev => ({ ...prev, status: '' }))
                          } else {
                            setFilters(prev => ({ ...prev, status: crop.status }))
                          }
                          fetchCrops(true)
                        }}
                      >
                        {statusTag(crop.status)}
                      </span>
                    </td>
                    <td className="col-center">
                      <button
                        className="action-btn edit-btn"
                        onClick={() => handleEdit(crop)}
                        title="编辑"
                      >
                        <span className="btn-icon">✎</span>
                        编辑
                      </button>
                      {(isAdmin || user?.farm_id === crop.farm_id) && (
                        <button
                          className="action-btn delete-btn"
                          onClick={() => handleDelete(crop)}
                          title="删除"
                        >
                          <span className="btn-icon">🗑</span>
                          删除
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div className="crop-pagination">
            <div className="pagination-info">
              共 {total} 条，第 {page} / {pageCount} 页
            </div>
            <div className="pagination-controls">
              <button
                className="page-btn"
                disabled={page === 1}
                onClick={() => changePage(-1)}
              >
                上一页
              </button>
              {[...Array(pageCount)].map((_, i) => {
                const pageNum = i + 1
                if (
                  pageNum === 1 ||
                  pageNum === pageCount ||
                  (pageNum >= page - 2 && pageNum <= page + 2)
                ) {
                  return (
                    <button
                      key={pageNum}
                      className={`page-btn ${page === pageNum ? 'active' : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  )
                } else if (pageNum === page - 3 || pageNum === page + 3) {
                  return <span key={pageNum} className="page-ellipsis">...</span>
                }
                return null
              })}
              <button
                className="page-btn"
                disabled={page === pageCount}
                onClick={() => changePage(1)}
              >
                下一页
              </button>
            </div>
            <div className="pagination-size">
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                <option value={10}>10条/页</option>
                <option value={20}>20条/页</option>
                <option value={50}>50条/页</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 新增/编辑表单弹窗 */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCrop ? '编辑作物' : '新增作物'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>作物名称*</label>
                <input
                  value={form.crop_name}
                  onChange={e => setForm({ ...form, crop_name: e.target.value })}
                  placeholder="请输入作物名称"
                />

                <label>作物类型</label>
                <select
                  value={form.crop_category}
                  onChange={e => setForm({ ...form, crop_category: e.target.value })}
                >
                  <option value="">请选择</option>
                  <option value="果蔬">果蔬</option>
                  <option value="粮食">粮食</option>
                  <option value="经济作物">经济作物</option>
                </select>

                <label>种植农场*</label>
                <select
                  value={form.farm_id}
                  onChange={e => setForm({ ...form, farm_id: e.target.value })}
                >
                  <option value="">请选择</option>
                  {availableFarms.map(farm => (
                    <option key={farm.farm_id} value={farm.farm_id}>
                      {farm.farm_name}
                    </option>
                  ))}
                </select>

                <label>种植区域</label>
                <input
                  value={form.plant_area}
                  onChange={e => setForm({ ...form, plant_area: e.target.value })}
                  placeholder="如：西北区/番茄种植区"
                />

                <label>种植时间</label>
                <input
                  type="date"
                  value={form.sow_time}
                  onChange={e => setForm({ ...form, sow_time: e.target.value })}
                />

                <label>生长周期（天）</label>
                <input
                  type="number"
                  value={form.growth_cycle}
                  onChange={e => setForm({ ...form, growth_cycle: e.target.value })}
                  placeholder="如：90"
                />

                <label>适宜温度（℃）</label>
                <div className="range-input-row">
                  <input
                    type="number"
                    step="0.1"
                    value={form.suitable_temp_min}
                    onChange={e => setForm({ ...form, suitable_temp_min: e.target.value })}
                    placeholder="下限"
                  />
                  <span className="range-separator">-</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.suitable_temp_max}
                    onChange={e => setForm({ ...form, suitable_temp_max: e.target.value })}
                    placeholder="上限"
                  />
                </div>

                <label>适宜湿度（%）</label>
                <div className="range-input-row">
                  <input
                    type="number"
                    step="0.1"
                    value={form.suitable_humidity_min}
                    onChange={e => setForm({ ...form, suitable_humidity_min: e.target.value })}
                    placeholder="下限"
                  />
                  <span className="range-separator">-</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.suitable_humidity_max}
                    onChange={e => setForm({ ...form, suitable_humidity_max: e.target.value })}
                    placeholder="上限"
                  />
                </div>

                <label>适宜pH</label>
                <div className="range-input-row">
                  <input
                    type="number"
                    step="0.1"
                    value={form.suitable_ph_min}
                    onChange={e => setForm({ ...form, suitable_ph_min: e.target.value })}
                    placeholder="下限"
                  />
                  <span className="range-separator">-</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.suitable_ph_max}
                    onChange={e => setForm({ ...form, suitable_ph_max: e.target.value })}
                    placeholder="上限"
                  />
                </div>

                <label>种植状态</label>
                <select
                  value={form.plant_status}
                  onChange={e => setForm({ ...form, plant_status: e.target.value })}
                >
                  <option value="生长中">生长中</option>
                  <option value="成熟">成熟</option>
                  <option value="已收割">已收割</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="outline-btn" onClick={() => setShowForm(false)}>
                取消
              </button>
              <button
                className="primary-btn"
                onClick={handleSubmit}
                disabled={formSubmitting}
              >
                {formSubmitting ? '提交中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量修改农场弹窗 */}
      {showBatchFarmModal && (
        <div className="modal-overlay" onClick={() => setShowBatchFarmModal(false)}>
          <div className="modal-content small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>批量修改种植农场</h3>
              <button className="modal-close" onClick={() => setShowBatchFarmModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-item">
                <label>目标农场：</label>
                <select
                  id="batch-farm-select"
                  defaultValue=""
                >
                  <option value="">请选择</option>
                  {farms.map(farm => (
                    <option key={farm.farm_id} value={farm.farm_id}>
                      {farm.farm_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="outline-btn" onClick={() => setShowBatchFarmModal(false)}>
                取消
              </button>
              <button
                className="primary-btn"
                onClick={() => {
                  const select = document.getElementById('batch-farm-select')
                  confirmBatchUpdateFarm(select.value)
                }}
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast提示 */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  )
}

export default CropList

