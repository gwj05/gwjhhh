import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import HomePage from './pages/HomePage'
import OverviewPage from './pages/OverviewPage'
import FarmList from './pages/FarmList'
import FarmDetail from './pages/FarmDetail'
import FarmDetailEntry from './pages/FarmDetailEntry'
import FarmManager from './pages/FarmManager'
import CropList from './pages/CropList'
import CropArea from './pages/CropArea'
import CropCycleList from './pages/CropCycleList'
import CropCycleDetail from './pages/CropCycleDetail'
import MaterialList from './pages/MaterialList'
import MaterialWarning from './pages/MaterialWarning'
import MaterialPurchase from './pages/MaterialPurchase'
import StockFlow from './pages/StockFlow'
import OperationRecordQuery from './pages/OperationRecordQuery'
import FertilizeRecord from './pages/FertilizeRecord'
import IrrigateRecord from './pages/IrrigateRecord'
import MonitorRealtime from './pages/MonitorRealtime'
import MonitorHistory from './pages/MonitorHistory'
import MonitorReport from './pages/MonitorReport'
import WarningDevice from './pages/WarningDevice'
import WarningException from './pages/WarningException'
import WarningPush from './pages/WarningPush'
import WarningStats from './pages/WarningStats'
import SystemUserManagement from './pages/SystemUserManagement'
import SystemRoleManagement from './pages/SystemRoleManagement'
import SystemPermissionConfig from './pages/SystemPermissionConfig'
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
            <Route path="overview" element={<OverviewPage />} />
            <Route path="farm/list" element={<FarmList />} />
            <Route path="farm/detail" element={<FarmDetailEntry />} />
            <Route path="farm/detail/:id" element={<FarmDetail />} />
            <Route path="farm/manager" element={<FarmManager />} />
            <Route path="crop/list" element={<CropList />} />
            <Route path="crop/area" element={<CropArea />} />
            <Route path="crop/cycle" element={<CropCycleList />} />
            <Route path="crop/cycle/detail/:cropId" element={<CropCycleDetail />} />
            <Route path="material/list" element={<MaterialList />} />
            <Route path="material/warning" element={<MaterialWarning />} />
            <Route path="material/purchase" element={<MaterialPurchase />} />
            <Route path="material/stock-flow" element={<StockFlow />} />
            <Route path="operation/query" element={<OperationRecordQuery />} />
            <Route path="operation/fertilize" element={<FertilizeRecord />} />
            <Route path="operation/irrigate" element={<IrrigateRecord />} />
            <Route path="monitor/realtime" element={<MonitorRealtime />} />
            <Route path="monitor/history" element={<MonitorHistory />} />
            <Route path="monitor/report" element={<MonitorReport />} />
            <Route path="warning/device" element={<WarningDevice />} />
            <Route path="warning/exception" element={<WarningException />} />
            <Route path="warning/push" element={<WarningPush />} />
            <Route path="warning/status" element={<WarningStats />} />
            <Route path="system/user" element={<SystemUserManagement />} />
            <Route path="system/role" element={<SystemRoleManagement />} />
            <Route path="system/permission" element={<SystemPermissionConfig />} />
            <Route path="profile" element={<div>个人信息页面（待开发）</div>} />
            <Route path="password" element={<div>修改密码页面（待开发）</div>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App

