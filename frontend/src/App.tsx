import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Admin from './pages/Admin'
import CoastGuard from './pages/CoastGuard'
import Fisherfolk from './pages/Fisherfolk'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/coast-guard" element={<CoastGuard />} />
        <Route path="/fisherfolk" element={<Fisherfolk />} />
      </Routes>
    </BrowserRouter>
  )
}
