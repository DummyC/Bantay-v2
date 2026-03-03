import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CoastGuardAccount from '../pages/CoastGuardAccount'

const ok = (data: any) => Promise.resolve({ ok: true, json: async () => data }) as unknown as Response

describe('CoastGuardAccount page', () => {
  beforeEach(() => {
    localStorage.setItem('auth', 'Bearer cg-token')
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.endsWith('/api/auth/me')) return ok({ id: 7, name: 'CG User', email: 'cg@example.com', role: 'coast_guard' })
      if (u.endsWith('/api/auth/change-password')) return ok({ ok: true })
      if (u.endsWith('/api/auth/logout')) return ok({})
      return ok({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows coast guard profile info', async () => {
    render(
      <MemoryRouter>
        <CoastGuardAccount />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/Your profile/i)).toBeInTheDocument())
    expect(screen.getByText(/cg@example.com/i)).toBeInTheDocument()
    expect(screen.getByText(/coast_guard/i)).toBeInTheDocument()
  })
})