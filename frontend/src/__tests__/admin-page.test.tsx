import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Admin from '../pages/Admin'

const mockOk = (data: any) => Promise.resolve({ ok: true, json: async () => data }) as unknown as Response

describe('Admin page', () => {
  beforeEach(() => {
    localStorage.setItem('auth', 'Bearer test-token')
    const devices = [
      {
        id: 1,
        name: 'Unassigned Device',
        unique_id: 'UID-123',
        user_id: null,
        traccar_device_id: null,
        geofence_id: null,
      },
    ]
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.endsWith('/api/auth/me')) return mockOk({ id: 1, email: 'admin@example.com', role: 'administrator' })
      if (u.endsWith('/api/admin/users')) return mockOk([])
      if (u.endsWith('/api/admin/devices')) return mockOk(devices)
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

  it('hides new-device fields when linking an existing device and shows them again when creating new', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Admin />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: /Users/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Users/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Register Fisher/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Register Fisher/i }))

    const deviceSelect = screen.getByLabelText(/Link existing unassigned device/i) as HTMLSelectElement

    expect(screen.getByLabelText(/IMEI/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/SIM Number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/SSEN/i)).toBeInTheDocument()

    fireEvent.change(deviceSelect, { target: { value: '1' } })
    await waitFor(() => expect(screen.queryByLabelText(/IMEI/i)).not.toBeInTheDocument())
    expect(screen.queryByLabelText(/SIM Number/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/SSEN/i)).not.toBeInTheDocument()

    fireEvent.change(deviceSelect, { target: { value: '' } })
    await waitFor(() => expect(screen.getByLabelText(/IMEI/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/SIM Number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/SSEN/i)).toBeInTheDocument()
  })

  it('blocks submit when SIM is not 11 digits starting with 09', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Admin />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: /Users/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Users/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Register Fisher/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Register Fisher/i }))

    const [nameInput, emailInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Tester' } })
    fireEvent.change(emailInput, { target: { value: 'tester@example.com' } })
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(passwordInput, { target: { value: 'abcdefgh' } })
    fireEvent.change(screen.getByLabelText(/SIM Number/i), { target: { value: '08123' } })

    const callsBefore = (global.fetch as any).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }))

    await waitFor(() => {
      const errors = screen.getAllByText(/SIM number must start with 09 and be 11 digits/i)
      expect(errors.length).toBeGreaterThan(0)
    })
    expect((global.fetch as any).mock.calls.length).toBe(callsBefore)
  })
})