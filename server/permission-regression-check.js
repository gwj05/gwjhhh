/**
 * 越权回归检查（需先启动后端）
 * 用法：
 *   node permission-regression-check.js
 * 可选环境变量：
 *   BASE_URL=http://localhost:5000
 */
require('dotenv').config()

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`

async function post(path, body, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body || {})
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function get(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function login(username, password = '123456') {
  const r = await post('/api/auth/login', { username, password })
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`登录失败: ${username} -> ${r.status} ${JSON.stringify(r.data)}`)
  }
  return r.data.token
}

async function loginByCandidates(roleName, candidates) {
  let lastError = null
  for (const username of candidates) {
    try {
      const token = await login(username)
      console.log(`已登录 ${roleName}: ${username}`)
      return { token, username }
    } catch (e) {
      lastError = e
      // continue trying next candidate
    }
  }
  console.log(
    `⚠️ 未找到可用账号: ${roleName} (${candidates.join(', ')})` +
      (lastError ? `；last_error=${lastError.message}` : '')
  )
  return { token: null, username: null }
}

async function main() {
  console.log(`BASE_URL: ${BASE_URL}`)
  const admin = await loginByCandidates('admin', ['admin', 'root', 'superadmin'])
  const farmManager = await loginByCandidates('farm_manager', ['operator', 'farmadmin', 'manager'])
  const normalUser = await loginByCandidates('normal_user', ['user', 'farmer', 'testuser'])

  if (!admin.token) {
    throw new Error('缺少管理员账号，无法执行权限回归检查')
  }

  const checks = [
    { name: 'admin users list', fn: () => get('/api/system/users?page=1&pageSize=5', admin.token), expect: [200] },
    ...(farmManager.token
      ? [
          { name: 'farm manager users list', fn: () => get('/api/system/users?page=1&pageSize=5', farmManager.token), expect: [200] },
          { name: 'farm manager roles limited', fn: () => get('/api/system/roles', farmManager.token), expect: [200] }
        ]
      : []),
    ...(normalUser.token
      ? [
          { name: 'normal user users list forbidden', fn: () => get('/api/system/users?page=1&pageSize=5', normalUser.token), expect: [403] },
          { name: 'normal user roles forbidden', fn: () => get('/api/system/roles', normalUser.token), expect: [403] },
          { name: 'weather list normal user', fn: () => get('/api/homepage/weather', normalUser.token), expect: [200] },
          { name: 'warning list normal user', fn: () => get('/api/warning/list?page=1&pageSize=5', normalUser.token), expect: [200] }
        ]
      : [])
  ]

  let fail = 0
  for (const c of checks) {
    try {
      const r = await c.fn()
      const ok = c.expect.includes(r.status)
      console.log(`${ok ? '✅' : '❌'} ${c.name} -> ${r.status}`)
      if (!ok) {
        fail += 1
        console.log('   response:', JSON.stringify(r.data).slice(0, 300))
      }
    } catch (e) {
      fail += 1
      console.log(`❌ ${c.name} -> error ${e.message}`)
    }
  }

  if (fail > 0) {
    console.log(`\n完成：${fail} 项失败`)
    process.exitCode = 1
  } else {
    console.log('\n完成：全部通过')
    process.exitCode = 0
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
