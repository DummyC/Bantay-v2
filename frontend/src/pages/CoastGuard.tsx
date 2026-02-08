import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip as LeafletTooltip,
  useMap,
} from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import {
  Activity,
  AlertTriangle,
  Bell,
  MapPin,
  Power,
  Radio,
  Search,
  ShieldCheck,
  Siren,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'

type DeviceInfo = {
  id: number
  traccar_device_id?: number | null
  unique_id?: string | null
  name?: string | null
  user_id?: number | null
  sim_number?: string | null
}

type PositionPayload = {
  id: number
  device_id: number
  latitude: number
  longitude: number
  speed?: number | null
  timestamp?: string | null
  battery_percent?: number | null
  attributes?: Record<string, unknown> | null
}

type EventPayload = {
  id: number
  device_id: number
  event_type: string
  timestamp?: string | null
  attributes?: Record<string, unknown> | null
}

type TrackerState = {
  device: DeviceInfo
  lastPosition?: PositionPayload
  lastEvent?: EventPayload
  batteryPercent?: number | null
  medicalRecord?: string | null
  medicalError?: string | null
  medicalLoaded?: boolean
  medicalLoading?: boolean
}

type WsMessage = {
  positions?: PositionPayload[]
  events?: EventPayload[]
}

const defaultCenter: [number, number] = [12.8797, 121.774]
const staleMs = 5 * 60 * 1000

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

function isSosEvent(ev: EventPayload): boolean {
  const type = ev.event_type?.toLowerCase() || ''
  const attr = typeof ev.attributes?.alarm === 'string' ? ev.attributes.alarm.toLowerCase() : ''
  return type.includes('sos') || attr.includes('sos')
}

function isWithin24Hours(ts?: string | null) {
  if (!ts) return false
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t <= 24 * 60 * 60 * 1000
}

function relativeTime(ts?: string | null): string {
  if (!ts) return 'No data'
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return 'No data'
  const diff = Date.now() - t
  if (diff < 60 * 1000) return 'Just now'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / (24 * 3600000))}d ago`
}

function eventLabel(eventType: string) {
  if (!eventType) return 'Event'
  if (eventType.startsWith('alarm')) return 'SOS'
  if (eventType === 'deviceOnline') return 'Online'
  if (eventType === 'deviceOffline') return 'Offline'
  if (eventType === 'geofenceExit') return 'Geofence exit'
  if (eventType === 'geofenceEnter') return 'Geofence enter'
  return eventType
}

function trackerStatus(t: TrackerState): 'online' | 'offline' | 'unknown' {
  if (t.lastEvent?.event_type === 'deviceOffline') return 'offline'
  if (t.lastEvent?.event_type === 'deviceOnline') return 'online'
  const ts = t.lastPosition?.timestamp ? new Date(t.lastPosition.timestamp).getTime() : null
  if (ts && !Number.isNaN(ts)) {
    if (Date.now() - ts <= staleMs) return 'online'
    return 'offline'
  }
  return 'unknown'
}

function statusColor(status: 'online' | 'offline' | 'unknown') {
  if (status === 'online') return 'text-emerald-400'
  if (status === 'offline') return 'text-amber-400'
  return 'text-slate-400'
}

function statusBg(status: 'online' | 'offline' | 'unknown') {
  if (status === 'online') return 'bg-emerald-500/15 text-emerald-300'
  if (status === 'offline') return 'bg-amber-500/15 text-amber-300'
  return 'bg-slate-700/60 text-slate-200'
}

function FlyToPosition({ position }: { position?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, 11, { duration: 0.6 })
    }
  }, [position, map])
  return null
}

export default function CoastGuard() {
  const navigate = useNavigate()
  const [trackers, setTrackers] = useState<Record<number, TrackerState>>({})
  const [events, setEvents] = useState<EventPayload[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [loading, setLoading] = useState(true)

  const authValue = typeof window !== 'undefined' ? localStorage.getItem('auth') : null
  const token = useMemo(() => {
    if (!authValue) return ''
    const match = authValue.match(/^\s*bearer\s+(.+)/i)
    return match ? match[1].trim() : authValue.trim()
  }, [authValue])
  const authHeader = token ? `Bearer ${token}` : null

  useEffect(() => {
    if (!authValue) navigate('/')
  }, [authValue, navigate])

  useEffect(() => {
    async function loadDevices() {
      try {
        const res = await fetch('/api/coastguard/devices', {
          headers: authHeader ? { Authorization: authHeader } : undefined,
        })
        if (!res.ok) throw new Error('Failed to load devices')
        const devs: DeviceInfo[] = await res.json()
        setTrackers((prev) => {
          const next = { ...prev }
          devs.forEach((d) => {
            next[d.id] = next[d.id] ? { ...next[d.id], device: d } : { device: d }
          })
          return next
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadDevices()
  }, [authHeader])

  useEffect(() => {
    if (!token) {
      setConnectionState('error')
      return
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/ws/socket?token=${encodeURIComponent(token)}`)

    ws.onopen = () => setConnectionState('connected')
    ws.onerror = () => setConnectionState('error')
    ws.onclose = () => setConnectionState('error')
    ws.onmessage = (evt) => {
      try {
        const data: WsMessage = JSON.parse(evt.data)
        const incomingPositions = data.positions || []
        const incomingEvents = data.events || []

        if (incomingPositions.length || incomingEvents.length) {
          setLoading(false)
        }

        setTrackers((prev) => {
          const next = { ...prev }
          incomingPositions.forEach((p) => {
            const existing = next[p.device_id] || { device: { id: p.device_id } }
            next[p.device_id] = {
              ...existing,
              lastPosition: p,
              batteryPercent: p.battery_percent ?? existing.batteryPercent,
            }
          })
          incomingEvents.forEach((ev) => {
            const existing = next[ev.device_id] || { device: { id: ev.device_id } }
            next[ev.device_id] = {
              ...existing,
              lastEvent: ev,
            }
          })
          return next
        })

        if (incomingEvents.length) {
          const sos = incomingEvents.find((e) => isSosEvent(e))
          if (sos) {
            setSelectedId(sos.device_id)
            setDetailOpen(true)
          }
        }

        if (incomingEvents.length) {
          setEvents((prev) => {
            const merged = [...prev, ...incomingEvents]
            return merged.slice(-400)
          })
        }
      } catch (err) {
        console.error(err)
        setConnectionState('error')
      }
    }

    return () => ws.close()
  }, [token])

  useEffect(() => {
    if (!detailOpen || selectedId === null) return
    const deviceId = selectedId
    const tracker = trackers[deviceId]
    if (!tracker || tracker.medicalLoaded || tracker.medicalLoading) return
    const userId = tracker.device.user_id
    if (!userId) return

    setTrackers((prev) => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] || { device: tracker.device }), medicalLoading: true },
    }))

    async function loadMedical() {
      try {
        const res = await fetch(`/api/coastguard/users?user_id=${userId}`, {
          headers: authHeader ? { Authorization: authHeader } : undefined,
        })
        if (!res.ok) throw new Error(res.status === 403 ? 'Permission denied' : 'Unable to load medical record')
        const body = await res.json()
        const med = Array.isArray(body) && body.length > 0 ? body[0].medical_record : null
        setTrackers((prev) => ({
          ...prev,
          [deviceId]: {
            ...(prev[deviceId] || { device: tracker.device }),
            medicalRecord: med || null,
            medicalLoaded: true,
            medicalLoading: false,
            medicalError: null,
          },
        }))
      } catch (err: any) {
        setTrackers((prev) => ({
          ...prev,
          [deviceId]: {
            ...(prev[deviceId] || { device: tracker.device }),
            medicalLoaded: true,
            medicalLoading: false,
            medicalError: err?.message || 'Unable to load medical record',
          },
        }))
      }
    }

    loadMedical()
  }, [authHeader, detailOpen, selectedId, trackers])

  const trackerList = useMemo(() => {
    return Object.values(trackers)
      .map((t) => ({ ...t, status: trackerStatus(t) }))
      .filter((t) => {
        if (!search) return true
        const term = search.toLowerCase()
        return (
          (t.device.name || '').toLowerCase().includes(term) ||
          (t.device.unique_id || '').toLowerCase().includes(term) ||
          String(t.device.id || '').includes(term)
        )
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'online' ? -1 : 1
        const aName = a.device.name || ''
        const bName = b.device.name || ''
        return aName.localeCompare(bName)
      })
  }, [search, trackers])

  const firstPosition = useMemo(() => {
    const withPos = trackerList.find((t) => t.lastPosition)
    if (withPos?.lastPosition) {
      return [withPos.lastPosition.latitude, withPos.lastPosition.longitude] as [number, number]
    }
    return null
  }, [trackerList])

  const selectedTracker = selectedId ? trackers[selectedId] : null
  const selectedPosition = selectedTracker?.lastPosition
    ? ([selectedTracker.lastPosition.latitude, selectedTracker.lastPosition.longitude] as [number, number])
    : undefined

  const activeCount = trackerList.filter((t) => t.status === 'online').length
  const sos24h = events.filter((e) => isSosEvent(e) && isWithin24Hours(e.timestamp)).length
  const geofence24h = events.filter((e) => e.event_type === 'geofenceExit' && isWithin24Hours(e.timestamp)).length

  const alertsForModal = events
    .filter((e) => isSosEvent(e) || e.event_type === 'geofenceExit' || e.event_type === 'deviceOffline')
    .sort((a, b) => (new Date(b.timestamp || 0).getTime() || 0) - (new Date(a.timestamp || 0).getTime() || 0))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex h-screen">
        <aside className="w-full max-w-[360px] border-r border-white/5 bg-slate-900/70 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coast Guard</p>
              <p className="text-base font-semibold text-white">Live Tracker Console</p>
            </div>
            <Badge className={`px-3 py-1 text-xs ${
              connectionState === 'connected'
                ? 'bg-emerald-500/20 text-emerald-200'
                : connectionState === 'connecting'
                ? 'bg-amber-500/20 text-amber-100'
                : 'bg-red-500/25 text-red-100'
            }`}>
              {connectionState === 'connected' ? 'Live' : connectionState === 'connecting' ? 'Connecting' : 'Offline'}
            </Badge>
          </div>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search devices"
                className="bg-slate-900/60 pl-9 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <Separator className="bg-white/5" />

          <ScrollArea className="h-[calc(100vh-160px)] px-2">
            <div className="space-y-2 py-3">
              {trackerList.map((t) => {
                const status = t.status
                const lastTs = t.lastPosition?.timestamp || t.lastEvent?.timestamp
                const isSos = events.some((e) => e.device_id === t.device.id && isSosEvent(e) && isWithin24Hours(e.timestamp))
                return (
                  <button
                    key={t.device.id}
                    onClick={() => {
                      setSelectedId(t.device.id)
                      setDetailOpen(true)
                    }}
                    className={`w-full rounded-md border border-white/5 bg-slate-900/60 p-3 text-left transition hover:border-white/15 hover:bg-slate-900/80 ${
                      selectedId === t.device.id ? 'ring-1 ring-cyan-400/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Circle status={status} />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {t.device.name || `Device ${t.device.id}`}
                          </p>
                          <p className="text-xs text-slate-400">{t.device.unique_id || 'No unique id'}</p>
                        </div>
                      </div>
                      <Badge className={`${statusBg(status)} border-0`}>{status === 'unknown' ? 'Unknown' : status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {t.lastPosition ? `${t.lastPosition.latitude.toFixed(3)}, ${t.lastPosition.longitude.toFixed(3)}` : 'No fix'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Radio className="h-3 w-3" />
                        {relativeTime(lastTs)}
                      </span>
                      {typeof t.batteryPercent === 'number' && (
                        <span className="inline-flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {Math.round(t.batteryPercent)}%
                        </span>
                      )}
                    </div>
                    {isSos && (
                      <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-red-300">
                        <AlertTriangle className="h-3.5 w-3.5" /> Recent SOS
                      </div>
                    )}
                  </button>
                )
              })}

              {!trackerList.length && !loading && (
                <div className="rounded-md border border-white/5 bg-slate-900/60 p-4 text-sm text-slate-400">
                  No devices found.
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="relative flex-1">
          {connectionState === 'error' && (
            <div className="absolute left-4 top-4 z-20 max-w-md">
              <Alert variant="destructive" className="bg-red-500/10 text-red-100">
                <AlertDescription>
                  Websocket connection lost. Ensure you are logged in and the backend is running.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <MapContainer
            center={firstPosition || defaultCenter}
            zoom={6}
            className="h-full w-full"
            zoomControl={false}
            preferCanvas
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {(selectedPosition || firstPosition) && <FlyToPosition position={selectedPosition || firstPosition || undefined} />}

            {trackerList
              .filter((t) => t.lastPosition)
              .map((t) => {
                const pos = t.lastPosition!
                const status = t.status
                const sosFlag = events.some((e) => e.device_id === t.device.id && isSosEvent(e) && isWithin24Hours(e.timestamp))
                const color = sosFlag ? '#f87171' : status === 'online' ? '#22c55e' : status === 'offline' ? '#f59e0b' : '#94a3b8'
                return (
                  <CircleMarker
                    key={t.device.id}
                    center={[pos.latitude, pos.longitude]}
                    radius={sosFlag ? 12 : 9}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
                    eventHandlers={{
                      click: () => {
                        setSelectedId(t.device.id)
                        setDetailOpen(true)
                      },
                    }}
                  >
                    <LeafletTooltip direction="top" offset={[0, -4]}>
                      <div className="text-sm font-semibold text-slate-900">
                        {t.device.name || `Device ${t.device.id}`}
                      </div>
                      <div className="text-xs text-slate-800">{status}</div>
                    </LeafletTooltip>
                  </CircleMarker>
                )
              })}
          </MapContainer>

          <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-6">
            <div className="pointer-events-auto flex w-full max-w-xl flex-col items-end gap-3">
              <div className="grid w-full grid-cols-3 gap-3">
                <StatCard
                  icon={<ShieldCheck className="h-5 w-5 text-emerald-300" />}
                  label="Active trackers"
                  value={activeCount}
                  tone="emerald"
                />
                <StatCard
                  icon={<Siren className="h-5 w-5 text-red-300" />}
                  label="SOS (24h)"
                  value={sos24h}
                  tone="red"
                />
                <StatCard
                  icon={<AlertTriangle className="h-5 w-5 text-amber-200" />}
                  label="Geofence exits (24h)"
                  value={geofence24h}
                  tone="amber"
                />
              </div>

              <Button
                size="lg"
                variant="secondary"
                className="flex items-center gap-2 bg-slate-900/80 text-slate-100"
                onClick={() => setAlertsOpen(true)}
              >
                <Bell className="h-4 w-4" /> View alerts
              </Button>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Alerts</DialogTitle>
            <DialogDescription className="text-slate-400">Recent SOS, geofence exits, and offline notices.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-2">
            <div className="space-y-2">
              {alertsForModal.map((e) => (
                <Card key={e.id} className="border-white/5 bg-slate-900/60">
                  <CardContent className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                      <Badge
                        className={`border-0 px-2 py-1 text-xs ${isSosEvent(e) ? 'bg-red-500/20 text-red-200' : e.event_type === 'geofenceExit' ? 'bg-amber-500/20 text-amber-100' : 'bg-slate-700 text-slate-200'}`}
                      >
                        {eventLabel(e.event_type)}
                      </Badge>
                      <div>
                        <p className="text-sm font-semibold">Device {e.device_id}</p>
                        <p className="text-xs text-slate-400">{relativeTime(e.timestamp)}</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(e.timestamp || '').toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!alertsForModal.length && <p className="text-sm text-slate-400">No alerts yet.</p>}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl bg-slate-950 text-slate-100">
          {selectedTracker ? (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedTracker.device.name || `Device ${selectedTracker.device.id}`}
                  <Badge className={`${statusBg(trackerStatus(selectedTracker))} border-0`}>
                    {trackerStatus(selectedTracker)}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  Unique ID: {selectedTracker.device.unique_id || 'N/A'}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4">
                <Card className="border-white/5 bg-slate-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Location</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-200">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedTracker.lastPosition
                        ? `${selectedTracker.lastPosition.latitude.toFixed(4)}, ${selectedTracker.lastPosition.longitude.toFixed(4)}`
                        : 'No fix yet'}
                    </p>
                    <p className="flex items-center gap-2">
                      <Radio className="h-4 w-4" />
                      {relativeTime(selectedTracker.lastPosition?.timestamp || selectedTracker.lastEvent?.timestamp)}
                    </p>
                    <p className="flex items-center gap-2">
                      <Power className="h-4 w-4" />
                      Battery: {typeof selectedTracker.batteryPercent === 'number' ? `${Math.round(selectedTracker.batteryPercent)}%` : 'Unknown'}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-white/5 bg-slate-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recent events</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-200">
                    {events
                      .filter((e) => e.device_id === selectedTracker.device.id)
                      .slice(-5)
                      .reverse()
                      .map((e) => (
                        <div key={e.id} className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            {isSosEvent(e) ? <Siren className="h-4 w-4 text-red-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                            {eventLabel(e.event_type)}
                          </span>
                          <span className="text-xs text-slate-400">{relativeTime(e.timestamp)}</span>
                        </div>
                      ))}
                    {!events.some((e) => e.device_id === selectedTracker.device.id) && (
                      <p className="text-sm text-slate-400">No events yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-white/5 bg-slate-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Fisherfolk medical history</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedTracker.medicalLoading && <p className="text-sm text-slate-400">Loading medical record...</p>}
                  {selectedTracker.medicalError && (
                    <p className="text-sm text-red-300">{selectedTracker.medicalError}</p>
                  )}
                  {!selectedTracker.medicalLoading && !selectedTracker.medicalError && (
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">
                      {selectedTracker.medicalRecord || 'No medical record available.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Select a tracker to view details.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Circle({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(status).replace('text-', 'bg-')}`} />
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'emerald' | 'red' | 'amber'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-500/15 text-emerald-50'
      : tone === 'red'
      ? 'bg-red-500/15 text-red-50'
      : 'bg-amber-500/15 text-amber-50'
  return (
    <Card className={`border-0 ${toneClass}`}>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-white/70">{label}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  )
}
