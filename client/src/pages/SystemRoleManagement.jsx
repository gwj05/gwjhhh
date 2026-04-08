import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './SystemPages.css'

export default function SystemRoleManagement() {
  const { user } = useAuth()
  const [roles, setRoles] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get('/system/roles')
        setRoles(res.data || [])
      } catch (e) {
        setErr(e.response?.data?.message || '加载角色失败')
      }
    }
    run()
  }, [])

  return (
    <div className="system-page">
      <div className="system-header"><h2>角色管理</h2></div>
      <p className="system-sub">角色由系统预置：管理员、运维人员、普通用户。农场管理员仅可创建普通用户。</p>
      {err ? <div className="system-card">{err}</div> : null}
      <div className="sys-roles-grid">
        {roles.map((r) => (
          <div className="sys-role-card" key={r.role_id}>
            <div className="sys-role-title">{r.role_name}</div>
            <div className="sys-kv">
              <div>角色ID：{r.role_id}</div>
              <div>可见范围：{r.role_id === 1 ? '全部农场' : '所属农场'}</div>
              <div>是否可切换全局农场：{r.role_id === 1 ? '是' : '否'}</div>
              <div>用户管理：{r.role_id === 1 ? '全部' : r.role_id === 2 ? '本农场普通用户' : '无'}</div>
            </div>
          </div>
        ))}
      </div>
      {user?.role_id !== 1 ? (
        <p className="system-sub" style={{ marginTop: 12 }}>当前账号非管理员，角色管理为只读信息。</p>
      ) : null}
    </div>
  )
}
