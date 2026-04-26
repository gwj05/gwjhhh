import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import './MainLayout.css'

const MainLayout = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) {
        setMobileSidebarOpen(false)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="main-layout">
      <Sidebar mobileOpen={mobileSidebarOpen} onNavigate={() => setMobileSidebarOpen(false)} />
      {mobileSidebarOpen ? <div className="sidebar-mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} /> : null}
      <div className="main-content-wrapper">
        <TopBar onToggleSidebar={() => setMobileSidebarOpen((v) => !v)} />
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default MainLayout

