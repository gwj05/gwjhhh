import axios from 'axios'
import { GLOBAL_FARM_STORAGE_KEY } from './globalFarm'

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
    if (farmId) {
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
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

