import React from 'react'
import { getErrorMessage } from '../utils/errorMessage'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // 企业级：这里可接入 Sentry/日志上报
    // 目前保持 console，避免引入外部依赖
    console.error('UI crashed:', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = getErrorMessage(this.state.error, '页面发生错误')
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            padding: 20
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
            系统遇到问题
          </div>
          <div style={{ color: 'var(--color-text-2)', lineHeight: 1.7, marginBottom: 16 }}>
            {msg}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer'
              }}
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = '/home')}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer'
              }}
            >
              返回首页
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('token')
                window.location.href = '/login'
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(239,68,68,0.25)',
                background: 'rgba(239,68,68,0.10)',
                color: '#991b1b',
                cursor: 'pointer'
              }}
            >
              重新登录
            </button>
          </div>
        </div>
      </div>
    )
  }
}

