import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global fetch wrapper: if backend returns 401 (expired/invalid token),
// clear stored auth and bounce to the login screen so the UI doesn't get stuck.
const originalFetch = window.fetch.bind(window)
window.fetch = (async (...args) => {
  const response = await originalFetch(...args)
  if (response.status === 401) {
    localStorage.removeItem('auth')
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }
  return response
}) as typeof fetch

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
