'use client'
import { useState } from 'react'
import Sidebar from '@/components/ui/Sidebar'
import Topbar from '@/components/ui/Topbar'
import OfflineBar from '@/components/ui/OfflineBar'
import DashboardPage from '@/components/dashboard/DashboardPage'
import QueuePage from '@/components/queue/QueuePage'
import BagsPage from '@/components/bags/BagsPage'
import WarehousePage from '@/components/warehouse/WarehousePage'
import WeatherPage from '@/components/weather/WeatherPage'
import VehiclesPage from '@/components/vehicles/VehiclesPage'
import SMSPage from '@/components/sms/SMSPage'
import ReportsPage from '@/components/reports/ReportsPage'
import ProcurementPage from '@/components/procurement/ProcurementPage'
import SettingsPage from '@/components/settings/SettingsPage'

export type PageId =
  | 'dashboard'
  | 'queue'
  | 'procurement'
  | 'bags'
  | 'warehouse'
  | 'weather'
  | 'vehicles'
  | 'sms'
  | 'reports'
  | 'settings'

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  queue:     'Farmer Queue Management',
  procurement: 'Procurement',
  bags:      'Gunny Bag AI Detection',
  warehouse: 'Warehouse Stock Management',
  weather:   'Rainfall Protection Monitor',
  vehicles:  'Vehicle Scheduling',
  sms:       'SMS Alert System',
  reports:   'Reports & Analytics',
  settings:  'Settings',
}

export default function Home() {
  const [page, setPage] = useState<PageId>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <DashboardPage onNavigate={setPage} />
      case 'queue':        return <QueuePage />
      case 'procurement':  return <ProcurementPage />
      case 'bags':         return <BagsPage />
      case 'warehouse':    return <WarehousePage />
      case 'weather':      return <WeatherPage />
      case 'vehicles':     return <VehiclesPage />
      case 'sms':          return <SMSPage />
      case 'reports':      return <ReportsPage />
      case 'settings':     return <SettingsPage />
      default:             return <DashboardPage onNavigate={setPage} />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar activePage={page} onNavigate={setPage} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar title={PAGE_TITLES[page]} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', background: 'var(--gray-bg)' }}>
          <div className="page-content">{renderPage()}</div>
        </div>
        <OfflineBar />
      </div>
    </div>
  )
}
