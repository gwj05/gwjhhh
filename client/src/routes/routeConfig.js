// 单一真相源：路由元信息（用于 Sidebar 菜单与 TopBar 面包屑）

export const routeConfig = [
  { key: 'home', title: '首页', icon: '🏠', path: '/home', roles: [1, 2, 3] },
  { key: 'homepage', title: '系统首页', icon: '📊', path: '/homepage', roles: [1, 2, 3] },
  { key: 'overview', title: '系统概览', icon: '📊', path: '/overview', roles: [1, 2] },
  {
    key: 'farm',
    title: '农场管理',
    icon: '🏢',
    roles: [1, 2],
    children: [
      { key: 'farm-list', title: '农场列表', path: '/farm/list', roles: [1, 2], breadcrumbs: ['农场管理', '农场列表'] },
      { key: 'farm-detail', title: '农场详情', path: '/farm/detail', roles: [1, 2], breadcrumbs: ['农场管理', '农场详情'] },
      { key: 'farm-manager', title: '负责人管理', path: '/farm/manager', roles: [1, 2], breadcrumbs: ['农场管理', '负责人管理'] }
    ]
  },
  {
    key: 'crop',
    title: '作物管理',
    icon: '🌾',
    roles: [1, 2, 3],
    children: [
      { key: 'crop-list', title: '作物列表', path: '/crop/list', roles: [1, 2, 3], breadcrumbs: ['作物管理', '作物列表'] },
      { key: 'crop-area', title: '种植区域管理', path: '/crop/area', roles: [1, 2, 3], breadcrumbs: ['作物管理', '种植区域管理'] },
      { key: 'crop-cycle', title: '生长周期记录', path: '/crop/cycle', roles: [1, 2, 3], breadcrumbs: ['作物管理', '生长周期记录'] }
    ]
  },
  {
    key: 'material',
    title: '农资管理',
    icon: '📦',
    roles: [1, 2, 3],
    children: [
      { key: 'material-list', title: '农资列表', path: '/material/list', roles: [1, 2, 3], breadcrumbs: ['农资管理', '农资列表'] },
      { key: 'material-warning', title: '库存预警', path: '/material/warning', roles: [1, 2, 3], breadcrumbs: ['农资管理', '库存预警'] },
      { key: 'material-stock-flow', title: '库存流水', path: '/material/stock-flow', roles: [1, 2, 3], breadcrumbs: ['农资管理', '库存流水'] },
      { key: 'material-purchase', title: '采购记录', path: '/material/purchase', roles: [1, 2], breadcrumbs: ['农资管理', '采购记录'] }
    ]
  },
  {
    key: 'operation',
    title: '农事操作',
    icon: '🔧',
    roles: [1, 2, 3],
    children: [
      { key: 'operation-query', title: '操作记录查询', path: '/operation/query', roles: [1, 2, 3], breadcrumbs: ['农事操作', '操作记录查询'] },
      { key: 'operation-fertilize', title: '施肥记录', path: '/operation/fertilize', roles: [1, 2, 3], breadcrumbs: ['农事操作', '施肥记录'] },
      { key: 'operation-irrigate', title: '灌溉记录', path: '/operation/irrigate', roles: [1, 2, 3], breadcrumbs: ['农事操作', '灌溉记录'] }
    ]
  },
  {
    key: 'monitor',
    title: '环境监测',
    icon: '📈',
    roles: [1, 2, 3],
    children: [
      { key: 'monitor-realtime', title: '实时数据', path: '/monitor/realtime', roles: [1, 2, 3], breadcrumbs: ['环境监测', '实时数据'] },
      { key: 'monitor-history', title: '历史数据', path: '/monitor/history', roles: [1, 2, 3], breadcrumbs: ['环境监测', '历史数据'] },
      { key: 'monitor-report', title: '数据报表', path: '/monitor/report', roles: [1, 2, 3], breadcrumbs: ['环境监测', '数据报表'] }
    ]
  },
  {
    key: 'warning',
    title: '智能预警',
    icon: '⚠️',
    roles: [1, 2, 3],
    children: [
      { key: 'warning-device', title: '监控设备管理', path: '/warning/device', roles: [1, 2], breadcrumbs: ['智能预警', '监控设备管理'] },
      { key: 'warning-exception', title: '作物异常记录', path: '/warning/exception', roles: [1, 2, 3], breadcrumbs: ['智能预警', '作物异常记录'] },
      { key: 'warning-push', title: '异常推送记录', path: '/warning/push', roles: [1, 2, 3], breadcrumbs: ['智能预警', '异常推送记录'] },
      { key: 'warning-status', title: '处理状态统计', path: '/warning/status', roles: [1, 2, 3], breadcrumbs: ['智能预警', '处理状态统计'] }
    ]
  },
  {
    key: 'system',
    title: '系统管理',
    icon: '🛡️',
    roles: [1, 2],
    children: [
      { key: 'system-user', title: '用户管理', path: '/system/user', roles: [1, 2], breadcrumbs: ['系统管理', '用户管理'] },
      { key: 'system-role', title: '角色管理', path: '/system/role', roles: [1], breadcrumbs: ['系统管理', '角色管理'] },
      { key: 'system-permission', title: '权限配置', path: '/system/permission', roles: [1], breadcrumbs: ['系统管理', '权限配置'] }
    ]
  }
]

export function flattenRoutes(cfg = routeConfig) {
  const out = []
  for (const item of cfg) {
    if (item.path) out.push(item)
    for (const c of item.children || []) out.push(c)
  }
  return out
}

export function getBreadcrumbs(pathname) {
  const flat = flattenRoutes()
  const hit = flat.find((r) => r.path === pathname)
  if (hit?.breadcrumbs?.length) return hit.breadcrumbs
  if (hit?.title) return [hit.title]
  return ['首页']
}

