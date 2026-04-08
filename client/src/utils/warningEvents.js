/** 作物/环境异常或设备变更后派发，供首页预警列表刷新 */
export const WARNING_CHANGED_EVENT = 'app:warning-changed'

export function notifyWarningChanged() {
  window.dispatchEvent(new Event(WARNING_CHANGED_EVENT))
}
