import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const show = useCallback((message, options = {}) => {
    const id = makeId()
    const kind = options.kind || 'info' // info/success/warn/error
    const durationMs = Number(options.durationMs ?? 2600)
    const item = { id, message: String(message || ''), kind }
    setToasts((prev) => [item, ...prev].slice(0, 5))
    if (durationMs > 0) {
      const timer = window.setTimeout(() => remove(id), durationMs)
      timers.current.set(id, timer)
    }
    return id
  }, [remove])

  const api = useMemo(() => {
    const wrap = (kind) => (msg, opts = {}) => show(msg, { ...opts, kind })
    return {
      show,
      remove,
      info: wrap('info'),
      success: wrap('success'),
      warn: wrap('warn'),
      error: wrap('error')
    }
  }, [remove, show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast-${t.kind}`}>
            <div className="ui-toast-message">{t.message}</div>
            <button type="button" className="ui-toast-close" onClick={() => remove(t.id)} aria-label="关闭">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

