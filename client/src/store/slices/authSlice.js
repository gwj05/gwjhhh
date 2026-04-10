import { createSlice } from '@reduxjs/toolkit'

const STORAGE_USER = 'user'
const STORAGE_TOKEN = 'token'

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_USER)
    const token = localStorage.getItem(STORAGE_TOKEN)
    return { user: raw ? JSON.parse(raw) : null, token: token || null }
  } catch {
    return { user: null, token: null }
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitial(),
  reducers: {
    setAuth(state, action) {
      const { user, token } = action.payload || {}
      state.user = user || null
      state.token = token || null
      try {
        if (user) localStorage.setItem(STORAGE_USER, JSON.stringify(user))
        else localStorage.removeItem(STORAGE_USER)
        if (token) localStorage.setItem(STORAGE_TOKEN, token)
        else localStorage.removeItem(STORAGE_TOKEN)
      } catch {}
    },
    clearAuth(state) {
      state.user = null
      state.token = null
      try {
        localStorage.removeItem(STORAGE_USER)
        localStorage.removeItem(STORAGE_TOKEN)
      } catch {}
    }
  }
})

export const { setAuth, clearAuth } = authSlice.actions
export default authSlice.reducer

