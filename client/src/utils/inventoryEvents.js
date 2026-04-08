/** 入库/出库等变更后派发，供首页预警、侧栏角标刷新 */
export const INVENTORY_CHANGED_EVENT = 'app:inventory-changed'

export function notifyInventoryChanged() {
  window.dispatchEvent(new Event(INVENTORY_CHANGED_EVENT))
}
