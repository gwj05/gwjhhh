import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { GLOBAL_FARM_STORAGE_KEY } from '../utils/globalFarm'

/**
 * 与 axios 拦截器一致：已登录且 localStorage 有全局 farm_id 时，为 GET 请求合并 farm_id。
 * 显式传入的 params.farm_id 非空时不再覆盖（管理员选中具体农场）。
 * 未登录不传。
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers) => {
    try {
      const token = localStorage.getItem('token')
      if (token) headers.set('Authorization', `Bearer ${token}`)
    } catch {}
    return headers
  }
})

function shouldInjectFarmId (params) {
  const farmId = localStorage.getItem(GLOBAL_FARM_STORAGE_KEY)
  if (!farmId) return false
  if (!params || typeof params !== 'object') return true
  if (!Object.prototype.hasOwnProperty.call(params, 'farm_id')) return true
  const v = params.farm_id
  if (v === undefined || v === null) return true
  if (String(v).trim() === '') return true
  return false
}

function mergeFarmParams (params) {
  const farmId = localStorage.getItem(GLOBAL_FARM_STORAGE_KEY)
  if (!farmId) return params
  return { ...(params || {}), farm_id: farmId }
}

export const baseQueryWithFarm = async (args, api, extraOptions) => {
  if (typeof args === 'string') {
    return rawBaseQuery(args, api, extraOptions)
  }
  const next = { ...args }
  const method = (next.method || 'GET').toUpperCase()
  if (method === 'GET' || !next.method) {
    if (shouldInjectFarmId(next.params)) {
      next.params = mergeFarmParams(next.params)
    }
  }
  return rawBaseQuery(next, api, extraOptions)
}
