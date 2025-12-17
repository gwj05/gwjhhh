import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import './Login.css'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await api.post('/auth/login', {
        username,
        password
      })

      login(response.data.token, response.data.user)
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="agriculture-illustration">
          <div className="farm-field"></div>
          <div className="sensor-icon"></div>
          <div className="data-flow"></div>
        </div>
      </div>
      <div className="login-card">
        <div className="login-header">
          <div className="logo">🌾</div>
          <h1>农业物联网平台</h1>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}
          <div className="input-group">
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-button" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <div className="login-footer">
          <Link to="/register" className="link">没有账号？立即注册</Link>
          <Link to="#" className="link">忘记密码？</Link>
        </div>
      </div>
    </div>
  )
}

export default Login

