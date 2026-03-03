import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Admin from '../pages/Admin'

const mockOk = (data: any) => Promise.resolve({ ok: true, json: async () => data }) as unknown as Response

describe('Admin page', () => {
  beforeEach(() => {
    localStorage.setItem('auth', 'Bearer test-token')
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.endsWith('/api/auth/me')) return mockOk({ id: 1, email: 'admin@example.com', role: 'administrator' })
      if (u.endsWith('/api/admin/users')) return mockOk([])
      if (u.endsWith('/api/admin/devices')) return mockOk([])
      if (u.endsWith('/api/admin/geofences')) return mockOk([])
      if (u.includes('/api/admin/alerts')) return mockOk([])
      if (u.includes('/api/admin/reports')) return mockOk([])
      if (u.includes('/api/admin/logs')) return mockOk([])
      return mockOk({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders admin navigation tabs for an authenticated administrator', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Admin />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/Overview/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Users/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Devices/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alerts/i })).toBeInTheDocument()
  })
})