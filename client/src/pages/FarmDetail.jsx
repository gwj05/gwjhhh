import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './FarmDetail.css'

const tabs = [
  { key: 'base', label: '基础信息' },
  { key: 'crop', label: '关联作物' },
  { key: 'device', label: '关联设备' },
  { key: 'charts', label: '环境趋势' },
  { key: 'health', label: '作物健康度' },
  { key: 'advice', label: '智能建议' }
]

const FarmDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('base')
  const [detail, setDetail] = useState(null)
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [envHistory24h, setEnvHistory24h] = useState([])
  const [envHistory7d, setEnvHistory7d] = useState([])
  const [crops, setCrops] = useState([])
  const [devices, setDevices] = useState([])
  const [formLoading, setFormLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // 农场切换相关状态
  const [availableFarms, setAvailableFarms] = useState([])
  const [showFarmPanel, setShowFarmPanel] = useState(false)
  const [farmSearchKeyword, setFarmSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('') // 状态筛选：'' / 'normal' / 'warning' / 'alarm'
  const [selectedFarms, setSelectedFarms] = useState([])
  const [hoveredFarmId, setHoveredFarmId] = useState(null)
  const [showMoreMenu, setShowMoreMenu] = useState(null)
  const [switchNotification, setSwitchNotification] = useState(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [showBackMenu, setShowBackMenu] = useState(false)
  const farmPanelRef = useRef(null)
  const moreMenuRef = useRef(null)
  const backMenuRef = useRef(null)
  
  // 最近访问记录（localStorage）
  const getRecentFarms = useCallback(() => {
    try {
      const recent = localStorage.getItem('farm_recent_visits')
      return recent ? JSON.parse(recent) : []
    } catch {
      return []
    }
  }, [])

  const addRecentFarm = useCallback((farmId, farmName) => {
    try {
      const recent = getRecentFarms()
      const newRecent = [
        { farm_id: farmId, farm_name: farmName, visit_time: Date.now() },
        ...recent.filter(f => f.farm_id !== farmId)
      ].slice(0, 3) // 只保留最近3个
      localStorage.setItem('farm_recent_visits', JSON.stringify(newRecent))
    } catch (error) {
      console.error('保存最近访问记录失败:', error)
    }
  }, [getRecentFarms])

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [d, o] = await Promise.all([
        api.get(`/farm/detail/${id}`),
        api.get(`/farm/overview/${id}`)
      ])
      setDetail(d.data)
      setOverview(o.data)
    } catch (error) {
      console.error('加载详情失败:', error)
      const msg = error.response?.data?.message || '加载详情失败'
      setError(msg)
      alert(msg)
      if (error.response?.status === 403) {
        navigate('/farm/list')
      }
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  const fetchEnvHistory = useCallback(async () => {
    try {
      const [h24, h7] = await Promise.all([
        api.get('/homepage/weather-history', { params: { farm_id: id, range: '24h' } }),
        api.get('/homepage/weather-history', { params: { farm_id: id, range: '7d' } }),
      ])
      setEnvHistory24h(h24.data || [])
      setEnvHistory7d(h7.data || [])
    } catch (error) {
      console.error('加载环境趋势失败:', error)
    }
  }, [id])

  const fetchCrops = useCallback(async () => {
    try {
      const res = await api.get(`/farm/${id}/crops`)
      setCrops(res.data || [])
    } catch (error) {
      console.error('加载作物失败:', error)
    }
  }, [id])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await api.get(`/farm/${id}/devices`)
      setDevices(res.data || [])
    } catch (error) {
      console.error('加载设备失败:', error)
    }
  }, [id])

  // 获取可管理的农场列表
  const fetchAvailableFarms = useCallback(async () => {
    try {
      const res = await api.get('/farm/list', {
        params: { page: 1, pageSize: 100 }
      })
      setAvailableFarms(res.data.data || [])
    } catch (error) {
      console.error('获取农场列表失败:', error)
    }
  }, [])

  // 切换农场（带动画和提示）
  const handleFarmSwitch = useCallback((farmId, farmName) => {
    if (farmId === parseInt(id)) {
      setShowFarmPanel(false)
      return
    }
    
    const targetFarm = availableFarms.find(f => f.farm_id === farmId)
    if (!targetFarm) return

    setIsSwitching(true)
    setShowFarmPanel(false)
    setFarmSearchKeyword('')
    setShowMoreMenu(null)
    
    // 记录最近访问
    addRecentFarm(farmId, farmName || targetFarm.farm_name)
    
    // 显示切换提示
    setSwitchNotification({
      farmName: farmName || targetFarm.farm_name,
      status: targetFarm.status || 'normal'
    })
    
    // 淡出动画
    setTimeout(() => {
      // 清空当前数据
      setDetail(null)
      setOverview(null)
      setCrops([])
      setDevices([])
      setEnvHistory24h([])
      setEnvHistory7d([])
      navigate(`/farm/detail/${farmId}`, { replace: true })
    }, 200)
  }, [id, navigate, availableFarms, addRecentFarm])

  // 双击切换
  const handleDoubleClick = useCallback((farmId, farmName) => {
    handleFarmSwitch(farmId, farmName)
  }, [handleFarmSwitch])

  // 获取当前农场状态标签（圆形徽章样式）
  const getFarmStatusTag = (farm, variant = 'default') => {
    if (!farm.status) return null
    const statusText = farm.status === 'alarm' ? '告警' : farm.status === 'warning' ? '预警' : '正常'
    return (
      <span className={`farm-status-badge-circle status-${farm.status} ${variant}`}>
        {statusText}
      </span>
    )
  }

  // 获取状态徽章（圆形徽章样式）
  const getStatusBadge = (farm, variant = 'badge') => {
    if (!farm.status) return null
    const statusText = farm.status === 'alarm' ? '告警' : farm.status === 'warning' ? '预警' : '正常'
    if (variant === 'badge') {
      return <span className={`farm-status-badge status-${farm.status}`}></span>
    }
    // 圆形徽章样式（带文字）
    return (
      <span className={`farm-status-badge-circle status-${farm.status}`}>
        {statusText}
      </span>
    )
  }

  // 获取最近访问的农场
  const recentFarms = useMemo(() => {
    const recent = getRecentFarms()
    return recent.map(r => {
      const farm = availableFarms.find(f => f.farm_id === r.farm_id)
      return farm ? { ...farm, isRecent: true } : null
    }).filter(Boolean)
  }, [availableFarms, getRecentFarms])

  // 高亮搜索关键词
  const highlightKeyword = useCallback((text, keyword) => {
    if (!keyword) return text
    const regex = new RegExp(`(${keyword})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
    )
  }, [])

  // 过滤和排序农场列表（搜索 + 状态筛选 + 智能排序）
  const filteredFarms = useMemo(() => {
    let farms = [...availableFarms]
    
    // 状态筛选
    if (statusFilter) {
      farms = farms.filter(farm => farm.status === statusFilter)
    }
    
    // 搜索过滤
    if (farmSearchKeyword) {
      const keyword = farmSearchKeyword.toLowerCase()
      farms = farms.filter(farm => 
        farm.farm_name.toLowerCase().includes(keyword) ||
        (farm.address && farm.address.toLowerCase().includes(keyword))
      )
    }
    
    // 智能排序：告警优先 + 最近访问优先
    if (!farmSearchKeyword && !statusFilter) {
      farms.sort((a, b) => {
        // 告警优先
        const statusOrder = { alarm: 0, warning: 1, normal: 2 }
        const statusDiff = (statusOrder[a.status] || 2) - (statusOrder[b.status] || 2)
        if (statusDiff !== 0) return statusDiff
        
        // 最近访问优先
        const aIsRecent = recentFarms.some(r => r.farm_id === a.farm_id)
        const bIsRecent = recentFarms.some(r => r.farm_id === b.farm_id)
        if (aIsRecent && !bIsRecent) return -1
        if (!aIsRecent && bIsRecent) return 1
        
        return 0
      })
    }
    
    return farms
  }, [availableFarms, farmSearchKeyword, statusFilter, recentFarms])

  // 按权限分组农场
  const groupedFarms = useMemo(() => {
    const isAdmin = user?.role_id === 1
    const recentIds = recentFarms.map(f => f.farm_id)
    
    if (isAdmin) {
      return {
        recent: recentFarms,
        all: filteredFarms.filter(f => !recentIds.includes(f.farm_id))
      }
    } else {
      return {
        recent: recentFarms,
        managed: filteredFarms.filter(f => !recentIds.includes(f.farm_id))
      }
    }
  }, [filteredFarms, recentFarms, user])

  // 批量导出
  const handleBatchExport = useCallback(async () => {
    if (selectedFarms.length === 0) {
      alert('请先选择要导出的农场')
      return
    }
    try {
      const res = await api.get('/farm/export', {
        params: { farm_ids: selectedFarms.join(',') },
        responseType: 'blob'
      })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `farms_${Date.now()}.csv`)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
      window.URL.revokeObjectURL(url)
      alert('导出成功')
      setSelectedFarms([])
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败')
    }
  }, [selectedFarms])

  // 点击外部关闭面板和菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (farmPanelRef.current && !farmPanelRef.current.contains(event.target)) {
        setShowFarmPanel(false)
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(null)
      }
      if (backMenuRef.current && !backMenuRef.current.contains(event.target)) {
        setShowBackMenu(false)
      }
    }
    if (showFarmPanel || showMoreMenu || showBackMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFarmPanel, showMoreMenu, showBackMenu])

  // 切换提示自动消失
  useEffect(() => {
    if (switchNotification) {
      const timer = setTimeout(() => {
        setSwitchNotification(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [switchNotification])

  // 切换完成后重置状态
  useEffect(() => {
    if (detail && isSwitching) {
      setIsSwitching(false)
    }
  }, [detail, isSwitching])

  useEffect(() => {
    fetchDetail()
    fetchEnvHistory()
    fetchCrops()
    fetchDevices()
    fetchAvailableFarms()
  }, [fetchDetail, fetchEnvHistory, fetchCrops, fetchDevices, fetchAvailableFarms])

  // 单独处理最近访问记录（只在id变化时记录）
  useEffect(() => {
    if (detail && detail.farm_id && detail.farm_name) {
      addRecentFarm(detail.farm_id, detail.farm_name)
    }
  }, [id]) // 只在id变化时触发，避免detail变化导致重复记录

  const handleBaseUpdate = async (data) => {
    if (!window.confirm('确认修改基础信息？')) return
    try {
      setFormLoading(true)
      await api.put(`/farm/update/${id}`, data)
      alert('操作成功')
      fetchDetail()
    } catch (error) {
      console.error('修改失败:', error)
      alert(error.response?.data?.message || '修改失败')
    } finally {
      setFormLoading(false)
    }
  }

  // 简单健康度计算
  const latestEnv = overview?.environment
  const healthScore = useMemo(() => {
    if (!latestEnv) return null
    const tempScore = scoreRange(latestEnv.temperature, 15, 30, 10) // 温度
    const humScore = scoreRange(latestEnv.humidity, 40, 80, 20)    // 湿度
    const phScore  = scoreRange(latestEnv.soil_ph, 6.0, 7.5, 1.0)  // pH
    return Math.round((tempScore + humScore + phScore) / 3)
  }, [latestEnv])

  const healthFactors = useMemo(() => {
    if (!latestEnv) return []
    const factors = []
    if (!inRange(latestEnv.temperature, 15, 30)) factors.push('温度偏离适宜区间')
    if (!inRange(latestEnv.humidity, 40, 80)) factors.push('湿度偏离适宜区间')
    if (!inRange(latestEnv.soil_ph, 6.0, 7.5)) factors.push('土壤 pH 偏离适宜区间')
    return factors.length ? factors : ['环境指标正常']
  }, [latestEnv])

  // 智能建议（简化版）
  const advice = useMemo(() => {
    if (!latestEnv) return []
    const list = []
    if (latestEnv.humidity !== null && latestEnv.humidity < 65) {
      list.push('当前土壤湿度偏低，建议适量灌溉以提升至 65%-75%。')
    } else if (latestEnv.humidity !== null && latestEnv.humidity > 80) {
      list.push('当前土壤湿度偏高，请注意排水或减少灌溉频次。')
    }
    if (latestEnv.temperature !== null && latestEnv.temperature > 32) {
      list.push('温度偏高，建议开启遮阳/通风降温。')
    } else if (latestEnv.temperature !== null && latestEnv.temperature < 12) {
      list.push('温度偏低，建议开启保温或补光。')
    }
    if (latestEnv.soil_ph !== null && (latestEnv.soil_ph < 6.0 || latestEnv.soil_ph > 7.5)) {
      list.push('土壤 pH 不在 6.0-7.5，建议施用调节剂。')
    }
    return list.length ? list : ['环境指标正常，无需额外操作。']
  }, [latestEnv])

  if (loading && !detail) {
    return (
      <div className="farm-detail-page">
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">加载中...</div>
        </div>
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div className="farm-detail-page">
        <div style={{ padding: 20 }}>
          <h3>农场详情加载失败</h3>
          <p style={{ color: '#666', marginTop: 8 }}>{error}</p>
          <button style={{ marginTop: 12 }} onClick={() => navigate('/farm/list')}>
            返回农场列表
          </button>
        </div>
      </div>
    )
  }

  if (!detail) {
    return <div className="farm-detail-page">暂无农场详情数据</div>
  }

  const currentFarm = availableFarms.find(f => f.farm_id === parseInt(id))

  return (
    <div className={`farm-detail-page ${isSwitching ? 'switching' : ''}`}>
      {/* 切换提示 */}
      {switchNotification && (
        <div className="switch-notification">
          <div className="notification-content">
            {getStatusBadge({ status: switchNotification.status })}
            <span>已切换至【{switchNotification.farmName}】</span>
          </div>
        </div>
      )}

      <div className="farm-detail-header">
        <div className="farm-header-left">
          <div className="farm-name-wrapper" ref={farmPanelRef}>
            <div
              className={`farm-name-trigger ${showFarmPanel ? 'active' : ''}`}
              onMouseEnter={() => setShowFarmPanel(true)}
              onClick={() => setShowFarmPanel(!showFarmPanel)}
            >
              <span className="farm-name-text">
                {detail.farm_name}
                {currentFarm && getStatusBadge(currentFarm, 'circle')}
              </span>
              <span className="farm-name-underline"></span>
              <span className={`farm-name-arrow ${showFarmPanel ? 'rotated' : ''}`}>▼</span>
            </div>
            
            {/* 悬浮面板 */}
            {showFarmPanel && (
              <div className="farm-panel">
                {/* 搜索框 */}
                <div className="farm-panel-search">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="搜索农场名称或地址..."
                    value={farmSearchKeyword}
                    onChange={(e) => setFarmSearchKeyword(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                </div>

                {/* 状态筛选标签栏 */}
                <div className="farm-panel-status-filter">
                  <button
                    className={`status-filter-btn ${statusFilter === '' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('')}
                  >
                    全部
                  </button>
                  <button
                    className={`status-filter-btn status-normal ${statusFilter === 'normal' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('normal')}
                  >
                    正常
                  </button>
                  <button
                    className={`status-filter-btn status-warning ${statusFilter === 'warning' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('warning')}
                  >
                    预警
                  </button>
                  <button
                    className={`status-filter-btn status-alarm ${statusFilter === 'alarm' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('alarm')}
                  >
                    告警
                  </button>
                </div>

                {/* 农场列表 */}
                <div className="farm-panel-list">
                  {/* 最近访问分组 */}
                  {groupedFarms.recent.length > 0 && !farmSearchKeyword && (
                    <div className="farm-group">
                      <div className="farm-group-title">最近访问</div>
                      {groupedFarms.recent.map(farm => (
                        <FarmPanelItem
                          key={farm.farm_id}
                          farm={farm}
                          isActive={farm.farm_id === parseInt(id)}
                          isSelected={selectedFarms.includes(farm.farm_id)}
                          hovered={hoveredFarmId === farm.farm_id}
                          onHover={setHoveredFarmId}
                          onSwitch={handleFarmSwitch}
                          onDoubleClick={handleDoubleClick}
                          onSelect={(farmId) => {
                            setSelectedFarms(prev => 
                              prev.includes(farmId)
                                ? prev.filter(id => id !== farmId)
                                : [...prev, farmId]
                            )
                          }}
                          onMoreClick={setShowMoreMenu}
                          showMore={showMoreMenu === farm.farm_id}
                          moreMenuRef={moreMenuRef}
                          user={user}
                          searchKeyword={farmSearchKeyword}
                          highlightKeyword={highlightKeyword}
                        />
                      ))}
                    </div>
                  )}

                  {/* 所有农场/我管理的农场分组 */}
                  {((groupedFarms.all && groupedFarms.all.length > 0) || 
                    (groupedFarms.managed && groupedFarms.managed.length > 0)) && (
                    <div className="farm-group">
                      <div className="farm-group-title">
                        {user?.role_id === 1 ? '所有农场' : '我管理的农场'}
                      </div>
                      {(groupedFarms.all || groupedFarms.managed).slice(0, 10).map(farm => (
                        <FarmPanelItem
                          key={farm.farm_id}
                          farm={farm}
                          isActive={farm.farm_id === parseInt(id)}
                          isSelected={selectedFarms.includes(farm.farm_id)}
                          hovered={hoveredFarmId === farm.farm_id}
                          onHover={setHoveredFarmId}
                          onSwitch={handleFarmSwitch}
                          onDoubleClick={handleDoubleClick}
                          onSelect={(farmId) => {
                            setSelectedFarms(prev => 
                              prev.includes(farmId)
                                ? prev.filter(id => id !== farmId)
                                : [...prev, farmId]
                            )
                          }}
                          onMoreClick={setShowMoreMenu}
                          showMore={showMoreMenu === farm.farm_id}
                          moreMenuRef={moreMenuRef}
                          user={user}
                          searchKeyword={farmSearchKeyword}
                          highlightKeyword={highlightKeyword}
                        />
                      ))}
                    </div>
                  )}

                  {filteredFarms.length === 0 && (
                    <div className="farm-panel-empty">暂无农场</div>
                  )}
                </div>

                {/* 底部操作 */}
                <div className="farm-panel-footer">
                  {selectedFarms.length > 0 && (
                    <button className="batch-export-btn" onClick={handleBatchExport}>
                      批量导出 ({selectedFarms.length})
                    </button>
                  )}
                  <button className="view-all-btn" onClick={() => navigate('/farm/list')}>
                    查看全部农场
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="sub-text">{detail.address}</div>
        </div>
        <div className="farm-header-actions">
          <div className="back-menu-wrapper" ref={backMenuRef}>
            <button 
              className="btn-secondary back-btn"
              onClick={() => setShowBackMenu(!showBackMenu)}
            >
              返回
              <span className="back-arrow">▼</span>
            </button>
            {showBackMenu && (
              <div className="back-menu">
                <div className="back-menu-item" onClick={() => {
                  setShowBackMenu(false)
                  navigate('/farm/list')
                }}>
                  返回农场列表
                </div>
                <div className="back-menu-item" onClick={() => {
                  setShowBackMenu(false)
                  navigate(-1)
                }}>
                  返回上一级
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="farm-tabs">
        {tabs.map(tab => (
          <div
            key={tab.key}
            className={`farm-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="farm-tab-panel">
        {activeTab === 'base' && (
          <BaseInfo
            detail={detail}
            onSubmit={handleBaseUpdate}
            loading={formLoading}
            farmId={id}
          />
        )}

        {activeTab === 'crop' && (
          <CropPanel farmId={id} crops={crops} refresh={fetchCrops} />
        )}

        {activeTab === 'device' && (
          <DevicePanel farmId={id} devices={devices} refresh={fetchDevices} />
        )}

        {activeTab === 'charts' && (
          <ChartsPanel env24={envHistory24h} env7d={envHistory7d} />
        )}

        {activeTab === 'health' && (
          <HealthPanel score={healthScore} factors={healthFactors} />
        )}

        {activeTab === 'advice' && (
          <AdvicePanel advice={advice} />
        )}
      </div>
    </div>
  )
}

const BaseInfo = ({ detail, onSubmit, loading, farmId }) => {
  const [form, setForm] = useState({
    farm_name: detail.farm_name || '',
    address: detail.address || '',
    phone: detail.phone || '',
    principal_id: detail.principal_id || '',
    longitude: detail.longitude || '',
    latitude: detail.latitude || ''
  })
  const [principals, setPrincipals] = useState([])
  const [bindPrincipals, setBindPrincipals] = useState([])

  // 获取所有农场管理员（用于选择主负责人）
  useEffect(() => {
    api.get('/farm/principals').then(res => setPrincipals(res.data || []))
  }, [])

  // 获取当前农场绑定的所有负责人
  useEffect(() => {
    const fetchBindPrincipals = async () => {
      try {
        const res = await api.get('/principal/list', {
          params: { farm_id: farmId, page: 1, pageSize: 100 }
        })
        setBindPrincipals(res.data.data || [])
      } catch (error) {
        console.error('获取绑定负责人失败:', error)
      }
    }
    if (farmId) {
      fetchBindPrincipals()
    }
  }, [farmId])

  return (
    <div className="card">
      <div className="card-title">基础信息</div>
      <div className="form-grid">
        <label>农场名称*</label>
        <input value={form.farm_name} onChange={e => setForm({ ...form, farm_name: e.target.value })} />
        <label>地址</label>
        <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <label>电话</label>
        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <label>经纬度</label>
        <div className="coord-input-row">
          <input value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="经度" />
          <span className="coord-separator">/</span>
          <input value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="纬度" />
        </div>
        <label>负责人</label>
        <select value={form.principal_id} onChange={e => setForm({ ...form, principal_id: e.target.value })}>
          <option value="">选择负责人</option>
          {bindPrincipals.length > 0 && (
            <optgroup label="当前农场绑定负责人">
              {bindPrincipals.map(p => (
                <option key={p.user_id} value={p.user_id}>
                  {p.real_name}（{p.phone}）{p.principal_type === '主' ? ' [主]' : ' [副]'}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="所有农场管理员">
            {principals.map(p => (
              <option key={p.user_id} value={p.user_id}>{p.real_name}（{p.phone}）</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="actions">
        <button
          className="submit-btn"
          disabled={loading}
          onClick={() => onSubmit(form)}
        >
          {loading ? '提交中...' : '确认修改'}
        </button>
      </div>
    </div>
  )
}

const CropPanel = ({ farmId, crops, refresh }) => {
  const [form, setForm] = useState({ crop_type: '', plant_area: '', sow_time: '' })
  const [editing, setEditing] = useState(null)

  const submit = async () => {
    if (!form.crop_type || !form.plant_area || !form.sow_time) {
      alert('请填写完整作物信息')
      return
    }
    try {
      if (editing) {
        await api.put(`/farm/${farmId}/crops/${editing.crop_id}`, form)
        alert('操作成功')
      } else {
        await api.post(`/farm/${farmId}/crops`, form)
        alert('操作成功')
      }
      setForm({ crop_type: '', plant_area: '', sow_time: '' })
      setEditing(null)
      refresh()
    } catch (error) {
      console.error('作物操作失败:', error)
      alert(error.response?.data?.message || '操作失败')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('确认解除关联/删除作物？')) return
    try {
      await api.delete(`/farm/${farmId}/crops/${id}`)
      alert('删除成功')
      refresh()
    } catch (error) {
      console.error('删除失败:', error)
      alert(error.response?.data?.message || '删除失败')
    }
  }

  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">关联作物</div>
        <div className="actions">
          <button onClick={() => { setEditing(null); setForm({ crop_type: '', plant_area: '', sow_time: '' }) }}>新增</button>
        </div>
      </div>
      <div className="simple-table">
        <table>
          <thead>
            <tr>
              <th>作物</th>
              <th>种植区域</th>
              <th>播种时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {crops.length === 0 && (
              <tr>
                <td colSpan="4">
                  <div className="empty-state-panel">
                    <div className="empty-icon">🌾</div>
                    <div className="empty-text">暂无关联作物</div>
                    <button 
                      className="empty-action-btn"
                      onClick={() => { setEditing(null); setForm({ crop_type: '', plant_area: '', sow_time: '' }) }}
                    >
                      新增关联
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {crops.map(c => (
              <tr key={c.crop_id}>
                <td>{c.crop_type}</td>
                <td>{c.plant_area}</td>
                <td>{c.sow_time ? new Date(c.sow_time).toLocaleDateString() : '-'}</td>
                <td>
                  <button onClick={() => { setEditing(c); setForm({ crop_type: c.crop_type, plant_area: c.plant_area, sow_time: c.sow_time?.slice(0,10) || '' }) }}>编辑</button>
                  <button className="danger" onClick={() => remove(c.crop_id)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-inline">
        <input placeholder="作物类型" value={form.crop_type} onChange={e => setForm({ ...form, crop_type: e.target.value })} />
        <input placeholder="种植区域" value={form.plant_area} onChange={e => setForm({ ...form, plant_area: e.target.value })} />
        <input type="date" value={form.sow_time} onChange={e => setForm({ ...form, sow_time: e.target.value })} />
        <button onClick={submit}>{editing ? '确认修改' : '添加关联'}</button>
      </div>
    </div>
  )
}

const DevicePanel = ({ farmId, devices, refresh }) => {
  const [form, setForm] = useState({
    device_name: '',
    install_location: '',
    device_status: '在线',
    monitor_area: '',
    device_category: ''
  })
  const [editing, setEditing] = useState(null)

  const submit = async () => {
    if (!form.device_name || !form.install_location || !form.device_status || !form.monitor_area) {
      alert('请填写完整设备信息')
      return
    }
    try {
      if (editing) {
        await api.put(`/farm/${farmId}/devices/${editing.device_id}`, form)
        alert('操作成功')
      } else {
        await api.post(`/farm/${farmId}/devices`, form)
        alert('操作成功')
      }
      setForm({ device_name: '', install_location: '', device_status: '在线', monitor_area: '', device_category: '' })
      setEditing(null)
      refresh()
    } catch (error) {
      console.error('设备操作失败:', error)
      alert(error.response?.data?.message || '操作失败')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('确认解除绑定/删除设备？')) return
    try {
      await api.delete(`/farm/${farmId}/devices/${id}`)
      alert('删除成功')
      refresh()
    } catch (error) {
      console.error('删除失败:', error)
      alert(error.response?.data?.message || '删除失败')
    }
  }

  return (
    <div className="card">
      <div className="card-title-row">
        <div className="card-title">关联设备</div>
        <div className="actions">
          <button onClick={() => { setEditing(null); setForm({ device_name: '', install_location: '', device_status: '在线', monitor_area: '', device_category: '' }) }}>新增</button>
        </div>
      </div>
      <div className="simple-table">
        <table>
          <thead>
            <tr>
              <th>设备名称</th>
              <th>监测区域</th>
              <th>状态</th>
              <th>类别</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr>
                <td colSpan="5">
                  <div className="empty-state-panel">
                    <div className="empty-icon">📡</div>
                    <div className="empty-text">暂无关联设备</div>
                    <button 
                      className="empty-action-btn"
                      onClick={() => { setEditing(null); setForm({ device_name: '', install_location: '', device_status: '在线', monitor_area: '', device_category: '' }) }}
                    >
                      新增绑定
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {devices.map(d => (
              <tr key={d.device_id}>
                <td>{d.device_name}</td>
                <td>{d.monitor_area}</td>
                <td>{d.device_status}</td>
                <td>{d.device_category || '-'}</td>
                <td>
                  <button onClick={() => { setEditing(d); setForm({ device_name: d.device_name, install_location: d.install_location, device_status: d.device_status, monitor_area: d.monitor_area, device_category: d.device_category || '' }) }}>编辑</button>
                  <button className="danger" onClick={() => remove(d.device_id)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-inline">
        <input placeholder="设备名称" value={form.device_name} onChange={e => setForm({ ...form, device_name: e.target.value })} />
        <input placeholder="监测区域" value={form.monitor_area} onChange={e => setForm({ ...form, monitor_area: e.target.value })} />
        <input placeholder="安装位置" value={form.install_location} onChange={e => setForm({ ...form, install_location: e.target.value })} />
        <select value={form.device_status} onChange={e => setForm({ ...form, device_status: e.target.value })}>
          <option value="在线">在线</option>
          <option value="离线">离线</option>
          <option value="故障">故障</option>
        </select>
        <input placeholder="设备类别（可选）" value={form.device_category} onChange={e => setForm({ ...form, device_category: e.target.value })} />
        <button onClick={submit}>{editing ? '确认修改' : '添加绑定'}</button>
      </div>
    </div>
  )
}

const ChartsPanel = ({ env24, env7d }) => {
  return (
    <div className="card">
      <div className="card-title">环境趋势</div>
      <div className="chart-grid">
        <SimpleLineChart title="温度(24h)" field="temperature" data={env24} color="#ff7043" />
        <SimpleLineChart title="湿度(24h)" field="humidity" data={env24} color="#42a5f5" />
        <SimpleBarChart title="土壤pH(近7天)" field="soil_ph" data={env7d} color="#66bb6a" />
        <SimplePieChart title="风速/降雨(近7天)" data={env7d} />
      </div>
    </div>
  )
}

const HealthPanel = ({ score, factors }) => (
  <div className="card">
    <div className="card-title">作物健康度</div>
    <div className="health-row">
      <div className="ring">
        <div className="ring-inner">
          <span>{score ?? '--'}%</span>
        </div>
      </div>
      <div className="health-factors">
        {factors?.map((f, i) => (
          <div key={i} className="factor-item">{f}</div>
        ))}
      </div>
    </div>
  </div>
)

const AdvicePanel = ({ advice }) => (
  <div className="card">
    <div className="card-title">智能灌溉 / 施肥建议</div>
    <ul className="advice-list">
      {advice?.map((a, i) => (
        <li key={i}>{a}</li>
      ))}
    </ul>
  </div>
)

// ========== 简易图表 ==========
const SimpleLineChart = ({ title, field, data, color }) => {
  if (!data || data.length === 0) return (
    <div className="mini-chart"><div className="chart-title">{title}</div><div className="chart-empty">暂无数据</div></div>
  )
  const values = data
    .map(d => (d[field] !== null && d[field] !== undefined ? Number(d[field]) : null))
    .filter(v => v !== null)
  if (values.length === 0) return (
    <div className="mini-chart"><div className="chart-title">{title}</div><div className="chart-empty">暂无数据</div></div>
  )
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = data.map((d, i) => {
    const v = d[field]
    if (v === null || v === undefined) return null
    const x = (i / Math.max(data.length - 1, 1)) * 100
    const y = 100 - ((v - min) / range) * 80 - 10
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  return (
    <div className="mini-chart">
      <div className="chart-title">{title}</div>
      <svg viewBox="0 0 100 100" className="chart-svg">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      </svg>
      <div className="chart-footer">
        <span>最小值：{min}</span>
        <span>最大值：{max}</span>
      </div>
    </div>
  )
}

const SimpleBarChart = ({ title, field, data, color }) => {
  if (!data || data.length === 0) return (
    <div className="mini-chart"><div className="chart-title">{title}</div><div className="chart-empty">暂无数据</div></div>
  )
  const values = data.map(d => d[field] ?? null).filter(v => v !== null)
  if (values.length === 0) return (
    <div className="mini-chart"><div className="chart-title">{title}</div><div className="chart-empty">暂无数据</div></div>
  )
  const max = Math.max(...values)
  return (
    <div className="mini-chart">
      <div className="chart-title">{title}</div>
      <div className="bar-list">
        {data.map((d, idx) => {
          const v = d[field]
          if (v === null || v === undefined) return null
          const height = max === 0 ? 0 : (v / max) * 100
          return (
            <div key={idx} className="bar-item">
              <div className="bar" style={{ height: `${height}%`, background: color }}></div>
              <div className="bar-label">{new Date(d.monitor_time).getMonth()+1}/{new Date(d.monitor_time).getDate()}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const SimplePieChart = ({ title, data }) => {
  if (!data || data.length === 0) return (
    <div className="mini-chart"><div className="chart-title">{title}</div><div className="chart-empty">暂无数据</div></div>
  )
  const wind = data.map(d => Number(d.wind_speed || 0)).reduce((a,b)=>a+b,0)
  const rain = data.map(d => Number(d.rainfall || 0)).reduce((a,b)=>a+b,0)
  const total = wind + rain || 1
  const windDeg = (wind/total)*360

  return (
    <div className="mini-chart">
      <div className="chart-title">{title}</div>
      <svg viewBox="0 0 42 42" className="pie">
        <circle r="15.915" cx="21" cy="21" fill="transparent" stroke="#42a5f5" strokeWidth="6"
          strokeDasharray={`${(wind/total)*100} ${100-(wind/total)*100}`} strokeDashoffset="25" />
        <circle r="15.915" cx="21" cy="21" fill="transparent" stroke="#8d6e63" strokeWidth="6"
          strokeDasharray={`${(rain/total)*100} ${100-(rain/total)*100}`} strokeDashoffset={25 + windDeg/360*100} />
      </svg>
      <div className="chart-footer">
        <span>风速合计: {wind.toFixed(2)}</span>
        <span>降雨合计: {rain.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ========== 工具函数 ==========
function scoreRange(value, idealMin, idealMax, tol) {
  if (value === null || value === undefined) return 0
  if (value >= idealMin && value <= idealMax) return 100
  if (value < idealMin) {
    const diff = idealMin - value
    return Math.max(0, 100 - (diff / tol) * 100)
  }
  if (value > idealMax) {
    const diff = value - idealMax
    return Math.max(0, 100 - (diff / tol) * 100)
  }
  return 0
}

function inRange(val, min, max) {
  if (val === null || val === undefined) return false
  return val >= min && val <= max
}

// 农场面板项组件
const FarmPanelItem = ({
  farm,
  isActive,
  isSelected,
  hovered,
  onHover,
  onSwitch,
  onDoubleClick,
  onSelect,
  onMoreClick,
  showMore,
  moreMenuRef,
  user,
  searchKeyword,
  highlightKeyword
}) => {
  const isAdmin = user?.role_id === 1

  const getFarmStatusTag = (farm) => {
    if (!farm.status) return null
    const statusText = farm.status === 'alarm' ? '告警' : farm.status === 'warning' ? '预警' : '正常'
    return (
      <span className={`farm-status-badge-circle status-${farm.status}`}>
        {statusText}
      </span>
    )
  }

  return (
    <div
      className={`farm-panel-item ${isActive ? 'active' : ''} ${hovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
      onMouseEnter={() => onHover(farm.farm_id)}
      onMouseLeave={() => {
        onHover(null)
        if (!showMore) {
          onMoreClick(null)
        }
      }}
      onClick={() => onSelect(farm.farm_id)}
      onDoubleClick={() => onDoubleClick(farm.farm_id, farm.farm_name)}
    >
      <div className="farm-item-checkbox">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(farm.farm_id)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="farm-item-content">
        <div className="farm-item-header">
          {getFarmStatusTag(farm)}
          <span className="farm-item-name">
            {searchKeyword ? highlightKeyword(farm.farm_name, searchKeyword) : farm.farm_name}
          </span>
          {isActive && <span className="farm-item-checkmark">✓</span>}
        </div>
        <div className="farm-item-address">
          {searchKeyword && farm.address ? highlightKeyword(farm.address, searchKeyword) : (farm.address || '暂无地址')}
        </div>
      </div>
      <div className="farm-item-actions">
        {hovered && (
          <>
            <button
              className="quick-switch-btn"
              onClick={(e) => {
                e.stopPropagation()
                onSwitch(farm.farm_id, farm.farm_name)
              }}
            >
              快速切换
            </button>
            <div className="more-menu-wrapper" ref={moreMenuRef}>
              <button
                className="more-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onMoreClick(showMore ? null : farm.farm_id)
                }}
              >
                •••
              </button>
              {showMore && (
                <div className="more-menu">
                  <div className="more-menu-item" onClick={() => onSwitch(farm.farm_id, farm.farm_name)}>
                    查看详情
                  </div>
                  <div className="more-menu-item" onClick={() => {
                    onMoreClick(null)
                    // 可以在这里添加编辑功能
                  }}>
                    编辑基础信息
                  </div>
                  {isAdmin && (
                    <div className="more-menu-item danger" onClick={() => {
                      onMoreClick(null)
                      // 可以在这里添加解除绑定功能
                    }}>
                      解除负责人绑定
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FarmDetail


