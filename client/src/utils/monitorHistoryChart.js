/**
 * 历史环境折线图：按查询范围决定 X 轴粒度、聚合桶与格式化
 */

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** @returns {{ fromMs: number, toMs: number, spanDays: number, sameCalendarDay: boolean }} */
export function parseHistoryRange(fromYmd, toYmd) {
  const sameCalendarDay = fromYmd === toYmd
  const fromMs = new Date(`${fromYmd}T00:00:00`).getTime()
  const toMs = new Date(`${toYmd}T23:59:59`).getTime()
  const d0 = new Date(`${fromYmd}T12:00:00`).getTime()
  const d1 = new Date(`${toYmd}T12:00:00`).getTime()
  const spanDays = Math.max(1, Math.floor((d1 - d0) / 86400000) + 1)
  return { fromMs, toMs, spanDays, sameCalendarDay }
}

/**
 * axisMode: 'hm' | 'md' | 'ym'
 * bucket: 'hour' | 'day' | 'month'
 */
export function getChartGranularity(fromYmd, toYmd) {
  const { sameCalendarDay, spanDays } = parseHistoryRange(fromYmd, toYmd)
  if (sameCalendarDay) {
    return { axisMode: 'hm', bucket: 'hour', label: '当天（按小时均值）' }
  }
  if (spanDays >= 30) {
    return { axisMode: 'ym', bucket: 'month', label: '按月均值' }
  }
  return { axisMode: 'md', bucket: 'day', label: '按天均值' }
}

function bucketStart(ts, bucket) {
  const d = new Date(ts)
  if (bucket === 'hour') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0).getTime()
  }
  if (bucket === 'day') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
  }
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime()
}

function avg(arr) {
  if (!arr.length) return null
  const s = arr.reduce((a, b) => a + b, 0)
  return s / arr.length
}

/**
 * 按桶聚合，返回每个桶一条记录（均值）
 */
export function aggregateHistoryRows(rows, bucket) {
  const map = new Map()
  for (const r of rows) {
    if (!r.monitor_time) continue
    const ts = new Date(r.monitor_time).getTime()
    if (Number.isNaN(ts)) continue
    const k = bucketStart(ts, bucket)
    let o = map.get(k)
    if (!o) {
      o = { temperature: [], humidity: [], soil_moisture: [], light_lux: [] }
      map.set(k, o)
    }
    if (r.temperature != null && r.temperature !== '') o.temperature.push(Number(r.temperature))
    if (r.humidity != null && r.humidity !== '') o.humidity.push(Number(r.humidity))
    if (r.soil_moisture != null && r.soil_moisture !== '') o.soil_moisture.push(Number(r.soil_moisture))
    if (r.light_lux != null && r.light_lux !== '') o.light_lux.push(Number(r.light_lux))
  }
  const keys = [...map.keys()].sort((a, b) => a - b)
  return keys.map((k) => {
    const o = map.get(k)
    return {
      ts: k,
      temperature: avg(o.temperature),
      humidity: avg(o.humidity),
      soil_moisture: avg(o.soil_moisture),
      light_lux: avg(o.light_lux)
    }
  })
}

/** X 轴刻度文字 */
export function formatAxisLabel(ts, axisMode) {
  const d = new Date(ts)
  if (axisMode === 'hm') {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  if (axisMode === 'md') {
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** Tooltip 完整时间 */
export function formatFullDateTime(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function formatSeriesValue(name, v) {
  if (v == null || Number.isNaN(v)) return '—'
  if (name.includes('光照')) return Number(v).toFixed(0)
  return Number(v).toFixed(1)
}
