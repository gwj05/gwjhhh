import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './ui/Toast/ToastProvider'
import './ui/ui.css'
import './theme/cockpit-pages.css'
import './theme/cockpit-farm-crop.css'
import './theme/responsive.css'
import './theme/mobile-rebuild.css'
import { Provider } from 'react-redux'
import { store } from './store/store'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </Provider>
  </React.StrictMode>,
)

