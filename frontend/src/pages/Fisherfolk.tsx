import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, Marker, Polyline, Polygon, TileLayer, useMap } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Activity,
  Clock3,
  History as HistoryIcon,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  RefreshCw,
  Shield,
  Smartphone,
  User,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'

type DeviceInfo = {
  id: number
  name?: string | null
  unique_id?: string | null
  traccar_device_id?: number | null
  user_id?: number | null
}

type PositionPayload = {
  id: number
  device_id: number
  latitude: number
  longitude: number
  speed?: number | null
  course?: number | null
  timestamp?: string | null
  battery_percent?: number | null
  attributes?: Record<string, unknown> | null
}

type TrackerState = {
  device: DeviceInfo
  lastPosition?: PositionPayload
}

type HistoryPoint = PositionPayload

type GeofenceShape = {
  id: number
  name: string
  polygon: [number, number][][]
}

const defaultCenter: [number, number] = [9.7494, 124.573]

function parseUtc(ts?: string | null): number | null {
  if (!ts) return null
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(ts)
  const iso = hasZone ? ts : `${ts}Z`
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

function relativeTime(ts?: string | null): string {
  const t = parseUtc(ts)
  if (t === null) return 'No data'
  const diff = Date.now() - t
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function statusLabel(ts?: string | null): { text: string; tone: 'emerald' | 'amber' | 'slate' } {
  const t = parseUtc(ts)
  if (t === null) return { text: 'No signal', tone: 'slate' }
  const stale = Date.now() - t
  if (stale <= 10 * 60_000) return { text: 'Online', tone: 'emerald' }
  if (stale <= 60 * 60_000) return { text: 'Stale', tone: 'amber' }
  return { text: 'Offline', tone: 'slate' }
}

function formatGMT8(ts?: string | null, fallback = 'N/A') {
  const t = parseUtc(ts)
  if (t === null) return fallback
  return new Date(t).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function markerIcon(color: string, heading = 0) {
  const circleSize = 22
  return L.divIcon({
    className: 'tracker-icon',
    iconSize: [circleSize, circleSize],
    iconAnchor: [circleSize / 2, circleSize / 2],
    html: `
      <div style="position:relative;width:${circleSize}px;height:${circleSize}px;transform: rotate(${heading}deg);">
        <div style="position:absolute;inset:0;border:2px solid ${color};border-radius:50%;box-sizing:border-box;background:rgba(15,23,42,0.85);"></div>
        <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${color};"></div>
        <div style="position:absolute;inset:4px;border-radius:50%;background:#0f172a;color:white;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;">⛵</div>
      </div>
    `,
  })
}

function historyMarkerIcon(color = '#22d3ee') {
  const size = 16
  return L.divIcon({
    className: 'history-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border:2px solid ${color};border-radius:50%;background:#0f172a;box-shadow:0 0 0 2px rgba(34,211,238,0.35);"></div>`,
  })
}

function parseWktPolygon(area?: string | null): [number, number][][] | null {
  if (!area) return null
  const lower = area.trim().toLowerCase()
  if (!lower.startsWith('polygon')) return null
  const start = area.indexOf('(')
  const end = area.lastIndexOf(')')
  if (start === -1 || end === -1 || end <= start) return null
  const inner = area.slice(start, end + 1)
  const rings = inner
    .split('),')
    .map((segment) => segment.replace(/[()]/g, '').trim())
    .filter(Boolean)
  const parsed: [number, number][][] = []
  for (const ring of rings) {
    const points = ring
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const parts = pair.split(/\s+/).filter(Boolean)
        if (parts.length < 2) return null
        const lat = Number(parts[0])
        const lon = Number(parts[1])
        if (Number.isNaN(lat) || Number.isNaN(lon)) return null
        return [lat, lon] as [number, number]
      })
      .filter(Boolean) as [number, number][]
    if (points.length < 3) continue
    const first = points[0]
    const last = points[points.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      points.push([first[0], first[1]])
    }
    parsed.push(points)
  }
  return parsed.length ? parsed : null
}

function FlyToPosition({ position }: { position?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, map.getZoom() || 11, { duration: 0.5 })
    }
  }, [position, map])
  return null
}

export default function Fisherfolk() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [trackers, setTrackers] = useState<Record<number, TrackerState>>({})
  const [history, setHistory] = useState<Record<number, HistoryPoint[]>>({})
  const [historyDeviceId, setHistoryDeviceId] = useState<number | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyStart, setHistoryStart] = useState('')
  const [historyEnd, setHistoryEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mapTarget, setMapTarget] = useState<[number, number]>(defaultCenter)
  const [autoCentered, setAutoCentered] = useState(false)
  const [historySelectedPoint, setHistorySelectedPoint] = useState<HistoryPoint | null>(null)
  const [geofences, setGeofences] = useState<GeofenceShape[]>([])
  const privacyKey = 'bantay_privacy_v2'
  const [showPrivacy, setShowPrivacy] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(privacyKey)
  })
  const [privacyLang, setPrivacyLang] = useState<'en' | 'ceb'>('en')

  const authValue = typeof window !== 'undefined' ? localStorage.getItem('auth') : null
  const token = useMemo(() => {
    if (!authValue) return ''
    const match = authValue.match(/\s*bearer\s+(.+)/i)
    return match ? match[1] : authValue
  }, [authValue])
  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token])

  useEffect(() => {
    if (!authValue) {
      navigate('/login', { replace: true })
      return
    }
    ;(async () => {
      try {
        const me = await fetch('/api/auth/me', { headers: authHeader })
        if (!me.ok) throw new Error('Unable to verify session')
        const user = await me.json()
        const role = user.role?.name || user.role
        if (role !== 'fisherfolk') {
          navigate(role === 'coast_guard' ? '/coast-guard' : '/admin', { replace: true })
        }
      } catch (err: any) {
        setError(err?.message || 'Session expired')
        localStorage.removeItem('auth')
        navigate('/login', { replace: true })
      }
    })()
  }, [authValue, authHeader, navigate])

  useEffect(() => {
    async function loadDevices() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/fisherfolk/devices', { headers: authHeader })
        if (!res.ok) throw new Error('Failed to load trackers')
        const data: DeviceInfo[] = await res.json()
        setDevices(data)
        setTrackers((prev) => {
          const next: Record<number, TrackerState> = { ...prev }
          data.forEach((d) => {
            next[d.id] = next[d.id] ? { ...next[d.id], device: d } : { device: d }
          })
          return next
        })
      } catch (err: any) {
        setError(err?.message || 'Unable to load trackers')
      } finally {
        setLoading(false)
      }
    }
    loadDevices()
  }, [authHeader])

  useEffect(() => {
    if (!token || devices.length === 0) return
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws/socket?token=${encodeURIComponent(token)}`)

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as { positions?: PositionPayload[] }
        if (!data.positions?.length) return
        setTrackers((prev) => {
          const next = { ...prev }
          data.positions!.forEach((p) => {
            if (!devices.find((d) => d.id === p.device_id)) return
            const existing = next[p.device_id] || { device: { id: p.device_id } }
            next[p.device_id] = { ...existing, lastPosition: p }
          })
          return next
        })
      } catch (err) {
        console.error(err)
      }
    }

    ws.onerror = () => setError((prev) => prev || 'Live updates unavailable')
    ws.onclose = () => ws.close()

    return () => ws.close()
  }, [devices.length, token])

  useEffect(() => {
    async function loadGeofences() {
      try {
        const res = await fetch('/api/fisherfolk/geofences', authHeader ? { headers: authHeader } : undefined)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.detail || 'Failed to load geofences')
        }
        const data = await res.json()
        const shapes: GeofenceShape[] = []
        for (const g of Array.isArray(data) ? data : []) {
          const coords = parseWktPolygon(g.area)
          if (coords) {
            shapes.push({ id: g.id, name: g.name || `Geofence ${g.id}`, polygon: coords })
          }
        }
        setGeofences(shapes)
      } catch (err) {
        console.error(err)
      }
    }
    loadGeofences()
  }, [authHeader])

  const privacyText = {
    en: {
      title: 'Privacy notice',
      summary: 'We collect only what is needed to keep you safe at sea.',
      bullets: [
        'Location pings from your issued tracker are shared with authorized coast guards to coordinate patrols and rescues.',
        'Device identifiers, account details, and incident logs are retained for investigations, compliance, and service improvements.',
        'You can request data review or removal where applicable by contacting your local coordinator.',
        'Data is encrypted in transit. Access is role-based and monitored.',
      ],
      consent: 'By continuing, you consent to the collection and use of your data for safety and operational purposes.',
    },
    ceb: {
      title: 'Pahibalo sa pagpanalipod sa datos',
      summary: 'Gakuha lang kami sa datos nga gikinahanglan para sa imong kaluwasan sa dagat.',
      bullets: [
        'Ang lokasyon gikan sa imong tracker ipaambit lamang sa otorisadong coast guard para sa patrol ug pagtabang kung adunay emerhensya.',
        'Ang ID sa device, account details, ug mga log sa insidente itago alang sa imbestigasyon, pagsunod sa balaod, ug pagpaayo sa serbisyo.',
        'Pwede ka mangayo og review o pagpahawa sa datos kung angay, pinaagi sa imong lokal nga coordinator.',
        'Ang datos gi-encrypt samtang gipadala; ang access kontrolado ug gimonitor.',
      ],
      consent: 'Sa pagpadayon, mouyon ka nga gamiton ang imong datos alang sa kaluwasan ug operasyon.',
    },
  }

  const currentPrivacy = privacyText[privacyLang]

  const closePrivacy = () => {
    setShowPrivacy(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem(privacyKey, new Date().toISOString())
    }
  }

  const trackerList = useMemo(() => devices.map((d) => trackers[d.id] || { device: d }), [devices, trackers])

  useEffect(() => {
    if (autoCentered) return
    const firstWithPosition = trackerList.find((t) => t.lastPosition)
    if (firstWithPosition?.lastPosition) {
      setMapTarget([firstWithPosition.lastPosition.latitude, firstWithPosition.lastPosition.longitude])
      setAutoCentered(true)
    }
  }, [autoCentered, trackerList])

  const derivedCenter = useMemo(() => {
    if (mapTarget) return mapTarget
    const withPositions = trackerList.map((t) => t.lastPosition).filter(Boolean) as PositionPayload[]
    if (withPositions.length) return [withPositions[0].latitude, withPositions[0].longitude] as [number, number]
    return defaultCenter
  }, [mapTarget, trackerList])

  const handleSelectTracker = (id: number) => {
    setSelectedId(id)
    setSidebarOpen(false)
    const pos = trackers[id]?.lastPosition
    if (pos) setMapTarget([pos.latitude, pos.longitude])
  }

  const ensureDefaultRange = () => {
    const end = new Date()
    const start = new Date(end.getTime() - 12 * 60 * 60 * 1000)
    const startStr = toLocalInputValue(start)
    const endStr = toLocalInputValue(end)
    setHistoryStart((prev) => prev || startStr)
    setHistoryEnd((prev) => prev || endStr)
    return { startStr, endStr }
  }

  const fetchHistory = async (deviceId: number, startOverride?: string, endOverride?: string) => {
    const { startStr, endStr } = ensureDefaultRange()
    const startVal = (startOverride ?? historyStart ?? startStr).trim()
    const endVal = (endOverride ?? historyEnd ?? endStr).trim()

    setHistoryDeviceId(deviceId)
    setHistoryLoading(true)
    setHistoryError(null)
    setHistorySelectedPoint(null)

    if (!startVal || !endVal) {
      setHistoryError('Please provide both start and end times.')
      setHistoryLoading(false)
      return
    }

    const startDate = new Date(startVal)
    const endDate = new Date(endVal)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setHistoryError('Please enter valid start and end times.')
      setHistoryLoading(false)
      return
    }
    if (startDate > endDate) {
      setHistoryError('Start time must be before end time.')
      setHistoryLoading(false)
      return
    }

    const params = new URLSearchParams({ device_id: String(deviceId) })
    params.append('start', startDate.toISOString())
    params.append('end', endDate.toISOString())

    try {
      const res = await fetch(`/api/fisherfolk/history?${params.toString()}`, { headers: authHeader })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || 'Unable to load history')
      }
      const points: HistoryPoint[] = await res.json()
      setHistory((prev) => ({ ...prev, [deviceId]: points }))
      if (points.length) {
        const last = points[points.length - 1]
        setMapTarget([last.latitude, last.longitude])
      } else {
        setHistoryError('No history in the selected range')
      }
    } catch (err: any) {
      setHistoryError(err?.message || 'Unable to load history')
      setHistory((prev) => ({ ...prev, [deviceId]: [] }))
    } finally {
      setHistoryLoading(false)
    }
  }

  const clearHistoryView = () => {
    setHistoryDeviceId(null)
    setHistorySelectedPoint(null)
    setHistoryError(null)
    setHistory((prev) => (historyDeviceId ? { ...prev, [historyDeviceId]: [] } : prev))
    setHistoryStart('')
    setHistoryEnd('')
    const livePos = selectedId ? trackers[selectedId]?.lastPosition : null
    if (livePos) setMapTarget([livePos.latitude, livePos.longitude])
  }

  const activeHistory = historyDeviceId ? history[historyDeviceId] || [] : []
  const selectedTracker = selectedId ? trackers[selectedId] : null
  const selectedStatus = statusLabel(selectedTracker?.lastPosition?.timestamp)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen((prev) => !prev)}>
            <Menu className="h-5 w-5 text-white" />
          </Button>
          <img src="/icons/bantay-icon.svg" alt="Bantay" className="h-10 w-auto" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Bantay</p>
            <p className="text-sm font-semibold text-white">Fisherfolk Map</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="border-white/20 text-white"
            aria-label="Refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="border-white/20 bg-slate-800 text-white"
            aria-label="Account"
            onClick={() => navigate('/fisherfolk/account')}
          >
            <User className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            aria-label="Logout"
            onClick={() => { localStorage.removeItem('auth'); navigate('/login') }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative flex flex-1 bg-slate-950 overflow-hidden">
        <aside
          className={`absolute z-30 h-full w-80 max-w-full border-r border-white/10 bg-slate-900/85 backdrop-blur transition-transform duration-200 lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">My trackers</p>
              <p className="text-sm font-semibold text-white">Assigned devices</p>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <PanelLeftClose className="h-5 w-5 text-white" />
            </Button>
          </div>

          <div className="px-4 py-3">
            <Card className="border-white/10 bg-slate-900/90">
              <CardContent className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Trackers</p>
                  <p className="text-xl font-semibold text-white">{devices.length}</p>
                </div>
                <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-200">Live feed</Badge>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-300" /> Visible only to authorized responders
            </span>
          </div>

          <ScrollArea className="h-[calc(100%-180px)] px-3 pb-6">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-slate-300">
                <Activity className="mr-2 h-4 w-4 animate-spin" /> Loading trackers...
              </div>
            ) : trackerList.length ? (
              <div className="space-y-3">
                {trackerList.map((t) => {
                  const pos = t.lastPosition
                  const status = statusLabel(pos?.timestamp)
                  const isSelected = selectedId === t.device.id
                  return (
                    <Card
                      key={t.device.id}
                      className={`cursor-pointer border-white/10 bg-slate-900/80 transition hover:border-cyan-400/40 ${
                        isSelected ? 'border-cyan-400/60 ring-1 ring-cyan-400/30' : ''
                      }`}
                      onClick={() => handleSelectTracker(t.device.id)}
                    >
                      <CardContent className="space-y-2 py-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-white">{t.device.name || `Tracker ${t.device.id}`}</p>
                            <p className="text-xs text-slate-400">UID: {t.device.unique_id || '—'}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`border-white/10 ${
                              status.tone === 'emerald'
                                ? 'bg-emerald-500/15 text-emerald-100'
                                : status.tone === 'amber'
                                  ? 'bg-amber-500/15 text-amber-100'
                                  : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            {status.text}
                          </Badge>
                        </div>
                        {pos?.latitude && (
                          <p className="flex items-center gap-2 text-xs text-slate-300">
                            <MapPin className="h-4 w-4 text-cyan-300" />
                            {pos.latitude.toFixed(4)}, {pos.longitude.toFixed(4)}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> {relativeTime(pos?.timestamp)}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-cyan-200 hover:text-cyan-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              const { startStr, endStr } = ensureDefaultRange()
                              fetchHistory(t.device.id, startStr, endStr)
                              handleSelectTracker(t.device.id)
                            }}
                            disabled={historyLoading && historyDeviceId === t.device.id}
                          >
                            <HistoryIcon className="mr-1 h-3 w-3" /> {historyLoading && historyDeviceId === t.device.id ? 'Loading' : 'History'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Alert className="border-white/10 bg-slate-900/70 text-slate-200">
                <AlertDescription>No trackers assigned yet.</AlertDescription>
              </Alert>
            )}
          </ScrollArea>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-20 bg-slate-950/60 backdrop-blur lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        <div className="relative flex-1 h-">
          <MapContainer
            center={derivedCenter}
            zoom={12}
            zoomControl={false}
            className="h-full w-full z-0"
            preferCanvas
            scrollWheelZoom
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {geofences.map((g) => (
              <Polygon
                key={g.id}
                positions={g.polygon}
                pathOptions={{ color: '#22d3ee', weight: 2, opacity: 0.7, fillOpacity: 0.05 }}
                interactive={false}
              />
            ))}
            {trackerList.map((t) => {
              const pos = t.lastPosition
              if (!pos) return null
              const status = statusLabel(pos.timestamp)
              const color = status.tone === 'emerald' ? '#34d399' : status.tone === 'amber' ? '#fbbf24' : '#94a3b8'
              return (
                <Marker
                  key={t.device.id}
                  position={[pos.latitude, pos.longitude]}
                  icon={markerIcon(color, pos.course || 0)}
                  eventHandlers={{
                    click: () => handleSelectTracker(t.device.id),
                  }}
                />
              )
            })}

            {activeHistory.length > 1 && (
              <Polyline
                positions={activeHistory.map((p) => [p.latitude, p.longitude])}
                pathOptions={{ color: '#22d3ee', weight: 4, opacity: 0.8 }}
              />
            )}

            {activeHistory.map((p) => (
              <Marker
                key={p.id}
                position={[p.latitude, p.longitude]}
                icon={historyMarkerIcon(historySelectedPoint?.id === p.id ? '#a855f7' : '#22d3ee')}
                eventHandlers={{
                  click: () => {
                    setHistorySelectedPoint(p)
                    setMapTarget([p.latitude, p.longitude])
                  },
                }}
              />
            ))}

            {mapTarget && <FlyToPosition position={mapTarget} />}
          </MapContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3">
            <div className="pointer-events-auto flex max-h-[46vh] flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/90 p-3 text-xs shadow-xl">
              {error && (
                <Alert variant="destructive" className="border-red-500/40 bg-red-500/10 text-red-50">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Focused tracker</p>
                  <p className="text-sm font-semibold text-white">
                    {selectedTracker?.device.name || (selectedId ? `Tracker ${selectedId}` : 'Select a tracker')}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`border-white/10 ${
                    selectedStatus.tone === 'emerald'
                      ? 'bg-emerald-500/15 text-emerald-100'
                      : selectedStatus.tone === 'amber'
                        ? 'bg-amber-500/15 text-amber-100'
                        : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  {selectedStatus.text}
                </Badge>
              </div>

              {selectedTracker?.lastPosition ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-slate-900/70 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Location</p>
                    <p className="mt-1 text-[13px] font-semibold text-white flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-cyan-300" />
                      {selectedTracker.lastPosition.latitude.toFixed(4)}, {selectedTracker.lastPosition.longitude.toFixed(4)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/70 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Updated</p>
                    <p className="mt-1 text-[13px] font-semibold text-white">{relativeTime(selectedTracker.lastPosition.timestamp)}</p>
                    <p className="text-[10px] text-slate-400">{formatGMT8(selectedTracker.lastPosition.timestamp)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-900/70 p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Course</p>
                    <p className="mt-1 text-[13px] font-semibold text-white">{selectedTracker.lastPosition.course ?? '—'}°</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">No recent position yet.</p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-100">Live map</Badge>
                <span className="flex items-center gap-1 text-slate-400"><Smartphone className="h-3 w-3" /> Keep your device powered</span>
                <span className="flex items-center gap-1 text-slate-400"><Shield className="h-3 w-3" /> Only you and coast guard can view</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="history-start" className="text-xs text-slate-300">From</Label>
                  <Input
                    id="history-start"
                    type="datetime-local"
                    value={historyStart}
                    onChange={(e) => setHistoryStart(e.target.value)}
                    className="h-8 w-40 bg-slate-900 text-white text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="history-end" className="text-xs text-slate-300">To</Label>
                  <Input
                    id="history-end"
                    type="datetime-local"
                    value={historyEnd}
                    onChange={(e) => setHistoryEnd(e.target.value)}
                    className="h-8 w-40 bg-slate-900 text-white text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  disabled={!selectedId || historyLoading || !historyStart.trim() || !historyEnd.trim()}
                  onClick={() => {
                    if (!selectedId) return
                    fetchHistory(selectedId)
                  }}
                >
                  {historyLoading ? 'Loading…' : 'Load history'}
                </Button>
                {historyDeviceId && (
                  <Button size="sm" variant="ghost" className="text-slate-200" onClick={clearHistoryView}>
                    Close history
                  </Button>
                )}
                {historyError && <p className="text-xs text-red-300">{historyError}</p>}
              </div>

              {historySelectedPoint && (
                <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2 text-xs text-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">History point</span>
                    <span className="text-[10px] text-slate-400">{relativeTime(historySelectedPoint.timestamp)}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[13px]"><MapPin className="h-3 w-3 text-cyan-300" />{historySelectedPoint.latitude.toFixed(4)}, {historySelectedPoint.longitude.toFixed(4)}</p>
                  <p className="text-[11px] text-slate-400">{formatGMT8(historySelectedPoint.timestamp)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={showPrivacy}
        onOpenChange={(open) => {
          setShowPrivacy(open)
          if (!open) closePrivacy()
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="z-[1200] w-[94vw] max-w-sm border-white/10 bg-slate-900/95 text-slate-100 sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>{currentPrivacy.title}</span>
              <Button
                size="sm"
                variant="ghost"
                className="border border-white/10 text-xs"
                onClick={() => setPrivacyLang((prev) => (prev === 'en' ? 'ceb' : 'en'))}
              >
                {privacyLang === 'en' ? 'Cebuano' : 'English'}
              </Button>
            </DialogTitle>
            <DialogDescription className="text-slate-300">{currentPrivacy.summary}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-200">
            <ul className="list-disc space-y-2 pl-5">
              {currentPrivacy.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-400">{currentPrivacy.consent}</p>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closePrivacy} className="bg-white text-slate-900 hover:bg-slate-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
