import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CoastGuard from '../pages/CoastGuard'

vi.mock('react-leaflet', () => {
  const React = require('react')
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: Stub,
    Marker: Stub,
    Tooltip: Stub,
    Polyline: Stub,
    Polygon: Stub,
    useMap: () => ({ flyTo: () => undefined }),
    useMapEvents: () => ({})
  }
})

class MockWebSocket {
  url: string
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readyState = 1
  constructor(url: string) {
    this.url = url
    setTimeout(() => this.onmessage?.({ data: JSON.stringify({ positions: [] }) }), 0)
  }
  send() {}
  close() {
    this.readyState = 3
    this.onclose?.()
  }
}

describe('CoastGuard page', () => {
  beforeEach(() => {
    // @ts-ignore
    global.WebSocket = MockWebSocket
    localStorage.setItem('auth', 'Bearer cg-token')
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.endsWith('/api/coastguard/devices')) return Promise.resolve({ ok: true, json: async () => [{ id: 101, name: 'Vessel A' }] }) as any
      if (u.endsWith('/api/auth/logout')) return Promise.resolve({ ok: true, json: async () => ({}) }) as any
      if (u.includes('/api/coastguard/history')) return Promise.resolve({ ok: true, json: async () => [] }) as any
      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows coast guard map layout when authenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/coast-guard']}>
        <CoastGuard />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument())
    expect(screen.getByText(/Coast Guard/i)).toBeInTheDocument()
    expect(screen.getByText(/Logout/i)).toBeInTheDocument()
  })

  it('validates history inputs before fetching', async () => {
    render(
      <MemoryRouter initialEntries={['/coast-guard']}>
        <CoastGuard />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument())
    expect(screen.getByText(/Vessel A/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Vessel A/i))
    await waitFor(() => expect(screen.getByText(/Fisherfolk:/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /View history/i }))
    await waitFor(() => expect(screen.getByText(/History mode/i)).toBeInTheDocument())

    const dateInputs = document.querySelectorAll('input[type="datetime-local"]') as NodeListOf<HTMLInputElement>
    expect(dateInputs.length).toBeGreaterThanOrEqual(2)
    const [startInput, endInput] = dateInputs

    fireEvent.change(startInput, { target: { value: '2024-02-02T00:00' } })
    fireEvent.change(endInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))
    await waitFor(() => expect(screen.getByText(/Please provide both start and end times/i)).toBeInTheDocument())
  })
})