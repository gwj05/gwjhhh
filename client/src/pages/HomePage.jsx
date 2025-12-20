import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../utils/api'
import './HomePage.css'

const HomePage = () => {
  const [weather, setWeather] = useState(null)
  const [weatherHistory, setWeatherHistory] = useState([])
  const [weatherRange, setWeatherRange] = useState('24h') // 24h or 7d
  const [deviceStats, setDeviceStats] = useState([])
  const [warnings, setWarnings] = useState([])
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

  // 获取预警消息列表
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
    fetchWarnings(1, false)
    fetchVideos()
    fetchMapData()
  }, [fetchWeatherHistory, weatherRange])

  // 获取预警等级样式
  const getWarningLevelStyle = (level) => {
    const styles = {
      1: { bg: '#ffebee', border: '#f44336', text: '#c62828', label: '紧急' },
      2: { bg: '#fff3e0', border: '#ff9800', text: '#e65100', label: '普通' },
      3: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0', label: '提示' }
    }
    return styles[level] || styles[2]
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

        {/* 预警消息模块 */}
        <div className="homepage-card warning-card">
          <div className="card-header">
            <h3>⚠️ 预警消息</h3>
          </div>
          <div
            className="warning-list"
            ref={warningScrollRef}
            onScroll={handleWarningScroll}
          >
            {warnings.length > 0 ? (
              warnings.map((warning) => {
                const levelStyle = getWarningLevelStyle(warning.warning_level)
                return (
                  <div
                    key={warning.exception_id}
                    className={`warning-item ${warning.is_read === 0 ? 'unread' : ''}`}
                    style={{
                      borderLeftColor: levelStyle.border,
                      backgroundColor: warning.is_read === 0 ? '#fff5f5' : '#fff'
                    }}
                    onClick={() => warning.is_read === 0 && markWarningAsRead(warning.exception_id)}
                  >
                    <div className="warning-header">
                      <span className="warning-level" style={{ color: levelStyle.text }}>
                        {levelStyle.label}
                      </span>
                      <span className="warning-time">
                        {new Date(warning.exception_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="warning-type">{warning.exception_type}</div>
                    <div className="warning-detail">{warning.exception_detail}</div>
                    <div className="warning-meta">
                      <span>{warning.farm_name}</span>
                      <span>{warning.plant_area}</span>
                      <span>{warning.device_name}</span>
                    </div>
                    {warning.is_read === 0 && (
                      <div className="unread-badge">未读</div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="empty-state">暂无预警消息</div>
            )}
            {loading && (
              <div className="loading-more">加载中...</div>
            )}
            {!hasMoreWarnings && warnings.length > 0 && (
              <div className="no-more">没有更多数据了</div>
            )}
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

