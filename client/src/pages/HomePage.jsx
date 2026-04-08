import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { INVENTORY_CHANGED_EVENT } from '../utils/inventoryEvents'
import { WARNING_CHANGED_EVENT } from '../utils/warningEvents'
import './HomePage.css'

/** 首页预警列表统一时间格式 */
function formatAlertTime(value) {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const HomePage = () => {
  const navigate = useNavigate()
  const [weather, setWeather] = useState(null)
  const [weatherHistory, setWeatherHistory] = useState([])
  const [weatherRange, setWeatherRange] = useState('24h') // 24h or 7d
  const [deviceStats, setDeviceStats] = useState([])
  const [warnings, setWarnings] = useState([])
  const [stockAlerts, setStockAlerts] = useState({ total: 0, low_count: 0, out_count: 0, items: [] })
  const [videos, setVideos] = useState([])
  const [mapData, setMapData] = useState({ farms: [], devices: [] })
  const [loading, setLoading] = useState(false)
  const [warningPage, setWarningPage] = useState(1)
  const [hasMoreWarnings, setHasMoreWarnings] = useState(true)
  const warningScrollRef = useRef(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // 获取气象站数据
  const fetchWeather = async () => {
    try {
      const res = await api.get('/homepage/weather')
      setWeather(res.data)
    } catch (error) {
      console.error('获取气象数据失败:', error)
    }
  }

  // 获取气象历史数据（用于趋势图）
  const fetchWeatherHistory = useCallback(async (range = '24h') => {
    try {
      setWeatherLoading(true)
      const res = await api.get('/homepage/weather-history', {
        params: { range }
      })
      setWeatherHistory(res.data || [])
    } catch (error) {
      console.error('获取气象历史数据失败:', error)
    } finally {
      setWeatherLoading(false)
    }
  }, [])

  // 获取设备统计
  const fetchDeviceStats = async () => {
    try {
      const res = await api.get('/homepage/device-stats')
      setDeviceStats(res.data)
    } catch (error) {
      console.error('获取设备统计失败:', error)
    }
  }

  const fetchStockAlerts = useCallback(async () => {
    try {
      const res = await api.get('/homepage/stock-warnings')
      setStockAlerts(res.data || { total: 0, low_count: 0, out_count: 0, items: [] })
      window.dispatchEvent(new CustomEvent('app:stock-alert-count', { detail: { count: res.data?.total ?? 0 } }))
    } catch (error) {
      console.error('获取库存预警失败:', error)
    }
  }, [])

  // 获取作物/设备类预警消息列表
  const fetchWarnings = useCallback(async (page = 1, append = false) => {
    if (loading) return
    setLoading(true)
    try {
      const res = await api.get('/warning/list', {
        params: { page, pageSize: 10 }
      })
      if (append) {
        setWarnings(prev => [...prev, ...res.data.data])
      } else {
        setWarnings(res.data.data)
      }
      setHasMoreWarnings(res.data.hasMore)
      setWarningPage(page)
    } catch (error) {
      console.error('获取预警列表失败:', error)
    } finally {
      setLoading(false)
    }
  }, [loading])

  // 获取视频列表
  const fetchVideos = async () => {
    try {
      const res = await api.get('/homepage/videos')
      setVideos(res.data)
    } catch (error) {
      console.error('获取视频列表失败:', error)
    }
  }

  // 获取地图数据
  const fetchMapData = async () => {
    try {
      const res = await api.get('/homepage/map-overview')
      setMapData(res.data)
    } catch (error) {
      console.error('获取地图数据失败:', error)
    }
  }

  // 标记预警为已读
  const markWarningAsRead = async (warningId) => {
    try {
      await api.post(`/warning/read/${warningId}`)
      // 更新本地状态
      setWarnings(prev =>
        prev.map(w => (w.exception_id === warningId ? { ...w, is_read: 1 } : w))
      )
    } catch (error) {
      console.error('标记已读失败:', error)
    }
  }

  // 预警消息滚动处理（无限滚动）
  const handleWarningScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    // 滚动到底部时加载更多
    if (scrollHeight - scrollTop <= clientHeight + 50 && hasMoreWarnings && !loading) {
      fetchWarnings(warningPage + 1, true)
    }
  }, [warningPage, hasMoreWarnings, loading, fetchWarnings])

  // 初始化数据
  useEffect(() => {
    fetchWeather()
    fetchWeatherHistory(weatherRange)
    fetchDeviceStats()
    fetchStockAlerts()
    fetchWarnings(1, false)
    fetchVideos()
    fetchMapData()
  }, [fetchWeatherHistory, weatherRange, fetchStockAlerts])

  useEffect(() => {
    const onInv = () => {
      fetchStockAlerts()
      fetchWarnings(1, false)
    }
    const onWarn = () => {
      fetchWarnings(1, false)
    }
    window.addEventListener(INVENTORY_CHANGED_EVENT, onInv)
    window.addEventListener(WARNING_CHANGED_EVENT, onWarn)
    return () => {
      window.removeEventListener(INVENTORY_CHANGED_EVENT, onInv)
      window.removeEventListener(WARNING_CHANGED_EVENT, onWarn)
    }
  }, [fetchStockAlerts, fetchWarnings])

  // 环境模拟在服务端异步生成异常时，定时刷新首页预警列表（与实时监控页互补）
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      fetchWarnings(1, false)
    }, 60000)
    return () => window.clearInterval(id)
  }, [fetchWarnings])

  // 作物/设备预警等级 → 与库存「红/黄」体系对齐：1=紧急(红) 2=普通(黄) 3=提示(琥珀浅)
  const getCropLevelMeta = (level) => {
    const map = {
      1: { label: '紧急', tier: 'critical' },
      2: { label: '普通', tier: 'warn' },
      3: { label: '提示', tier: 'info' }
    }
    return map[level] || map[2]
  }

  /** 合并库存预警与作物/设备预警，按时间倒序（库存无时间则排后） */
  const unifiedAlerts = useMemo(() => {
    const stockItems = (stockAlerts.items || []).map((s) => {
      const t = s.sort_time ? new Date(s.sort_time).getTime() : 0
      const tier = s.level === 'critical' ? 'critical' : 'warn'
      return {
        key: `stock-${s.material_id}`,
        kind: 'stock',
        tier,
        categoryLabel: '库存预警',
        name: s.material_name || '农资',
        timeMs: t,
        timeDisplay: formatAlertTime(s.sort_time),
        statusLabel: s.stock_state === '缺货' ? '缺货' : '库存不足',
        subLine: `${s.farm_name || ''} · 安全库存 ${s.safety_stock_num ?? '—'}`,
        stock: s
      }
    })

    const cropItems = (warnings || []).map((w) => {
      const meta = getCropLevelMeta(w.warning_level)
      const t = w.exception_time ? new Date(w.exception_time).getTime() : 0
      const hs = w.handle_status || '—'
      return {
        key: `crop-${w.exception_id}`,
        kind: 'crop',
        tier: meta.tier,
        categoryLabel: '作物/设备',
        name: w.exception_type || '异常',
        timeMs: t,
        timeDisplay: formatAlertTime(w.exception_time),
        statusLabel: `${meta.label} · ${hs}`,
        subLine: [w.farm_name, w.plant_area, w.device_name].filter(Boolean).join(' · ') || '—',
        detail: w.exception_detail,
        unread: w.is_read === 0,
        crop: w
      }
    })

    return [...stockItems, ...cropItems].sort((a, b) => b.timeMs - a.timeMs)
  }, [stockAlerts.items, warnings])

  const handleUnifiedRowClick = (row) => {
    if (row.kind === 'stock') {
      navigate('/material/warning')
      return
    }
    const w = row.crop
    if (w.is_read === 0) {
      markWarningAsRead(w.exception_id)
    }
    navigate('/warning/exception')
  }

  return (
    <div className="homepage">
      <div className="homepage-grid">
        {/* 气象站模块（趋势图） */}
        <div className="homepage-card weather-card">
          <div className="card-header">
            <h3>🌤️ 气象站</h3>
          </div>
          <div className="card-content">
            <div className="weather-header">
              <div className="weather-range-toggle">
                <button
                  className={weatherRange === '24h' ? 'active' : ''}
                  onClick={() => setWeatherRange('24h')}
                >
                  近24小时
                </button>
                <button
                  className={weatherRange === '7d' ? 'active' : ''}
                  onClick={() => setWeatherRange('7d')}
                >
                  近7天
                </button>
              </div>
              {weather && (
                <div className="weather-latest">
                  <span>当前天气：{weather.weather_type || '未知'}</span>
                  <span>温度：{weather.temperature}℃</span>
                  <span>湿度：{weather.humidity}%</span>
                </div>
              )}
            </div>
            {weatherLoading ? (
              <div className="empty-state">气象数据加载中...</div>
            ) : weatherHistory.length === 0 ? (
              <div className="empty-state">暂无气象历史数据</div>
            ) : (
              <div className="weather-charts">
                <SimpleLineChart
                  title="温度 (℃)"
                  color="#ff7043"
                  data={weatherHistory}
                  field="temperature"
                />
                <SimpleLineChart
                  title="湿度 (%)"
                  color="#42a5f5"
                  data={weatherHistory}
                  field="humidity"
                />
                <SimpleLineChart
                  title="土壤 pH"
                  color="#66bb6a"
                  data={weatherHistory}
                  field="soil_ph"
                />
              </div>
            )}
          </div>
        </div>

        {/* 设备统计模块 */}
        <div className="homepage-card device-stats-card">
          <div className="card-header">
            <h3>📊 设备统计</h3>
          </div>
          <div className="card-content">
            {deviceStats.length > 0 ? (
              <div className="device-stats">
                {deviceStats.map((stat, index) => (
                  <div key={index} className="stat-item">
                    <div className="stat-category">{stat.category}</div>
                    <div className="stat-details">
                      <span className="stat-total">总数：{stat.total}</span>
                      <span className="stat-online">在线：{stat.online}</span>
                      <span className="stat-offline">离线：{stat.offline}</span>
                      {stat.fault > 0 && (
                        <span className="stat-fault">故障：{stat.fault}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">暂无设备数据</div>
            )}
          </div>
        </div>

        {/* 预警消息模块（库存预警 + 作物异常） */}
        <div className="homepage-card warning-card">
          <div className="card-header warning-card-header">
            <h3 className="warning-title-row">
              <span>⚠️ 预警消息</span>
              {stockAlerts.total > 0 ? <span className="header-badge-dot" title="存在库存预警" /> : null}
            </h3>
          </div>
          <div
            className="warning-list"
            ref={warningScrollRef}
            onScroll={handleWarningScroll}
          >
            {(() => {
              const cropCount = warnings.length
              const stockCount = stockAlerts.total
              const totalAlerts = stockCount + cropCount
              if (totalAlerts === 0) {
                return <div className="empty-state">暂无预警信息</div>
              }
              return (
                <>
                  <div className="warning-summary">
                    当前共 <strong>{totalAlerts}</strong> 条预警（按时间倒序）
                    {stockCount > 0 ? (
                      <span className="stock-summary-line">
                        ；库存：<strong className="stock-count-highlight">{stockCount}</strong> 条
                        {stockAlerts.out_count > 0 ? (
                          <span className="tag-severe"> 缺货 {stockAlerts.out_count}</span>
                        ) : null}
                        {stockAlerts.low_count > 0 ? (
                          <span className="tag-low"> 不足 {stockAlerts.low_count}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <div className="unified-alert-list">
                    {unifiedAlerts.map((row) => (
                      <button
                        key={row.key}
                        type="button"
                        className={`unified-alert-card tier-${row.tier} ${row.kind === 'crop' && row.unread ? 'is-unread' : ''}`}
                        onClick={() => handleUnifiedRowClick(row)}
                      >
                        <div className="u-alert-top">
                          <div className="u-alert-left">
                            <span className="u-alert-cat">{row.categoryLabel}</span>
                            <span className="u-alert-name">{row.name}</span>
                          </div>
                          <time className="u-alert-time" dateTime={row.timeMs ? new Date(row.timeMs).toISOString() : undefined}>
                            {row.timeDisplay}
                          </time>
                        </div>
                        <div className="u-alert-bottom">
                          <span className={`u-alert-status status-${row.tier}`}>{row.statusLabel}</span>
                          <span className="u-alert-sub">{row.subLine}</span>
                        </div>
                        {row.kind === 'crop' && row.detail ? (
                          <p className="u-alert-detail">{row.detail}</p>
                        ) : null}
                        {row.kind === 'crop' && row.unread ? <span className="u-alert-unread">未读</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              )
            })()}
            {loading ? <div className="loading-more">加载中...</div> : null}
            {!hasMoreWarnings && warnings.length > 0 ? <div className="no-more">没有更多数据了</div> : null}
          </div>
        </div>

        {/* 通用视频模块 */}
        <div className="homepage-card video-card">
          <div className="card-header">
            <h3>📹 通用视频</h3>
          </div>
          <div className="card-content">
            {videos.length > 0 ? (
              <div className="video-list">
                {videos.map((video) => (
                  <div key={video.id} className="video-item">
                    <div className="video-wrapper">
                      {video.video_status === 1 ? (
                        <video
                          src={video.video_url}
                          controls
                          className="video-player"
                        />
                      ) : (
                        <div className="video-placeholder">
                          <span>无信号</span>
                        </div>
                      )}
                    </div>
                    <div className="video-info">
                      <div className="video-name">{video.device_name}</div>
                      <div className="video-location">{video.install_location}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">暂无视频设备</div>
            )}
          </div>
        </div>

        {/* 地图概览模块 */}
        <div className="homepage-card map-card">
          <div className="card-header">
            <h3>🗺️ 地图概览</h3>
          </div>
          <div className="card-content">
            {mapData.farms.length > 0 ? (
              <div className="map-overview">
                <div className="map-container">
                  {/* 这里可以集成地图组件，如高德地图、百度地图等 */}
                  <div className="map-placeholder">
                    <p>地图组件（可集成第三方地图SDK）</p>
                    <p>农场数量：{mapData.farms.length}</p>
                    <p>设备数量：{mapData.devices.length}</p>
                  </div>
                </div>
                <div className="map-legend">
                  {mapData.farms.map((farm) => (
                    <div key={farm.farm_id} className="legend-item">
                      <span className="legend-name">{farm.farm_name}</span>
                      <span className="legend-info">
                        设备：{farm.device_count} | 作物：{farm.crop_count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">暂无地图数据</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 简易折线图组件（SVG 实现，避免引入大型图表库）
const SimpleLineChart = ({ title, color, data, field }) => {
  if (!data || data.length === 0) return null

  const values = data
    .map(d => (d[field] !== null && d[field] !== undefined ? Number(d[field]) : null))
    .filter(v => v !== null)

  if (values.length === 0) {
    return (
      <div className="simple-chart">
        <div className="simple-chart-title">{title}</div>
        <div className="simple-chart-empty">暂无数据</div>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = data
    .map((d, index) => {
      const v =
        d[field] !== null && d[field] !== undefined ? Number(d[field]) : null
      if (v === null) return null
      const x = (index / Math.max(data.length - 1, 1)) * 100
      const y = 100 - ((v - min) / range) * 80 - 10 // 留上下边距
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')

  return (
    <div className="simple-chart">
      <div className="simple-chart-title">{title}</div>
      <svg viewBox="0 0 100 100" className="simple-chart-svg">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
      <div className="simple-chart-footer">
        <span>最小值：{min}</span>
        <span>最大值：{max}</span>
      </div>
    </div>
  )
}

export default HomePage

