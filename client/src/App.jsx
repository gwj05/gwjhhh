import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import HomePage from './pages/HomePage'
import FarmList from './pages/FarmList'
import FarmDetail from './pages/FarmDetail'
import FarmDetailEntry from './pages/FarmDetailEntry'
import FarmManager from './pages/FarmManager'
import CropList from './pages/CropList'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/MainLayout'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<Dashboard />} />
            <Route path="homepage" element={<HomePage />} />
            <Route path="overview" element={<div>系统概览页面（待开发）</div>} />
            <Route path="farm/list" element={<FarmList />} />
            <Route path="farm/detail" element={<FarmDetailEntry />} />
            <Route path="farm/detail/:id" element={<FarmDetail />} />
            <Route path="farm/manager" element={<FarmManager />} />
            <Route path="crop/list" element={<CropList />} />
            <Route path="crop/area" element={<div>种植区域管理页面（待开发）</div>} />
            <Route path="crop/cycle" element={<div>生长周期记录页面（待开发）</div>} />
            <Route path="material/list" element={<div>农资列表页面（待开发）</div>} />
            <Route path="material/warning" element={<div>库存预警页面（待开发）</div>} />
            <Route path="material/purchase" element={<div>采购记录页面（待开发）</div>} />
            <Route path="operation/query" element={<div>操作记录查询页面（待开发）</div>} />
            <Route path="operation/fertilize" element={<div>施肥记录页面（待开发）</div>} />
            <Route path="operation/irrigate" element={<div>灌溉记录页面（待开发）</div>} />
            <Route path="monitor/realtime" element={<div>实时数据页面（待开发）</div>} />
            <Route path="monitor/history" element={<div>历史数据页面（待开发）</div>} />
            <Route path="monitor/report" element={<div>数据报表页面（待开发）</div>} />
            <Route path="warning/device" element={<div>监控设备管理页面（待开发）</div>} />
            <Route path="warning/exception" element={<div>作物异常记录页面（待开发）</div>} />
            <Route path="warning/push" element={<div>异常推送记录页面（待开发）</div>} />
            <Route path="warning/status" element={<div>处理状态统计页面（待开发）</div>} />
            <Route path="system/user" element={<div>用户管理页面（待开发）</div>} />
            <Route path="system/role" element={<div>角色管理页面（待开发）</div>} />
            <Route path="system/permission" element={<div>权限配置页面（待开发）</div>} />
            <Route path="profile" element={<div>个人信息页面（待开发）</div>} />
            <Route path="password" element={<div>修改密码页面（待开发）</div>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App

