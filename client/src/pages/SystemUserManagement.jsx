import React, { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import './SystemPages.css'

const emptyForm = {
  username: '',
  password: '',
  real_name: '',
  phone: '',
  role_id: 3,
  farm_id: ''
}

export default function SystemUserManagement() {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1
  const isFarmManager = user?.role_id === 2
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [roles, setRoles] = useState([])
  const [farms, setFarms] = useState([])
  const [filter, setFilter] = useState({ username: '', real_name: '', role_id: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  const loadMeta = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([
        api.get('/system/roles'),
        isAdmin ? api.get('/farm/list', { params: { page: 1, pageSize: 300 } }) : Promise.resolve({ data: { data: [] } })
      ])
      setRoles(r.data || [])
      setFarms(f.data?.data || [])
    } catch (e) {
      showToast(e.response?.data?.message || '加载角色/农场失败')
    }
  }, [isAdmin])

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get('/system/users', {
        params: {
          page,
          pageSize,
          username: filter.username || undefined,
          real_name: filter.real_name || undefined,
          role_id: filter.role_id || undefined
        }
      })
      setRows(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      showToast(e.response?.data?.message || '加载用户失败')
    }
  }, [page, pageSize, filter.username, filter.real_name, filter.role_id])

  useEffect(() => { loadMeta() }, [loadMeta])
  useEffect(() => { loadUsers() }, [loadUsers])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, role_id: isFarmManager ? 3 : 3, farm_id: isAdmin ? '' : String(user?.farm_id || '') })
    setModalOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      username: r.username || '',
      password: '',
      real_name: r.real_name || '',
      phone: r.phone || '',
      role_id: Number(r.role_id || 3),
      farm_id: r.farm_id ? String(r.farm_id) : ''
    })
    setModalOpen(true)
  }

  const submit = async () => {
    try {
      if (!form.username || !form.real_name || !form.phone) return showToast('请填写完整信息')
      if (!editing && !form.password) return showToast('新建用户必须填写密码')
      const payload = {
        username: form.username.trim(),
        real_name: form.real_name.trim(),
        phone: form.phone.trim(),
        role_id: isFarmManager ? 3 : Number(form.role_id),
        farm_id: isAdmin ? (form.farm_id || null) : user?.farm_id
      }
      if (form.password) payload.password = form.password
      if (editing) {
        await api.put(`/system/users/${editing.user_id}`, payload)
        showToast('更新成功')
      } else {
        await api.post('/system/users', payload)
        showToast('创建成功')
      }
      setModalOpen(false)
      loadUsers()
    } catch (e) {
      showToast(e.response?.data?.message || '提交失败')
    }
  }

  const remove = async (r) => {
    if (!window.confirm(`确认删除用户 ${r.username} ?`)) return
    try {
      await api.delete(`/system/users/${r.user_id}`)
      showToast('删除成功')
      loadUsers()
    } catch (e) {
      showToast(e.response?.data?.message || '删除失败')
    }
  }

  return (
    <div className="system-page">
      <div className="system-header">
        <h2>用户管理</h2>
        <button className="sys-btn primary" onClick={openCreate}>新增用户</button>
      </div>
      <p className="system-sub">
        {isAdmin ? '管理员可管理全部用户。' : '农场管理员仅可管理本农场普通用户。'}
      </p>

      <div className="system-card">
        <div className="system-filter">
          <div className="field">
            <label>用户名</label>
            <input value={filter.username} onChange={(e) => setFilter((s) => ({ ...s, username: e.target.value }))} />
          </div>
          <div className="field">
            <label>姓名</label>
            <input value={filter.real_name} onChange={(e) => setFilter((s) => ({ ...s, real_name: e.target.value }))} />
          </div>
          <div className="field">
            <label>角色</label>
            <select value={filter.role_id} onChange={(e) => setFilter((s) => ({ ...s, role_id: e.target.value }))}>
              <option value="">全部</option>
              {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
            </select>
          </div>
          <button className="sys-btn" onClick={() => { setPage(1); loadUsers() }}>查询</button>
        </div>

        <table className="system-table">
          <thead>
            <tr>
              <th>ID</th><th>用户名</th><th>姓名</th><th>手机</th><th>角色</th><th>所属农场</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id}>
                <td>{r.user_id}</td>
                <td>{r.username}</td>
                <td>{r.real_name}</td>
                <td>{r.phone}</td>
                <td>{r.role_name}</td>
                <td>{r.farm_name || '-'}</td>
                <td>
                  <div className="system-actions">
                    <button className="sys-btn" onClick={() => openEdit(r)}>编辑</button>
                    <button className="sys-btn danger" onClick={() => remove(r)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sys-pagebar">
          <span>共 {total} 条</span>
          <button className="sys-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span>{page}/{pageCount}</span>
          <button className="sys-btn" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      </div>

      {modalOpen && (
        <div className="sys-modal-mask" onClick={() => setModalOpen(false)}>
          <div className="sys-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? '编辑用户' : '新增用户'}</h3>
            <div className="sys-form">
              <div><label>用户名</label><input value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} /></div>
              <div><label>密码{editing ? '（留空不改）' : ''}</label><input type="password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} /></div>
              <div><label>姓名</label><input value={form.real_name} onChange={(e) => setForm((s) => ({ ...s, real_name: e.target.value }))} /></div>
              <div><label>手机</label><input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} /></div>
              <div>
                <label>角色</label>
                <select value={form.role_id} onChange={(e) => setForm((s) => ({ ...s, role_id: Number(e.target.value) }))} disabled={isFarmManager}>
                  {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
                </select>
              </div>
              <div>
                <label>所属农场</label>
                <select value={form.farm_id} onChange={(e) => setForm((s) => ({ ...s, farm_id: e.target.value }))} disabled={!isAdmin}>
                  <option value="">{isAdmin ? '请选择' : '自动绑定当前农场'}</option>
                  {farms.map((f) => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}
                </select>
              </div>
            </div>
            <div className="system-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="sys-btn" onClick={() => setModalOpen(false)}>取消</button>
              <button className="sys-btn primary" onClick={submit}>保存</button>
            </div>
          </div>
        </div>
      )}
      {toast ? <div className="sys-toast">{toast}</div> : null}
    </div>
  )
}
