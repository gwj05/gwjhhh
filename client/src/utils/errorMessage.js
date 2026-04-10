export function getErrorMessage(err, fallback = '操作失败，请稍后重试') {
  if (!err) return fallback

  // axios error shape
  const status = err.response?.status
  const data = err.response?.data
  const messageFromServer =
    (typeof data === 'string' ? data : null) ||
    (data && typeof data.message === 'string' ? data.message : null) ||
    (data && typeof data.error === 'string' ? data.error : null)

  if (messageFromServer) return messageFromServer

  // network / timeout
  if (err.code === 'ECONNABORTED') return '请求超时，请稍后重试'
  if (err.message === 'Network Error') return '网络异常，请检查网络或服务是否可用'

  if (status === 403) return '无权限或登录已过期，请重新登录'
  if (status === 401) return '未登录或登录已过期，请重新登录'
  if (status >= 500) return '服务器繁忙，请稍后重试'

  return fallback
}

