import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import './MainLayout.css'

const MainLayout = () => {
  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main-content-wrapper">
        <TopBar />
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default MainLayout

