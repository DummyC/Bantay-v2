import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Fisherfolk from '../pages/Fisherfolk'

vi.mock('react-leaflet', () => {
  const React = require('react')
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
    TileLayer: Stub,
    Marker: Stub,
    Polyline: Stub,
    Polygon: Stub,
    useMap: () => ({ flyTo: () => undefined, getZoom: () => 11 }),
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
    if (this.readyState === 3) return
    this.readyState = 3
    const handler = this.onclose
    this.onclose = null
    handler?.()
  }
}

describe('Fisherfolk page', () => {
  beforeEach(() => {
    // @ts-ignore
    global.WebSocket = MockWebSocket
    localStorage.setItem('auth', 'Bearer fisher-token')
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = url.toString()
      if (u.endsWith('/api/auth/me')) return Promise.resolve({ ok: true, json: async () => ({ id: 5, email: 'fish@example.com', role: 'fisherfolk' }) }) as any
      if (u.endsWith('/api/fisherfolk/devices')) return Promise.resolve({ ok: true, json: async () => [{ id: 201, name: 'Tracker 1' }] }) as any
      if (u.endsWith('/api/fisherfolk/geofences')) return Promise.resolve({ ok: true, json: async () => [] }) as any
      return Promise.resolve({ ok: true, json: async () => ({}) }) as any
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders fisherfolk trackers list and map', async () => {
    render(
      <MemoryRouter initialEntries={['/fisherfolk']}>
        <Fisherfolk />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTestId('map')).toBeInTheDocument())
    expect(screen.getByText(/Tracker 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Fisherfolk/i)).toBeInTheDocument()
  })
})