import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CoastGuardReports from '../pages/CoastGuardReports'

const ok = (data: any) => Promise.resolve({ ok: true, json: async () => data }) as unknown as Response

describe('CoastGuardReports page', () => {
  beforeEach(() => {
    localStorage.setItem('auth', 'Bearer cg-token')
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.includes('/api/coastguard/reports')) {
        return ok([
          {
            id: 1,
            event_id: 99,
            device_id: 10,
            device_name: 'Boat A',
            owner_name: 'Owner A',
            filed_by_name: 'Officer',
            resolution: 'Rescued',
            notes: 'All safe',
          },
        ])
      }
      if (u.endsWith('/api/auth/logout')) return ok({})
      return ok({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders a list of coast guard reports', async () => {
    render(
      <MemoryRouter>
        <CoastGuardReports />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/Filed SOS resolutions/i)).toBeInTheDocument())
    expect(screen.getByText(/Boat A/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Rescued/i).length).toBeGreaterThan(0)
  })
})