import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FisherfolkAccount from '../pages/FisherfolkAccount'

const ok = (data: any) => Promise.resolve({ ok: true, json: async () => data }) as unknown as Response

describe('FisherfolkAccount page', () => {
  beforeEach(() => {
    localStorage.setItem('auth', 'Bearer fisher-token')
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.endsWith('/api/auth/me')) return ok({ id: 11, name: 'Fisher User', email: 'fish@example.com', role: 'fisherfolk' })
      if (u.endsWith('/api/auth/change-password')) return ok({ ok: true })
      if (u.endsWith('/api/auth/logout')) return ok({})
      return ok({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows fisherfolk profile info', async () => {
    render(
      <MemoryRouter>
        <FisherfolkAccount />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/Your profile/i)).toBeInTheDocument())
    expect(screen.getByText(/fish@example.com/i)).toBeInTheDocument()
    expect(screen.getAllByText(/fisherfolk/i).length).toBeGreaterThan(0)
  })
})