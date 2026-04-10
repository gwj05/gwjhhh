function getScopedFarmId(user, queryFarmId) {
  if (user?.role_id === 1) {
    if (queryFarmId == null || String(queryFarmId).trim() === '') return null
    // 与前端「全部农场」对齐；避免 localStorage 残留 farm_id 时误把字符串 'all' 当数字筛进空结果
    if (String(queryFarmId).trim().toLowerCase() === 'all') return null
    return String(queryFarmId)
  }
  if (user?.farm_id == null || String(user.farm_id).trim() === '') return null
  return String(user.farm_id)
}

function isNoFarmForNonAdmin(user, scopedFarmId) {
  return user?.role_id !== 1 && !scopedFarmId
}

function assertFarmAccess(user, farmId) {
  if (user?.role_id === 1) return
  if (!user?.farm_id || String(user.farm_id) !== String(farmId)) {
    const e = new Error('无权操作该农场')
    e.status = 403
    throw e
  }
}

module.exports = {
  getScopedFarmId,
  isNoFarmForNonAdmin,
  assertFarmAccess
}
