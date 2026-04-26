import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import './SystemPages.css'

export default function SystemPermissionConfig() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get('/system/permissions')
        setRows(res.data || [])
      } catch (e) {
        setErr(e.response?.data?.message || '加载权限配置失败')
      }
    }
    run()
  }, [])

  return (
    <div className="system-page">
      <div className="system-header"><h2>权限配置</h2></div>
      <p className="system-sub">系统按角色执行接口数据隔离与菜单显隐：管理员（全局）、农场管理员（所属农场）、普通用户（受限访问）。</p>
      <div className="system-card">
        {err ? (
          <div>{err}</div>
        ) : (
          <table className="system-table mobile-card-table">
            <thead>
              <tr>
                <th>角色</th>
                <th>数据范围</th>
                <th>用户管理</th>
                <th>全局农场切换</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.role_id}>
                  <td data-label="角色">{r.role_name}</td>
                  <td data-label="数据范围">{r.data_scope}</td>
                  <td data-label="用户管理">{r.user_manage}</td>
                  <td data-label="全局农场切换">{r.can_switch_global_farm ? '允许' : '不允许'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
