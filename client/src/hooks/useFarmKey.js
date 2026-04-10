import { useAuth } from '../context/AuthContext'

/**
 * 与后端 getScopedFarmId 对齐：管理员未选农场为「全部」→ 'all'；否则为当前 farm_id 字符串。
 * 非管理员固定为所属农场。
 */
export function useFarmKey () {
  const { user, currentFarmId } = useAuth()
  if (!user) return ''
  if (user.role_id === 1) {
    return currentFarmId ? String(currentFarmId) : 'all'
  }
  return user.farm_id != null && String(user.farm_id).trim() !== ''
    ? String(user.farm_id)
    : ''
}
