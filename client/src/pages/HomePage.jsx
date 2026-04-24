import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { INVENTORY_CHANGED_EVENT } from '../utils/inventoryEvents'
import { WARNING_CHANGED_EVENT } from '../utils/warningEvents'
import { useFarmKey } from '../hooks/useFarmKey'
import {
  api as storeApi,
  useGetHomeWeatherQuery,
  useGetHomeWeatherHistoryQuery,
  useGetHomeDeviceStatsQuery,
  useGetHomeStockWarningsQuery,
  useGetHomeVideosQuery,
  useLazyGetWarningListQuery,
  useMarkWarningReadMutation
} from '../store/services/api'
import './HomePage.css'

/** 首页预警列表统一时间格式 */
function formatAlertTime(value) {
  if (value == null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 首页通用视频：外链失败时给出提示，避免黑屏无反馈 */
function HomeVideoPlayer ({ url, className }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="video-placeholder">
        <span>无法加载该视频（链接失效、网络限制或需 HTTPS）</span>
      </div>
    )
  }
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

const HomePage = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const farmKey = useFarmKey()
  const skipHome = !farmKey

  const [weatherRange, setWeatherRange] = useState('24h') // 24h or 7d
  const { data: weather } = useGetHomeWeatherQuery(farmKey, { skip: skipHome })
  const { data: weatherHistory = [], isFetching: weatherLoading } = useGetHomeWeatherHistoryQuery(
    { farmKey, range: weatherRange },
    { skip: skipHome }
  )
  const { data: deviceStats = [] } = useGetHomeDeviceStatsQuery(farmKey, { skip: skipHome })
  const { data: stockAlerts = { total: 0, low_count: 0, out_count: 0, items: [] } } =
    useGetHomeStockWarningsQuery(farmKey, { skip: skipHome })
  const { data: videos = [], isError: videosQueryError } = useGetHomeVideosQuery(farmKey, { skip: skipHome })

  const [warnings, setWarnings] = useState([])
  const [warningPage, setWarningPage] = useState(1)
  const [hasMoreWarnings, setHasMoreWarnings] = useState(true)
  const warningScrollRef = useRef(null)
  const [nowTick, setNowTick] = useState(Date.now())

  const [triggerWarn, { isFetching: warnListFetching }] = useLazyGetWarningListQuery()
  const [markWarningReadMut] = useMarkWarningReadMutation()

  const loadWarningsFirst = useCallback(async () => {
    if (!farmKey) return
    try {
      const res = await triggerWarn({ farmKey, page: 1, pageSize: 10 }).unwrap()
      setWarnings(res.data || [])
      setHasMoreWarnings(!!res.hasMore)
      setWarningPage(1)
    } catch (error) {
      console.error('获取预警列表失败:', error)
    }
  }, [farmKey, triggerWarn])

  const loadWarningsMore = useCallback(async () => {
    if (!farmKey || warnListFetching || !hasMoreWarnings) return
    const nextPage = warningPage + 1
    try {
      const res = await triggerWarn({ farmKey, page: nextPage, pageSize: 10 }).unwrap()
      setWarnings((prev) => [...prev, ...(res.data || [])])
      setHasMoreWarnings(!!res.hasMore)
      setWarningPage(nextPage)
    } catch (error) {
      console.error('加载更多预警失败:', error)
    }
  }, [farmKey, warnListFetching, hasMoreWarnings, warningPage, triggerWarn])

  useEffect(() => {
    loadWarningsFirst()
  }, [loadWarningsFirst])

  // 轻量刷新 “刚刚/xx分钟前” 显示（不触发接口）
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const onInv = () => {
      dispatch(storeApi.util.invalidateTags(['StockWarnings', 'Homepage']))
      loadWarningsFirst()
    }
    const onWarn = () => {
      dispatch(storeApi.util.invalidateTags(['Warnings', 'Homepage']))
      loadWarningsFirst()
    }
    window.addEventListener(INVENTORY_CHANGED_EVENT, onInv)
    window.addEventListener(WARNING_CHANGED_EVENT, onWarn)
    return () => {
      window.removeEventListener(INVENTORY_CHANGED_EVENT, onInv)
      window.removeEventListener(WARNING_CHANGED_EVENT, onWarn)
    }
  }, [dispatch, loadWarningsFirst])

  // 环境模拟在服务端异步生成异常时，定时刷新首页预警列表（与实时监控页互补）
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      loadWarningsFirst()
    }, 60000)
    return () => window.clearInterval(id)
  }, [loadWarningsFirst])

  const handleWarningScroll = useCallback(
    (e) => {
      const { scrollTop, scrollHeight, clientHeight } = e.target
      if (scrollHeight - scrollTop <= clientHeight + 50 && hasMoreWarnings && !warnListFetching) {
        loadWarningsMore()
      }
    },
    [hasMoreWarnings, warnListFetching, loadWarningsMore]
  )

  const markWarningAsRead = async (warningId) => {
    try {
      await markWarningReadMut(warningId).unwrap()
      setWarnings((prev) =>
        prev.map((w) => (w.exception_id === warningId ? { ...w, is_read: 1 } : w))
      )
    } catch (error) {
      console.error('标记已读失败:', error)
    }
  }

  // 作物/设备预警等级 → 与库存「红/黄」体系对齐：1=紧急(红) 2=普通(黄) 3=提示(琥珀浅)
  const getCropLevelMeta = (level) => {
    const map = {
      1: { label: '紧急', tier: 'critical' },
      2: { label: '普通', tier: 'warn' },
      3: { label: '提示', tier: 'info' }
    }
    return map[level] || map[2]
  }

  const getProbMeta = (prob) => {
    const p = Number(prob)
    if (!Number.isFinite(p)) return { pct: null, cls: '' }
    const pct = Math.round(p * 100)
    if (pct >= 70) return { pct, cls: 'risk-high' }
    if (pct >= 40) return { pct, cls: 'risk-mid' }
    return { pct, cls: 'risk-low' }
  }

  const getTierMeta = (tier) => {
    const m = {
      critical: { label: '严重', color: '#ef4444' },
      warn: { label: '普通', color: '#f59e0b' },
      info: { label: '提示', color: '#3b82f6' }
    }
    return m[tier] || m.warn
  }

  const extractNumericSnippet = (text) => {
    if (!text) return ''
    const s = String(text)
    // 优先匹配：如 39.9℃ / 60.5% / 6.8pH / 12m³ 等
    const m1 = s.match(/(-?\d+(?:\.\d+)?)\s*(℃|°C|%|pH|m³|m3|lx|Lux|mm|μg\/m3|mg\/L)/i)
    if (m1) return `${m1[1]}${m1[2]}`
    // 次选：任意数字（避免空）
    const m2 = s.match(/(-?\d+(?:\.\d+)?)/)
    return m2 ? m2[1] : ''
  }

  const formatRelative = (timeMs) => {
    if (!timeMs) return ''
    const diff = Math.max(0, nowTick - timeMs)
    const m = Math.floor(diff / 60000)
    if (m <= 0) return '刚刚'
    if (m < 60) return `${m} 分钟前`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} 小时前`
    const d = Math.floor(h / 24)
    return `${d} 天前`
  }

  /** 合并库存预警与作物/设备预警，按时间倒序（库存无时间则排后） */
  const unifiedAlerts = useMemo(() => {
    const stockItems = (stockAlerts.items || []).map((s) => {
      const t = s.sort_time ? new Date(s.sort_time).getTime() : 0
      const tier = s.level === 'critical' ? 'critical' : 'warn'
      const numeric = s.stock_state === '缺货' ? '0' : String(s.stock_num ?? '—')
      const hs = s.handle_status || '未处理'
      const suggest = s.suggest_content || '建议采购补充库存'
      return {
        key: `stock-${s.material_id}`,
        kind: 'stock',
        tier,
        categoryLabel: '库存预警',
        typeLabel: s.stock_state === '缺货' ? '库存缺货' : '库存不足',
        name: s.material_name || '农资',
        timeMs: t,
        timeDisplay: formatAlertTime(s.sort_time),
        statusLabel: hs,
        tagLevel: tier === 'critical' ? '严重' : '普通',
        tagStatus: s.stock_state === '缺货' ? '缺货' : '库存不足',
        areaCropLine: s.farm_name || '—',
        valueLine: `当前库存：${numeric}（安全库存 ${s.safety_stock_num ?? '—'}）`,
        suggestLine: suggest,
        stock: s
      }
    })

    const cropItems = (warnings || []).map((w) => {
      const meta = getCropLevelMeta(w.warning_level)
      const t = w.exception_time ? new Date(w.exception_time).getTime() : 0
      const hs = w.handle_status || '—'
      const numeric = extractNumericSnippet(w.exception_detail)
      const cropLabel = w.crop_name || w.crop_type || ''
      const areaLabel = w.plant_area || ''
      const farmLabel = w.farm_name || ''
      const areaCrop = [farmLabel, areaLabel, cropLabel].filter(Boolean).join(' · ') || '—'
      const suggest = w.suggest_content || ''
      const isMl = String(w.source_type || '') === 'ml' || w.exception_type === '预测预警'
      const prob =
        w.predicted_prob != null && w.predicted_prob !== ''
          ? Number(w.predicted_prob)
          : null
      const probMeta = isMl ? getProbMeta(prob) : { pct: null, cls: '' }
      return {
        key: `crop-${w.exception_id}`,
        kind: 'crop',
        tier: meta.tier,
        categoryLabel: '作物/设备',
        typeLabel: isMl ? '预测预警' : (w.exception_type || '异常'),
        isMl,
        probPct: probMeta.pct,
        probCls: probMeta.cls,
        name: w.device_name || '设备',
        timeMs: t,
        timeDisplay: formatAlertTime(w.exception_time),
        statusLabel: hs,
        tagLevel: meta.tier === 'critical' ? '严重' : (meta.tier === 'warn' ? '普通' : '提示'),
        tagStatus: hs === '已处理' ? '已处理' : '未处理',
        areaCropLine: areaCrop,
        valueLine: isMl
          ? (Number.isFinite(prob) ? `预测概率：${Math.round(prob * 100)}%` : '')
          : (numeric ? `异常数值：${numeric}` : ''),
        suggestLine: suggest || (isMl ? '建议提前巡检并关注环境趋势' : ''),
        compareLine: isMl
          ? (Number.isFinite(prob) ? `规则预警：未触发；预测预警：已触发（概率 ${Math.round(prob * 100)}%）` : '规则预警：未触发；预测预警：已触发')
          : '规则预警：已触发；预测预警：未触发',
        deviceLine: [w.device_name, w.install_location].filter(Boolean).join(' · '),
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

  const areaOverviewCards = useMemo(() => {
    const byArea = new Map()
    for (const w of warnings || []) {
      const area = w.plant_area || '未分区'
      const item = byArea.get(area) || {
        area,
        farm_name: w.farm_name || '',
        crop: w.crop_name || w.crop_type || '',
        abnormal: false,
        latestTimeMs: 0
      }
      const t = w.exception_time ? new Date(w.exception_time).getTime() : 0
      if (t > item.latestTimeMs) item.latestTimeMs = t
      if ((w.handle_status || '') !== '已处理') item.abnormal = true
      if (!item.crop && (w.crop_name || w.crop_type)) item.crop = w.crop_name || w.crop_type
      if (!item.farm_name && w.farm_name) item.farm_name = w.farm_name
      byArea.set(area, item)
    }
    return Array.from(byArea.values()).sort((a, b) => Number(b.abnormal) - Number(a.abnormal) || b.latestTimeMs - a.latestTimeMs)
  }, [warnings])

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
              <div className="weather-top">
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
                <div className="weather-kpis">
                  <div className="kpi">
                    <div className="kpi-label">当前温度</div>
                    <div className="kpi-value temp">{weather?.temperature != null ? `${Number(weather.temperature).toFixed(1)}℃` : '—'}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">当前湿度</div>
                    <div className="kpi-value hum">{weather?.humidity != null ? `${Number(weather.humidity).toFixed(1)}%` : '—'}</div>
                  </div>
                  <div className="kpi kpi-meta">
                    <div className="kpi-label">天气</div>
                    <div className="kpi-meta-line">{weather?.weather_type ? weather.weather_type : '暂无天气数据'}</div>
                    <div className="kpi-meta-sub">{weather?.monitor_time ? `更新时间：${formatAlertTime(weather.monitor_time)}` : '更新时间：—'}</div>
                  </div>
                </div>
              </div>
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
                  thresholds={[10, 35]}
                />
                <SimpleLineChart
                  title="湿度 (%)"
                  color="#42a5f5"
                  data={weatherHistory}
                  field="humidity"
                  thresholds={[30, 90]}
                />
                <SimpleLineChart
                  title="土壤 pH"
                  color="#66bb6a"
                  data={weatherHistory}
                  field="soil_ph"
                  thresholds={[6.0, 7.5]}
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
                    <div className="stat-category-row">
                      <div className="stat-category">{stat.category || '设备'}</div>
                      <div className="stat-rate">
                        在线率 {stat.total ? Math.round((stat.online / Math.max(stat.total, 1)) * 100) : 0}%
                      </div>
                    </div>
                    <div className="stat-bar">
                      <div
                        className="stat-bar-fill"
                        style={{
                          width: `${stat.total ? Math.round((stat.online / Math.max(stat.total, 1)) * 100) : 0}%`
                        }}
                      />
                    </div>
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
                        库存：<strong className="stock-count-highlight">{stockCount}</strong> 条
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
                        <div className="u-alert-topline">
                          <div className="u-alert-title">
                            <span className="u-alert-type">{row.typeLabel}</span>
                            <span className={`tag tag-level tier-${row.tier}`}>{row.tagLevel}</span>
                            <span className={`tag tag-status ${row.tagStatus === '已处理' ? 'ok' : 'todo'}`}>{row.tagStatus}</span>
                          </div>
                          <div className="u-alert-timebox">
                            <time className="u-alert-time" dateTime={row.timeMs ? new Date(row.timeMs).toISOString() : undefined}>
                              {row.timeDisplay}
                            </time>
                            <span className="u-alert-rel">{formatRelative(row.timeMs)}</span>
                          </div>
                        </div>
                        <div className="u-alert-lines">
                          <div className="u-line main">
                            <span className="u-k">{row.categoryLabel}</span>
                            <span className="u-v">{row.areaCropLine}</span>
                          </div>
                          <div className="u-line compact">
                            <span className="u-k">对象</span>
                            <span className="u-v">{row.name}</span>
                          </div>
                          {row.valueLine ? (
                            <div className="u-line compact">
                              <span className="u-k">数值</span>
                              <span className={`u-v ${row.kind === 'crop' && row.isMl ? row.probCls : ''}`}>{row.valueLine}</span>
                            </div>
                          ) : null}
                          {row.kind === 'crop' && (row.compareLine || row.deviceLine) ? (
                            <div className="u-line compact span-2">
                              <span className="u-k">对比</span>
                              <span className="u-v">{[row.compareLine, row.deviceLine].filter(Boolean).join(' · ')}</span>
                            </div>
                          ) : null}
                          {row.suggestLine ? (
                            <div className="u-line compact span-2">
                              <span className="u-k">建议</span>
                              <span className="u-v">{row.suggestLine}</span>
                            </div>
                          ) : null}
                        </div>
                        {row.kind === 'crop' && row.detail ? <p className="u-alert-detail">说明：{row.detail}</p> : null}
                        {row.kind === 'crop' && row.unread ? <span className="u-alert-unread">未读</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              )
            })()}
            {warnListFetching ? <div className="loading-more">加载中...</div> : null}
            {!hasMoreWarnings && warnings.length > 0 ? <div className="no-more">没有更多数据了</div> : null}
          </div>
        </div>

        {/* 通用视频模块 */}
        <div className="homepage-card video-card">
          <div className="card-header">
            <h3>📹 通用视频</h3>
          </div>
          <div className="card-content">
            {videosQueryError ? (
              <div className="empty-state">
                视频列表加载失败。请确认已执行数据库迁移（含 <code>video_device</code> 表）且后端正常。
              </div>
            ) : videos.length > 0 ? (
              <div className="video-list">
                {videos.map((video) => (
                  <div key={video.id} className="video-item">
                    <div className="video-wrapper">
                      {video.video_status === 1 ? (
                        <HomeVideoPlayer url={video.video_url} className="video-player" />
                      ) : (
                        <div className="video-placeholder">
                          <span>无信号</span>
                        </div>
                      )}
                    </div>
                    <div className="video-info">
                      <div className="video-name-row">
                        <div className="video-name">{video.device_name}</div>
                        <span className={`tag ${video.video_status === 1 ? 'ok' : 'todo'}`}>
                          {video.video_status === 1 ? '在线' : '离线'}
                        </span>
                      </div>
                      <div className="video-location">{video.install_location}</div>
                      <div className="video-meta">
                        <span>最近数据更新时间：—</span>
                        <span className="video-farm">{video.farm_name || ''}</span>
                      </div>
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
            <h3>🧩 农场区域可视化</h3>
          </div>
          <div className="card-content">
            {areaOverviewCards.length > 0 ? (
              <div className="area-grid">
                {areaOverviewCards.map((a) => (
                  <button
                    key={a.area}
                    type="button"
                    className={`area-card ${a.abnormal ? 'bad' : 'good'}`}
                    onClick={() => navigate('/warning/exception')}
                    title="点击查看异常详情"
                  >
                    <div className="area-top">
                      <div className="area-name">{a.area}</div>
                      <span className={`tag ${a.abnormal ? 'todo' : 'ok'}`}>{a.abnormal ? '异常' : '正常'}</span>
                    </div>
                    <div className="area-line">作物：{a.crop || '—'}</div>
                    <div className="area-line dim">{a.farm_name ? `农场：${a.farm_name}` : ''}</div>
                    <div className="area-line dim">最近异常：{a.latestTimeMs ? formatAlertTime(a.latestTimeMs) : '—'}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                暂无区域数据（将根据预警中的“区域/作物”信息自动生成）
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 简易折线图组件（SVG 实现，避免引入大型图表库）
const SimpleLineChart = ({ title, color, data, field, thresholds = [] }) => {
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
  const avg = values.reduce((a, b) => a + b, 0) / values.length

  const yOf = (v) => 100 - ((v - min) / range) * 80 - 10

  const points = data
    .map((d, index) => {
      const v =
        d[field] !== null && d[field] !== undefined ? Number(d[field]) : null
      if (v === null) return null
      const x = (index / Math.max(data.length - 1, 1)) * 100
      const y = yOf(v) // 留上下边距
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')

  return (
    <div className="simple-chart">
      <div className="simple-chart-title">
        {title}
        <span className="simple-chart-badges">
          <span className="badge">均值 {Number.isFinite(avg) ? avg.toFixed(1) : '—'}</span>
        </span>
      </div>
      <svg viewBox="0 0 100 100" className="simple-chart-svg">
        {/* 阈值线 */}
        {thresholds
          .filter((v) => v != null && Number.isFinite(Number(v)))
          .slice(0, 4)
          .map((v) => {
            const y = yOf(Number(v))
            return (
              <g key={`th-${v}`}>
                <line x1="0" y1={y} x2="100" y2={y} className="chart-ref ref-th" />
              </g>
            )
          })}
        {/* 平均值线 */}
        {Number.isFinite(avg) ? <line x1="0" y1={yOf(avg)} x2="100" y2={yOf(avg)} className="chart-ref ref-avg" /> : null}
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

