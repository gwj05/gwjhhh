import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import globalFarmReducer from './slices/globalFarmSlice'
import { api } from './services/api'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    globalFarm: globalFarmReducer,
    [api.reducerPath]: api.reducer
  },
  middleware: (getDefault) => getDefault().concat(api.middleware)
})

