import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './OverviewPage.css'
import { useFarmKey } from '../hooks/useFarmKey'
import {
  useGetOverviewAdvancedQuery,
  useLazyGetWarningListQuery,
  useSwitchOverviewIrrigationStrategyMutation,
  useCreateOverviewPurchaseDraftMutation
} from '../store/services/api'

/**
 * 系统概览页（/overview）
 * 当前先复用现有“系统首页”的驾驶舱内容，确保路由恢复可用。
 * 后续如果你希望“系统首页”只保留基础视图，我再把概览页内容从 HomePage 拆出来独立维护。
 */
const OverviewPage = () => {
  const navigate = useNavigate()
  const farmKey = useFarmKey()
  const skip = !farmKey
  const { data, isFetching, refetch } = useGetOverviewAdvancedQuery(farmKey, { skip })
  const [switchIrrigation, { isLoading: switchingIrrigation }] = useSwitchOverviewIrrigationStrategyMutation()
  const [createDraft, { isLoading: creatingDraft }] = useCreateOverviewPurchaseDraftMutation()
  const [triggerWarn] = useLazyGetWarningListQuery()
  const [mlWarnings, setMlWarnings] = useState([])
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!farmKey) return
    triggerWarn({ farmKey, page: 1, pageSize: 40 })
      .unwrap()
      .then((res) => {
        const all = res?.data || []
        const ml = all.filter((w) => String(w.source_type || '') === 'ml' || w.exception_type === '预测预警')
        setMlWarnings(ml)
      })
      .catch(() => setMlWarnings([]))
  }, [farmKey, triggerWarn])

  const lastUpdated = useMemo(() => {
    const t = data?.meta?.generated_at
    if (!t) return '—'
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
  }, [data?.meta?.generated_at])

  const pest = data?.pest_risk
  const soil = data?.soil_forecast
  const stock = data?.stock_warnings || { total: 0, low_count: 0, out_count: 0, items: [], recommend_purchase: [] }
  const allRecoHandled = useMemo(() => {
    const arr = stock?.recommend_purchase || []
    if (!arr.length) return false
    return arr.every((r) => !!r.handled)
  }, [stock?.recommend_purchase])
  const growth = data?.growth_progress || { tavg: null, base_temp: 10, rows: [] }
  const irrigation = data?.irrigation_summary
  const plotCompare = data?.plot_compare || []
  const historyCompare = data?.history_compare

  const riskSummary = useMemo(() => {
    const byArea = new Map()
    let sum = 0
    let cnt = 0
    for (const w of mlWarnings || []) {
      const p = Number(w.predicted_prob)
      if (!Number.isFinite(p)) continue
      sum += p
      cnt += 1
      const area = w.plant_area || '未分区'
      const cur = byArea.get(area) || { area, sum: 0, cnt: 0 }
      cur.sum += p
      cur.cnt += 1
      byArea.set(area, cur)
    }
    const avg = cnt ? Math.round((sum / cnt) * 100) : null
    const level = avg == null ? '—' : avg >= 70 ? '高' : avg >= 40 ? '中' : '低'
    const cls = avg == null ? '' : avg >= 70 ? 'risk-high' : avg >= 40 ? 'risk-mid' : 'risk-low'
    const areas = Array.from(byArea.values())
      .map((a) => ({ area: a.area, avg: Math.round((a.sum / Math.max(a.cnt, 1)) * 100) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10)
    return { avgPct: avg, level, cls, areas }
  }, [mlWarnings])

  return (
    <div className="overview-page">
      <div className="overview-title">
        <h2>智能预测</h2>
        <p>
          聚合预测与决策辅助模块（与“系统首页”区分）。
          <span className="overview-meta">最后更新时间：{lastUpdated}</span>
        </p>
      </div>

      {!online ? (
        <div className="overview-offline-banner">
          当前网络不可用，展示的是最近一次缓存数据（最后更新时间：{lastUpdated}）。
        </div>
      ) : null}

      <div className="overview-actions">
        <button type="button" className="overview-btn" onClick={() => refetch()} disabled={isFetching || skip}>
          {isFetching ? '刷新中…' : '刷新数据'}
        </button>
      </div>

      <div className="overview-grid">
        <div className="overview-col">
          <section className="overview-card card-md">
            <header className="overview-card-header">
              <h3>🦟 病虫害风险预警（规则）</h3>
            </header>
            <div className="overview-card-body">
              <div className="overview-kpi-row">
                <div className="mini-kpi"><span>风险指数</span><strong>{pest?.risk_index ?? 0}</strong></div>
                <div className="mini-kpi"><span>风险等级</span><strong className={pest?.risk_level === '高' ? 'kpi-danger' : ''}>{pest?.risk_level || '低'}</strong></div>
              </div>
              <div className="overview-note">
                防治窗口：{pest?.suggest_window || '暂无建议'}；建议：{pest?.suggest_action || '请补充监测数据后评估'}
              </div>
              <div className="overview-empty">
                温度 {pest?.latest?.temperature ?? '—'}℃ · 湿度 {pest?.latest?.humidity ?? '—'}% · 降雨 {pest?.latest?.rainfall ?? '—'}mm · 置信度 {pest?.confidence || '低'}
              </div>
              {pest?.explain ? (
                <details className="overview-explain">
                  <summary>查看依据</summary>
                  <div className="explain-body">
                    <div>触发因子：{(pest.explain.factors || []).join(' · ') || '—'}</div>
                    <div>阈值规则：{(pest.explain.thresholds || []).join(' · ') || '—'}</div>
                    <div>置信度来源：{(pest.explain.confidence_source || []).join(' · ') || '—'}</div>
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          <section className="overview-card card-md">
            <header className="overview-card-header">
              <h3>💧 土壤墒情预测（48h 外推）</h3>
            </header>
            <div className="overview-card-body">
              <div className="overview-kpi-row">
                <div className="mini-kpi"><span>当前湿度</span><strong>{soil?.current_soil_moisture ?? '—'}%</strong></div>
                <div className="mini-kpi"><span>建议</span><strong className={soil?.recommendation === '建议立即灌溉' ? 'kpi-danger' : ''}>{soil?.recommendation || '数据不足'}</strong></div>
              </div>
              <div className="overview-empty">建议灌溉量：{soil?.irrigation_mm ?? 0} mm · 置信度：{soil?.confidence || '低'}</div>
              <div className="overview-note">{soil?.advice || '请补充环境数据后再评估'}</div>
              {soil?.explain ? (
                <details className="overview-explain">
                  <summary>查看依据</summary>
                  <div className="explain-body">
                    <div>输入因子：{(soil.explain.factors || []).join(' · ') || '—'}</div>
                    <div>阈值规则：{(soil.explain.thresholds || []).join(' · ') || '—'}</div>
                    <div>置信度来源：{(soil.explain.confidence_source || []).join(' · ') || '—'}</div>
                  </div>
                </details>
              ) : null}
            </div>
          </section>

          <section className="overview-card card-md">
            <header className="overview-card-header">
              <h3>🚿 灌溉策略摘要面板</h3>
            </header>
            <div className="overview-card-body">
              <div className="overview-kpi-row">
                <div className="mini-kpi"><span>当前策略</span><strong>{irrigation?.current_strategy?.strategy_name || '—'}</strong></div>
                <div className="mini-kpi"><span>预计用水量</span><strong>{irrigation?.estimated_water_l ?? 0} L</strong></div>
              </div>
              <div className="overview-note">
                下一次预计灌溉：{irrigation?.next_run_time ? new Date(irrigation.next_run_time).toLocaleString() : '—'}
              </div>
              <div className="overview-empty">
                核心参数：间隔 {irrigation?.current_strategy?.interval_hours ?? '—'}h ·
                时长 {irrigation?.current_strategy?.duration_minutes ?? '—'}min ·
                目标墒情 {irrigation?.current_strategy?.target_moisture ?? '—'}%
              </div>
              {irrigation?.explain ? (
                <details className="overview-explain">
                  <summary>查看依据</summary>
                  <div className="explain-body">
                    <div>策略要点：{(irrigation.explain.factors || []).join(' · ') || '—'}</div>
                    <div>策略集合：{(irrigation.explain.thresholds || []).join(' · ') || '—'}</div>
                    <div>置信度来源：{(irrigation.explain.confidence_source || []).join(' · ') || '—'}</div>
                  </div>
                </details>
              ) : null}
              <div className="overview-card-actions">
                {(irrigation?.presets || []).map((p) => (
                  <button
                    key={p.strategy_key}
                    type="button"
                    className={`overview-btn ${irrigation?.current_strategy?.strategy_key === p.strategy_key ? 'primary' : ''}`}
                    disabled={switchingIrrigation}
                    onClick={() => switchIrrigation({ farmKey, strategy_key: p.strategy_key })}
                  >
                    {p.strategy_name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="overview-card card-md">
            <header className="overview-card-header">
              <h3>
                🕰️ 历史同期对照（温湿度）
                {historyCompare?.last_year_estimated ? <span className="badge-est">估算</span> : null}
              </h3>
            </header>
            <div className="overview-card-body">
              <div className="overview-kpi-row">
                <div className="mini-kpi">
                  <span>温度偏差（较去年）</span>
                  <strong>{historyCompare?.temp_delta == null ? '—' : `${historyCompare.temp_delta > 0 ? '+' : ''}${historyCompare.temp_delta}℃`}</strong>
                </div>
                <div className="mini-kpi">
                  <span>湿度偏差（较去年）</span>
                  <strong>{historyCompare?.hum_delta == null ? '—' : `${historyCompare.hum_delta > 0 ? '+' : ''}${historyCompare.hum_delta}%`}</strong>
                </div>
              </div>
              <div className="overview-empty">
                当前均值：温度 {historyCompare?.temp_now_avg ?? '—'}℃ / 湿度 {historyCompare?.hum_now_avg ?? '—'}%
              </div>
              <div className="overview-empty">
                去年同期：温度 {historyCompare?.temp_last_year_avg ?? '—'}℃ / 湿度 {historyCompare?.hum_last_year_avg ?? '—'}%
              </div>
              {(historyCompare?.hints || []).length ? (
                <div className="overview-list">
                  {historyCompare.hints.slice(0, 6).map((h, idx) => (
                    <div key={`hint-${idx}`} className="overview-list-row">
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overview-empty">暂无对照提示</div>
              )}
            </div>
          </section>

          <section className="overview-card card-md">
            <header className="overview-card-header">
              <h3>📡 离线缓存提示</h3>
            </header>
            <div className="overview-card-body">
              <div className="overview-empty">
                网络状态：{online ? '在线' : '离线'} · 最后更新时间：{lastUpdated}
              </div>
              <div className="overview-note">
                离线时页面将保留最近一次数据；恢复网络后可点击“刷新数据”立即更新。
              </div>
            </div>
          </section>
        </div>

        <div className="overview-col">
          <section className="overview-card card-lg">
          <header className="overview-card-header">
            <h3>🧠 风险预测（ML）</h3>
          </header>
          <div className="overview-card-body scroll-body">
            <div className="overview-kpi-row">
              <div className="mini-kpi"><span>整体风险等级</span><strong className={riskSummary.cls}>{riskSummary.level}</strong></div>
              <div className="mini-kpi"><span>平均预测概率</span><strong className={riskSummary.cls}>{riskSummary.avgPct == null ? '—' : `${riskSummary.avgPct}%`}</strong></div>
            </div>
            {riskSummary.areas.length ? (
              <div className="overview-list">
                {riskSummary.areas.map((a) => (
                  <div key={a.area} className="overview-list-row">
                    <span>{a.area}</span>
                    <strong className={a.avg >= 70 ? 'risk-high' : a.avg >= 40 ? 'risk-mid' : 'risk-low'}>{a.avg}%</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overview-empty">暂无预测数据</div>
            )}
            <div className="overview-empty">概率阈值：≥70% 高风险 / 40~70% 中风险 / &lt;40% 低风险</div>
          </div>
        </section>
          <section className="overview-card card-lg">
          <header className="overview-card-header">
            <h3>🌱 作物生长模型进度条（积温）</h3>
          </header>
          <div className="overview-card-body scroll-body">
            <div className="overview-empty">
              近 7 天平均温度：{growth.tavg == null ? '—' : `${growth.tavg}℃`}（基温 {growth.base_temp}℃）
            </div>
            {growth.rows?.length ? (
              <div className="growth-list">
                {growth.rows.map((g) => (
                  <div key={g.crop_id} className={`growth-item ${g.behind ? 'behind' : ''}`}>
                    <div className="growth-top">
                      <div className="growth-name">{g.crop_name || '作物'}</div>
                      <div className="growth-meta">{g.farm_name} · {g.plant_area || '未分区'}</div>
                    </div>
                    <div className="growth-progress-row">
                      <span className="label">积温进度</span>
                      <div className="bar">
                        <div className="fill gdd" style={{ width: `${Math.max(2, Math.min(100, g.gdd_progress || 0))}%` }} />
                      </div>
                      <span className="value">{g.gdd_progress}%</span>
                    </div>
                    <div className="growth-progress-row">
                      <span className="label">日历进度</span>
                      <div className="bar">
                        <div className="fill cal" style={{ width: `${Math.max(2, Math.min(100, g.calendar_progress || 0))}%` }} />
                      </div>
                      <span className="value">{g.calendar_progress}%</span>
                    </div>
                    <div className="growth-foot">
                      累计积温 {g.gdd_current} / 目标 {g.gdd_target}（差值 {g.gdd_gap}）
                      {g.behind ? <span className="warn"> 进度落后</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overview-empty">暂无作物生长数据</div>
            )}
          </div>
        </section>

          <section className="overview-card card-md">
          <header className="overview-card-header">
            <h3>🧭 多地块横向对比快照</h3>
          </header>
          <div className="overview-card-body">
            {plotCompare.length ? (
              <div className="overview-list">
                {plotCompare.map((r, idx) => (
                  <div key={`${r.farm_name}-${r.area}-${idx}`} className="overview-list-row">
                    <span>{r.farm_name} · {r.area}</span>
                    <strong>长势 {r.vigor_score} · 未处理异常 {r.open_exc_cnt}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overview-empty">暂无地块对比数据</div>
            )}
          </div>
        </section>

          <section className="overview-card card-lg">
          <header className="overview-card-header">
            <h3>🧪 农资库存预警（常驻）</h3>
          </header>
          <div className="overview-card-body scroll-body">
            <div className="overview-stock-summary">
              农资库存预警：共 {stock.total} 项（缺货 {stock.out_count || 0}，不足 {stock.low_count || 0}）
            </div>
            {(stock.recommend_purchase || []).length ? (
              <div className="overview-reco">
                <div className="overview-reco-title">推荐采购</div>
                <div className="overview-reco-list">
                  {stock.recommend_purchase.slice(0, 5).map((r) => (
                    <div key={r.material_id} className="overview-reco-item">
                      <span className="name">{r.material_name}</span>
                      <span className={`tag ${r.stock_state === '缺货' ? 'danger' : 'warn'}`}>{r.stock_state}</span>
                      {r.handled ? <span className="tag ok">已生成草稿</span> : null}
                      <span className="qty">× {r.suggest_qty}</span>
                    </div>
                  ))}
                </div>
                <div className="overview-empty">依据：缺货优先，建议量=安全库存−当前库存（至少 1）。</div>
                <div className="overview-card-actions">
                  <button
                    type="button"
                    className="overview-btn primary"
                    disabled={creatingDraft || allRecoHandled}
                    onClick={() =>
                      createDraft({
                        items: stock.recommend_purchase.slice(0, 5).map((r) => ({
                          material_id: r.material_id,
                          purchase_qty: r.suggest_qty
                        })),
                        supplier: null
                      })
                        .unwrap()
                        .then(() => navigate('/material/purchase'))
                        .catch(() => {})
                    }
                  >
                    {allRecoHandled ? '已生成草稿' : (creatingDraft ? '生成中…' : '一键生成采购草稿')}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="overview-kpi-row">
              <div className="mini-kpi"><span>缺货项</span><strong className={(stock.out_count || 0) > 0 ? 'kpi-danger' : ''}>{stock.out_count || 0}</strong></div>
              <div className="mini-kpi"><span>低库存项</span><strong>{stock.low_count || 0}</strong></div>
            </div>
            {stock.items?.length ? (
              <div className="overview-list">
                {stock.items.map((it) => (
                  <div key={it.material_id} className="overview-list-row">
                    <span>{it.material_name}（{it.farm_name || '—'}）</span>
                    <strong className={it.stock_state === '缺货' ? 'kpi-danger' : ''}>
                      {it.stock_state} · {it.stock_num}/{it.safety_stock_num}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overview-empty">暂无库存预警</div>
            )}
            <div className="overview-card-actions">
              <button type="button" className="overview-btn primary" onClick={() => navigate('/material/purchase')}>
                一键去采购页
              </button>
              <button type="button" className="overview-btn" onClick={() => navigate('/material/warning')}>
                查看库存预警
              </button>
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

export default OverviewPage

