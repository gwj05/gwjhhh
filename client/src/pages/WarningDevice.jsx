import React, { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { notifyWarningChanged } from '../utils/warningEvents'
import './WarningPages.css'

const STATUS_CLASS = {
  在线: 'online',
  离线: 'offline',
  故障: 'fault'
}

function isSystemEnvDevice(row) {
  return row?.device_name === '环境采集终端（系统）'
}

const WarningDevice = () => {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1

  const [farms, setFarms] = useState([])
  const [farmFilter, setFarmFilter] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const showToast = (message, kind = 'success') => {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 2600)
  }

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    farm_id: '',
    device_name: '',
    install_location: '',
    device_status: '在线',
    monitor_area: '',
    device_category: ''
  })

  const loadFarms = useCallback(async () => {
    try {
      const res = await api.get('/farm/list', { params: { page: 1, pageSize: 200 } })
      setFarms(res.data?.data || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/warning/devices', {
        params: isAdmin && farmFilter ? { farm_id: farmFilter } : {}
      })
      setRows(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      showToast(e.response?.data?.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [isAdmin, farmFilter])

  useEffect(() => {
    loadFarms()
  }, [loadFarms])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const openAdd = () => {
    setEditing(null)
    const defaultFarm = !isAdmin && user?.farm_id ? String(user.farm_id) : farmFilter || ''
    setForm({
      farm_id: defaultFarm,
      device_name: '',
      install_location: '',
      device_status: '在线',
      monitor_area: '',
      device_category: ''
    })
    setModalOpen(true)
  }

  const openEdit = (row) => {
    if (isSystemEnvDevice(row) && !isAdmin) {
      showToast('系统环境设备不可修改', 'error')
      return
    }
    setEditing(row)
    setForm({
      farm_id: String(row.farm_id),
      device_name: row.device_name,
      install_location: row.install_location,
      device_status: row.device_status,
      monitor_area: row.monitor_area,
      device_category: row.device_category || ''
    })
    setModalOpen(true)
  }

  const submitForm = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        await api.put(`/warning/devices/${editing.device_id}`, {
          farm_id: Number(form.farm_id),
          device_name: form.device_name,
          install_location: form.install_location,
          device_status: form.device_status,
          monitor_area: form.monitor_area,
          device_category: form.device_category || null
        })
        showToast('更新成功')
      } else {
        await api.post('/warning/devices', {
          farm_id: Number(form.farm_id),
          device_name: form.device_name,
          install_location: form.install_location,
          device_status: form.device_status,
          monitor_area: form.monitor_area,
          device_category: form.device_category || null
        })
        showToast('已新增设备')
      }
      setModalOpen(false)
      notifyWarningChanged()
      loadDevices()
    } catch (err) {
      showToast(err.response?.data?.message || '保存失败', 'error')
    }
  }

  const remove = async (row) => {
    if (isSystemEnvDevice(row)) {
      showToast('系统环境设备不可删除', 'error')
      return
    }
    if (!window.confirm(`确定删除设备「${row.device_name}」？`)) return
    try {
      await api.delete(`/warning/devices/${row.device_id}`)
      showToast('已删除')
      notifyWarningChanged()
      loadDevices()
    } catch (err) {
      showToast(err.response?.data?.message || '删除失败', 'error')
    }
  }

  return (
    <div className="warning-module-page">
      <div className="warning-module-header">
        <h2>监控设备管理</h2>
        <p className="warning-module-sub">
          维护监测设备并绑定农场与覆盖区域；状态为在线/离线/最后同步时间。环境模拟产生的数据关联系统内置「环境采集终端」设备。
        </p>
      </div>

      <div className="warning-toolbar">
        {isAdmin ? (
          <div className="field">
            <label>农场筛选</label>
            <select value={farmFilter} onChange={(e) => setFarmFilter(e.target.value)}>
              <option value="">全部</option>
              {farms.map((f) => (
                <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="warning-toolbar-actions">
          <button type="button" className="btn-primary" onClick={openAdd}>
            新增设备
          </button>
          <button type="button" className="btn-ghost" onClick={loadDevices} disabled={loading}>
            刷新
          </button>
        </div>
      </div>

      <div className="warning-table-card">
        {loading && rows.length === 0 ? (
          <div className="warning-empty">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="warning-empty">暂无设备</div>
        ) : (
          <table className="warning-data-table">
            <thead>
              <tr>
                <th>设备</th>
                <th>农场</th>
                <th>监控区域</th>
                <th>安装位置</th>
                <th>状态</th>
                <th>最近在线</th>
                <th>类别</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.device_id}>
                  <td>{r.device_name}</td>
                  <td>{r.farm_name}</td>
                  <td>{r.monitor_area}</td>
                  <td>{r.install_location}</td>
                  <td>
                    <span className={`badge-status ${STATUS_CLASS[r.device_status] || 'offline'}`}>
                      {r.device_status}
                    </span>
                  </td>
                  <td>{r.last_online_time ? new Date(r.last_online_time).toLocaleString() : '—'}</td>
                  <td>{r.device_category || '—'}</td>
                  <td>
                    <div className="warning-actions">
                      <button type="button" className="btn-ghost" onClick={() => openEdit(r)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => remove(r)}
                        disabled={isSystemEnvDevice(r)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen ? (
        <div className="warning-modal-overlay" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="warning-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? '编辑设备' : '新增设备'}</h3>
            <form onSubmit={submitForm}>
              <div className="warning-form-grid">
                <div>
                  <label>农场</label>
                  <select
                    required
                    value={form.farm_id}
                    onChange={(e) => setForm((s) => ({ ...s, farm_id: e.target.value }))}
                    disabled={!isAdmin && !!user?.farm_id}
                  >
                    <option value="">请选择</option>
                    {farms.map((f) => (
                      <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>设备名称</label>
                  <input
                    required
                    value={form.device_name}
                    onChange={(e) => setForm((s) => ({ ...s, device_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label>安装位置</label>
                  <input
                    required
                    value={form.install_location}
                    onChange={(e) => setForm((s) => ({ ...s, install_location: e.target.value }))}
                  />
                </div>
                <div>
                  <label>设备状态</label>
                  <select
                    required
                    value={form.device_status}
                    onChange={(e) => setForm((s) => ({ ...s, device_status: e.target.value }))}
                  >
                    <option value="在线">在线</option>
                    <option value="离线">离线</option>
                    <option value="故障">故障</option>
                  </select>
                </div>
                <div>
                  <label>监控覆盖区域</label>
                  <input
                    required
                    placeholder="与作物种植区域一致，如「A区大棚」"
                    value={form.monitor_area}
                    onChange={(e) => setForm((s) => ({ ...s, monitor_area: e.target.value }))}
                  />
                </div>
                <div>
                  <label>设备大类（选填）</label>
                  <input
                    placeholder="传感器 / 摄像头 / 控制器"
                    value={form.device_category}
                    onChange={(e) => setForm((s) => ({ ...s, device_category: e.target.value }))}
                  />
                </div>
              </div>
              <div className="warning-modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>取消</button>
                <button type="submit" className="btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`warning-toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.message}</div>
      ) : null}
    </div>
  )
}

export default WarningDevice
