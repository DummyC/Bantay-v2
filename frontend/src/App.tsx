import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Admin from './pages/Admin'
import CoastGuard from './pages/CoastGuard'
import CoastGuardReports from './pages/CoastGuardReports'
import CoastGuardAccount from './pages/CoastGuardAccount'
import Fisherfolk from './pages/Fisherfolk'
import Landing from './pages/Landing'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/coast-guard" element={<CoastGuard />} />
        <Route path="/coast-guard/reports" element={<CoastGuardReports />} />
        <Route path="/coast-guard/account" element={<CoastGuardAccount />} />
        <Route path="/fisherfolk" element={<Fisherfolk />} />
      </Routes>
    </BrowserRouter>
  )
}
