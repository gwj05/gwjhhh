export const GLOBAL_FARM_STORAGE_KEY = 'global_farm_id'
export const GLOBAL_FARM_NAME_STORAGE_KEY = 'global_farm_name'
export const GLOBAL_FARM_CHANGED_EVENT = 'app:global-farm-changed'

export function getStoredGlobalFarmId() {
  return localStorage.getItem(GLOBAL_FARM_STORAGE_KEY) || ''
}

export function getStoredGlobalFarmName() {
  return localStorage.getItem(GLOBAL_FARM_NAME_STORAGE_KEY) || ''
}

export function setStoredGlobalFarm(farmId, farmName = '') {
  const idStr = farmId == null || farmId === '' ? '' : String(farmId)
  if (!idStr) {
    clearStoredGlobalFarm()
    return
  }
  localStorage.setItem(GLOBAL_FARM_STORAGE_KEY, idStr)
  if (farmName) localStorage.setItem(GLOBAL_FARM_NAME_STORAGE_KEY, farmName)
  window.dispatchEvent(
    new CustomEvent(GLOBAL_FARM_CHANGED_EVENT, {
      detail: { farm_id: idStr, farm_name: farmName || '' }
    })
  )
}

export function clearStoredGlobalFarm() {
  localStorage.removeItem(GLOBAL_FARM_STORAGE_KEY)
  localStorage.removeItem(GLOBAL_FARM_NAME_STORAGE_KEY)
  window.dispatchEvent(
    new CustomEvent(GLOBAL_FARM_CHANGED_EVENT, {
      detail: { farm_id: '', farm_name: '' }
    })
  )
}
