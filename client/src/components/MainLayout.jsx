import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MobileTabBar from './MobileTabBar'
import './MainLayout.css'

const MainLayout = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
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
        <TopBar mobile={isMobile} onToggleSidebar={() => setMobileSidebarOpen((v) => !v)} />
        <div className={`main-content ${isMobile ? 'mobile-main-content' : ''}`}>
          <Outlet />
        </div>
        {isMobile ? <MobileTabBar onOpenMenu={() => setMobileSidebarOpen(true)} /> : null}
      </div>
    </div>
  )
}

export default MainLayout

