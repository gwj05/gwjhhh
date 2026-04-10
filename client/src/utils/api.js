import axios from 'axios'
import { GLOBAL_FARM_NAME_STORAGE_KEY, GLOBAL_FARM_STORAGE_KEY } from './globalFarm'
import { getErrorMessage } from './errorMessage'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器：添加token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // 全局农场过滤：若已有 farm_id 则尊重页面显式传参，否则默认带上当前全局农场
    const farmId = localStorage.getItem(GLOBAL_FARM_STORAGE_KEY)
    // 仅在已登录态下自动注入全局 farm_id，避免登录/注册类请求被污染
    if (token && farmId) {
      const hasFarmParam =
        config.params &&
        Object.prototype.hasOwnProperty.call(config.params, 'farm_id') &&
        config.params.farm_id !== undefined &&
        config.params.farm_id !== null &&
        String(config.params.farm_id) !== ''
      if (!hasFarmParam) {
        config.params = { ...(config.params || {}), farm_id: farmId }
      }
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器：处理错误
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    const msg = getErrorMessage(error, '')
    // 兼容后端把 token 无效/过期返回 403 的情况
    const isAuthExpired =
      status === 401 ||
      (status === 403 && typeof msg === 'string' && (msg.includes('token') || msg.includes('过期') || msg.includes('未授权')))

    if (isAuthExpired) {
      localStorage.removeItem('token')
      localStorage.removeItem(GLOBAL_FARM_STORAGE_KEY)
      localStorage.removeItem(GLOBAL_FARM_NAME_STORAGE_KEY)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

