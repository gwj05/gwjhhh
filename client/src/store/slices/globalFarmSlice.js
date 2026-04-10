import { createSlice } from '@reduxjs/toolkit'

const STORAGE_FARM_ID = 'global_farm_id'
const STORAGE_FARM_NAME = 'global_farm_name'

function loadInitial() {
  try {
    return {
      currentFarmId: localStorage.getItem(STORAGE_FARM_ID) || '',
      currentFarmName: localStorage.getItem(STORAGE_FARM_NAME) || ''
    }
  } catch {
    return { currentFarmId: '', currentFarmName: '' }
  }
}

const globalFarmSlice = createSlice({
  name: 'globalFarm',
  initialState: loadInitial(),
  reducers: {
    setGlobalFarm(state, action) {
      const { farmId, farmName } = action.payload || {}
      state.currentFarmId = farmId ? String(farmId) : ''
      state.currentFarmName = farmName ? String(farmName) : ''
      try {
        if (farmId) localStorage.setItem(STORAGE_FARM_ID, String(farmId))
        else localStorage.removeItem(STORAGE_FARM_ID)
        if (farmName) localStorage.setItem(STORAGE_FARM_NAME, String(farmName))
        else localStorage.removeItem(STORAGE_FARM_NAME)
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('app:global-farm-changed', { detail: { farmId, farmName } }))
      } catch {}
    },
    clearGlobalFarm(state) {
      state.currentFarmId = ''
      state.currentFarmName = ''
      try {
        localStorage.removeItem(STORAGE_FARM_ID)
        localStorage.removeItem(STORAGE_FARM_NAME)
      } catch {}
    }
  }
})

export const { setGlobalFarm, clearGlobalFarm } = globalFarmSlice.actions
export default globalFarmSlice.reducer

