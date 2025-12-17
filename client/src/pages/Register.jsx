import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../utils/api'
import './Register.css'

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    real_name: '',
    phone: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // 验证密码确认
    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    // 验证必填字段
    if (!formData.username || !formData.password || !formData.real_name || !formData.phone) {
      setError('请填写所有必填字段')
      return
    }

    setLoading(true)

    try {
      await api.post('/auth/register', {
        username: formData.username,
        password: formData.password,
        real_name: formData.real_name,
        phone: formData.phone
      })

      alert('注册成功！请登录')
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.message || '注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="register-container">
      <div className="register-background">
        <div className="agriculture-illustration">
          <div className="farm-field"></div>
          <div className="sensor-icon"></div>
          <div className="data-flow"></div>
        </div>
      </div>
      <div className="register-card">
        <div className="register-header">
          <div className="logo">🌾</div>
          <h1>用户注册</h1>
        </div>
        <form onSubmit={handleSubmit} className="register-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="input-group">
            <input
              type="text"
              name="username"
              placeholder="用户名"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              name="password"
              placeholder="密码"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <input
              type="password"
              name="confirmPassword"
              placeholder="确认密码"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <input
              type="text"
              name="real_name"
              placeholder="真实姓名"
              value={formData.real_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <input
              type="tel"
              name="phone"
              placeholder="手机号"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="register-note">
            <p>注册后将自动创建为普通用户账号</p>
          </div>

          <button type="submit" className="register-button" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
        <div className="register-footer">
          <Link to="/login" className="link">已有账号？立即登录</Link>
        </div>
      </div>
    </div>
  )
}

export default Register

