import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapContainer,
  TileLayer,
  Marker,
  Tooltip as LeafletTooltip,
  Polyline,
  useMap,
} from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Activity,
  AlertTriangle,
  Bell,
  Clock3,
  Loader2,
  Lock,
  MapPin,
  Map as MapIcon,
  Power,
  Radio,
  Search,
  ShieldCheck,
  Siren,
  UserCircle,
  Waypoints,
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
  course?: number | null
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
  resolved?: boolean
}

type TrackerState = {
  device: DeviceInfo
  lastPosition?: PositionPayload
  lastEvent?: EventPayload
  batteryPercent?: number | null
  fisherName?: string | null
  medicalRecord?: string | null
  medicalError?: string | null
  medicalLoaded?: boolean
  medicalLoading?: boolean
}

type WsMessage = {
  positions?: PositionPayload[]
  events?: EventPayload[]
}

const defaultCenter: [number, number] = [9.7494, 124.573]
const staleMs = 5 * 60 * 1000

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
  if (diff < 60 * 1000) return 'Just now'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / (24 * 3600000))}d ago`
}

function formatGMT8(ts?: string | null, fallback = 'N/A') {
  const parsed = parseUtc(ts)
  if (parsed === null) return fallback
  return new Date(parsed).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
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
  const posTs = t.lastPosition?.timestamp ? new Date(t.lastPosition.timestamp).getTime() : null
  if (posTs && !Number.isNaN(posTs) && Date.now() - posTs <= staleMs) {
    // A recent position beats an offline event, even if deviceOnline wasn't sent
    return 'online'
  }
  if (t.lastEvent?.event_type === 'deviceOffline') return 'online'
  if (t.lastEvent?.event_type === 'deviceOnline') return 'online'
  if (posTs && !Number.isNaN(posTs)) return 'offline'
  return 'unknown'
}

function batteryFromPayload(p: PositionPayload): number | null {
  if (typeof p.battery_percent === 'number') return p.battery_percent
  const attrs = p.attributes as Record<string, unknown> | null | undefined
  if (!attrs) return null
  for (const key of ['battery', 'batteryLevel', 'battery_percent', 'batteryPercent']) {
    const val = attrs[key]
    if (typeof val === 'number') return val
    if (typeof val === 'string') {
      const num = parseFloat(val)
      if (!Number.isNaN(num)) return num
    }
  }
  return null
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

function trackerIcon(color: string, heading: number) {
  const circleSize = 22
  return L.divIcon({
    className: 'tracker-icon',
    iconSize: [circleSize, circleSize],
    iconAnchor: [circleSize / 2, circleSize / 2],
    html: `
      <div style="position:relative;width:${circleSize}px;height:${circleSize}px;transform: rotate(${heading}deg);">
        <div style="position:absolute;inset:0;border:2px solid ${color};border-radius:50%;box-sizing:border-box;"></div>
        <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid ${color};"></div>
        <div style="position:absolute;inset:3px;border-radius:50%;background:#0f172a;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;box-shadow:0 0 0 2px ${color};">
          ⛵
        </div>
      </div>
    `,
  })
}

function FlyToPosition({ position, onDone, zoom = 11 }: { position?: [number, number]; onDone?: () => void; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, zoom, { duration: 0.6 })
      onDone?.()
    }
  }, [position, map, onDone, zoom])
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
  const [initialCentered, setInitialCentered] = useState(false)
  const [activeAlert, setActiveAlert] = useState<{ eventId: number; deviceId: number } | null>(null)
  const [alertCenter, setAlertCenter] = useState<[number, number] | null>(null)
  const [dismissOpen, setDismissOpen] = useState(false)
  const [resolutionChoice, setResolutionChoice] = useState<'rescued' | 'false_alarm' | 'other'>('rescued')
  const [customResolution, setCustomResolution] = useState('')
  const [dismissNotes, setDismissNotes] = useState('')
  const [dismissPassword, setDismissPassword] = useState('')
  const [dismissError, setDismissError] = useState<string | null>(null)
  const [dismissLoading, setDismissLoading] = useState(false)
  const [historyHours, setHistoryHours] = useState(12)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyPoints, setHistoryPoints] = useState<PositionPayload[]>([])
  const [historyFocusId, setHistoryFocusId] = useState<number | null>(null)
  const [historySelectedPoint, setHistorySelectedPoint] = useState<PositionPayload | null>(null)

  const authValue = typeof window !== 'undefined' ? localStorage.getItem('auth') : null
  const token = useMemo(() => {
    if (!authValue) return ''
    const match = authValue.match(/^\s*bearer\s+(.+)/i)
    return match ? match[1].trim() : authValue.trim()
  }, [authValue])
  const authHeader = token ? `Bearer ${token}` : null

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: authHeader ? { Authorization: authHeader } : undefined })
    } catch (err) {
      // ignore network errors on logout
    } finally {
      localStorage.removeItem('auth')
      navigate('/login')
    }
  }

  useEffect(() => {
    if (!authValue) navigate('/login')
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

  const fetchHistory = async (deviceId: number, hoursOverride?: number) => {
    setHistoryLoading(true)
    setHistoryError(null)
    setHistorySelectedPoint(null)
    const hrs = Math.max(1, hoursOverride ?? historyHours)
    setHistoryHours(hrs)
    try {
      const res = await fetch(`/api/coastguard/history?device_id=${deviceId}&hours=${hrs}`, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || 'Unable to load history')
      }
      const data: PositionPayload[] = await res.json()
      setHistoryFocusId(deviceId)
      setHistoryPoints(data)
      setSelectedId(deviceId)
      setDetailOpen(false)
      if (!data.length) {
        setHistoryError(`No history in the last ${hrs} hours for this tracker`)
      }
    } catch (err: any) {
      setHistoryError(err?.message || 'Unable to load history')
      setHistoryFocusId(null)
      setHistoryPoints([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const clearHistory = () => {
    setHistoryFocusId(null)
    setHistoryPoints([])
    setHistorySelectedPoint(null)
    setHistoryError(null)
  }

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
            const battery = batteryFromPayload(p)
            next[p.device_id] = {
              ...existing,
              lastPosition: p,
              batteryPercent: battery ?? existing.batteryPercent,
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
          const sos = incomingEvents.find((e) => isSosEvent(e) && !e.resolved)
          if (sos) {
            setActiveAlert((prev) => (prev?.eventId === sos.id ? prev : { eventId: sos.id, deviceId: sos.device_id }))
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
    if (!activeAlert) {
      setAlertCenter(null)
      return
    }
    const tracker = trackers[activeAlert.deviceId]
    if (tracker?.lastPosition) {
      setAlertCenter([tracker.lastPosition.latitude, tracker.lastPosition.longitude])
    }
  }, [activeAlert, trackers])

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
        const fisherName = Array.isArray(body) && body.length > 0 ? body[0].name : null
        setTrackers((prev) => ({
          ...prev,
          [deviceId]: {
            ...(prev[deviceId] || { device: tracker.device }),
            medicalRecord: med || null,
            fisherName: fisherName || null,
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

  const historyPath = useMemo(() => historyPoints.map((p) => [p.latitude, p.longitude] as [number, number]), [historyPoints])
  const historyCenter = useMemo(() => {
    if (!historyPoints.length) return null
    const mid = Math.floor(historyPoints.length / 2)
    return [historyPoints[mid].latitude, historyPoints[mid].longitude] as [number, number]
  }, [historyPoints])

  const activeCount = trackerList.filter((t) => t.status === 'online').length
  const sos24h = events.filter((e) => isSosEvent(e) && !e.resolved && isWithin24Hours(e.timestamp)).length
  const geofence24h = events.filter((e) => e.event_type === 'geofenceExit' && isWithin24Hours(e.timestamp)).length
  const isAlerting = Boolean(activeAlert)
  const resolutionOptions: { key: 'rescued' | 'false_alarm' | 'other'; label: string }[] = [
    { key: 'rescued', label: 'Rescued' },
    { key: 'false_alarm', label: 'False alarm' },
    { key: 'other', label: 'Other' },
  ]

  const submitReport = async () => {
    if (!activeAlert) return
    const finalResolution =
      resolutionChoice === 'other'
        ? customResolution.trim()
        : resolutionChoice === 'rescued'
        ? 'Rescued'
        : 'False alarm'

    if (!finalResolution) {
      setDismissError('Resolution is required')
      return
    }
    if (!dismissPassword) {
      setDismissError('Password is required')
      return
    }

    setDismissLoading(true)
    setDismissError(null)
    try {
      const res = await fetch('/api/coastguard/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({
          event_id: activeAlert.eventId,
          resolution: finalResolution,
          notes: dismissNotes.trim() || undefined,
          password: dismissPassword,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.detail || 'Unable to submit report'
        throw new Error(msg)
      }

      setDismissOpen(false)
      setActiveAlert(null)
      setDismissPassword('')
      setDismissNotes('')
      setCustomResolution('')
      setResolutionChoice('rescued')
    } catch (err: any) {
      setDismissError(err?.message || 'Unable to submit report')
    } finally {
      setDismissLoading(false)
    }
  }

  const alertsForModal = events
    .filter((e) => (isSosEvent(e) && !e.resolved) || e.event_type === 'geofenceExit' || e.event_type === 'deviceOffline')
    .sort((a, b) => (new Date(b.timestamp || 0).getTime() || 0) - (new Date(a.timestamp || 0).getTime() || 0))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <style>
        {`
        @keyframes alertFlash {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.8; }
        }
        @keyframes marqueeSlide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .alert-marquee-track {
          display: flex;
          width: 240%;
          animation: marqueeSlide 10s linear infinite;
        }
        .alert-marquee-segment {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          font-weight: 800;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          white-space: nowrap;
          font-size: 0.95rem;
          padding: 0 1rem;
        }
        `}
      </style>

      {isAlerting && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-40 bg-red-500/15"
            style={{ animation: 'alertFlash 1s ease-in-out infinite' }}
          />
          <div className="pointer-events-none fixed top-0 left-0 right-0 z-50 h-12 overflow-hidden bg-gradient-to-b from-red-900/80 via-red-800/70 to-red-700/60 backdrop-blur">
            <div className="alert-marquee-track text-xs text-red-100">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="alert-marquee-segment">
                  <span>ALERT</span>
                  <span>|</span>
                  <span>SOS</span>
                  <span>|</span>
                  <span>ALERT</span>
                  <span>|</span>
                  <span>SOS</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 h-12 overflow-hidden bg-gradient-to-t from-red-900/80 via-red-800/70 to-red-700/60 backdrop-blur">
            <div className="alert-marquee-track text-xs text-red-100" style={{ animationDuration: '12s' }}>
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="alert-marquee-segment">
                  <span>ALERT</span>
                  <span>|</span>
                  <span>SOS</span>
                  <span>|</span>
                  <span>ALERT</span>
                  <span>|</span>
                  <span>SOS</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="flex h-screen">
        <aside className="flex h-full w-full max-w-[360px] flex-col border-r border-white/5 bg-slate-900/70 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-4 gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coast Guard</p>
              <p className="text-base font-semibold text-white">Live Tracker Console</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`px-3 py-1 text-xs ${
                connectionState === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : connectionState === 'connecting'
                  ? 'bg-amber-500/20 text-amber-100'
                  : 'bg-red-500/25 text-red-100'
              }`}>
                {connectionState === 'connected' ? 'Live' : connectionState === 'connecting' ? 'Connecting' : 'Offline'}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleLogout} className="border-white/20 text-slate-100 hover:bg-slate-800">
                Logout
              </Button>
            </div>
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

          <ScrollArea className="flex-1 px-2">
            <div className="space-y-2 py-3">
              {trackerList.map((t) => {
                const status = t.status
                const lastTs = t.lastPosition?.timestamp || t.lastEvent?.timestamp
                const isSos = events.some(
                  (e) => e.device_id === t.device.id && isSosEvent(e) && !e.resolved && isWithin24Hours(e.timestamp)
                )
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
                          {/* <p className="text-xs text-slate-400">SSEN: {t.device.name || 'Unassigned'}</p> */}
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

          <div className="border-t border-white/5 bg-slate-900/80 p-3">
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700"
                onClick={() => navigate('/coast-guard')}
              >
                <MapIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">Map</span>
              </Button>
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2 border border-white/10 bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => navigate('/coast-guard/reports')}
              >
                <Waypoints className="h-4 w-4" />
                <span className="text-sm font-semibold">Reports</span>
              </Button>
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2 border border-white/10 bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => navigate('/coast-guard/account')}
              >
                <UserCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">Account</span>
              </Button>
            </div>
          </div>
        </aside>

        <main className="relative flex-1">
          {connectionState === 'error' && (
            <div className="absolute left-4 top-4 z-30 max-w-md">
              <Alert variant="destructive" className="bg-red-500/80 text-red-100">
                <AlertDescription>
                  Websocket connection lost. Ensure you are logged in and the backend is running.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <MapContainer
            center={firstPosition || defaultCenter}
            zoom={10}
            className="h-full w-full z-0"
            zoomControl={false}
            preferCanvas
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {!initialCentered && firstPosition && (
              <FlyToPosition position={firstPosition} onDone={() => setInitialCentered(true)} />
            )}

            {alertCenter && <FlyToPosition position={alertCenter} zoom={13} />}
            {historyCenter && <FlyToPosition position={historyCenter} zoom={12} />}

            {historyFocusId && historyPath.length > 1 && (
              <Polyline positions={historyPath} pathOptions={{ color: '#22d3ee', weight: 4, opacity: 0.9 }} />
            )}

            {historyFocusId && historyPoints.length > 0
              ? historyPoints.map((p, idx) => {
                  const isStart = idx === 0
                  const isEnd = idx === historyPoints.length - 1
                  const color = isEnd ? '#a855f7' : isStart ? '#22c55e' : '#38bdf8'
                  const icon = L.divIcon({
                    className: 'history-point',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                    html: `<div style="width:16px;height:16px;border-radius:50%;border:2px solid ${color};background:#0f172a;box-shadow:0 0 0 2px ${color}33"></div>`
                  })
                  return (
                    <Marker
                      key={p.id}
                      position={[p.latitude, p.longitude]}
                      icon={icon}
                      eventHandlers={{
                        click: () => setHistorySelectedPoint(p),
                      }}
                    >
                      <LeafletTooltip direction="top" offset={[0, -6]}>
                        <div className="text-xs font-semibold text-slate-900">{formatGMT8(p.timestamp)}</div>
                      </LeafletTooltip>
                    </Marker>
                  )
                })
              : trackerList
                  .filter((t) => t.lastPosition)
                  .map((t) => {
                    const pos = t.lastPosition!
                    const status = t.status
                    const sosFlag = events.some(
                      (e) => e.device_id === t.device.id && isSosEvent(e) && !e.resolved && isWithin24Hours(e.timestamp)
                    )
                    const color = sosFlag ? '#f87171' : status === 'online' ? '#22c55e' : status === 'offline' ? '#f59e0b' : '#94a3b8'
                    const heading = typeof pos.course === 'number' ? pos.course : 0
                    return (
                      <Marker
                        key={t.device.id}
                        position={[pos.latitude, pos.longitude]}
                        icon={trackerIcon(color, heading)}
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
                      </Marker>
                    )
                  })}
          </MapContainer>

          {historyFocusId && (
            <div className="absolute left-4 top-4 z-30 flex max-w-lg flex-col gap-3">
              <Card className="border-cyan-400/30 bg-slate-900/85 text-slate-100">
                <CardContent className="space-y-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.12em] text-cyan-200/80">History mode</p>
                      <p className="text-sm font-semibold">Device {historyFocusId}</p>
                    </div>
                    <Badge className="bg-cyan-500/20 text-cyan-100">{historyPoints.length} points</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                    <Clock3 className="h-4 w-4 text-cyan-200" />
                    <span>Last {historyHours}h</span>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={historyHours}
                      onChange={(e) => setHistoryHours(parseInt(e.target.value, 10) || 1)}
                      className="h-9 w-20 bg-slate-800 text-white"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={historyLoading}
                      className="bg-cyan-600 text-white hover:bg-cyan-500"
                      onClick={() => historyFocusId && fetchHistory(historyFocusId, historyHours)}
                    >
                      {historyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Refresh
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearHistory} className="text-slate-200">
                      Exit
                    </Button>
                  </div>
                  {historyError && <p className="text-sm text-red-300">{historyError}</p>}
                </CardContent>
              </Card>

              {historySelectedPoint && (
                <Card className="border-white/10 bg-slate-900/85 text-slate-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Point details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-200">
                    <p className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4" /> {formatGMT8(historySelectedPoint.timestamp)}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {historySelectedPoint.latitude.toFixed(5)}, {historySelectedPoint.longitude.toFixed(5)}
                    </p>
                    {typeof historySelectedPoint.course === 'number' && (
                      <p className="text-xs text-slate-400">Course: {Math.round(historySelectedPoint.course)}°</p>
                    )}
                    {typeof historySelectedPoint.speed === 'number' && (
                      <p className="text-xs text-slate-400">Speed: {historySelectedPoint.speed?.toFixed(1)} km/h</p>
                    )}
                    {typeof historySelectedPoint.battery_percent === 'number' && (
                      <p className="text-xs text-slate-400">Battery: {Math.round(historySelectedPoint.battery_percent)}%</p>
                    )}
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setHistorySelectedPoint(null)}>
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-6">
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
                className="flex items-center gap-2 bg-slate-900/80 text-slate-100 hover:bg-slate-900"
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
                    <div className="text-xs text-slate-400">{formatGMT8(e.timestamp)}</div>
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
                <DialogDescription className="space-y-1 text-slate-400">
                  <p>SSEN: {selectedTracker.device.name || 'Unassigned'}</p>
                  <p>Fisherfolk: {selectedTracker.fisherName || 'Unknown fisherfolk'}</p>
                </DialogDescription>
              </DialogHeader>

              {activeAlert && activeAlert.deviceId === selectedTracker.device.id && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  <span className="font-semibold">Active SOS alarm</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setDismissError(null)
                      setDismissOpen(true)
                    }}
                  >
                    Dismiss and file report
                  </Button>
                </div>
              )}

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
                  <CardTitle className="text-sm">Fisherfolk Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedTracker.fisherName && (
                    <p className="text-sm text-slate-300">Fisherfolk: {selectedTracker.fisherName}</p>
                  )}
                  {selectedTracker.medicalLoading && <p className="text-sm text-slate-400">Loading medical record...</p>}
                  {selectedTracker.medicalError && (
                    <p className="text-sm text-red-300">{selectedTracker.medicalError}</p>
                  )}
                  {!selectedTracker.medicalLoading && !selectedTracker.medicalError && (
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">
                      Medical Record: {selectedTracker.medicalRecord || 'No medical record available.'}
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-slate-400">
                  View historical track for this device and hide other trackers on the map.
                </div>
                <Button
                  variant="secondary"
                  className="bg-cyan-600 text-white hover:bg-cyan-500"
                  onClick={() => fetchHistory(selectedTracker.device.id)}
                  disabled={historyLoading && historyFocusId === selectedTracker.device.id}
                >
                  {historyLoading && historyFocusId === selectedTracker.device.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  View history
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Select a tracker to view details.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dismissOpen}
        onOpenChange={(open) => {
          setDismissOpen(open)
          if (!open) {
            setDismissError(null)
          }
        }}
      >
        <DialogContent className="max-w-lg bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>Resolve SOS alarm</DialogTitle>
            <DialogDescription className="text-slate-400">
              File a resolution for the active SOS event. Password confirmation is required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-white/5 bg-slate-900/60 p-3 text-sm text-slate-200">
              <p className="font-semibold">SSEN: {selectedTracker?.device.name || `Device ${activeAlert?.deviceId ?? 'N/A'}`}</p>
              <p>Fisherfolk: {selectedTracker?.fisherName || 'Unknown fisherfolk'}</p>
              <p className="text-xs text-slate-400">Event #{activeAlert?.eventId ?? 'N/A'}</p>
            </div>

            <div className="space-y-2 text-sm text-slate-200">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Resolution</p>
              <div className="grid grid-cols-3 gap-2">
                {resolutionOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setResolutionChoice(opt.key)}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                      resolutionChoice === opt.key ? 'border-cyan-300/60 bg-cyan-500/20 text-cyan-100' : 'border-white/10 bg-slate-900/60 text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {resolutionChoice === 'other' && (
                <Input
                  value={customResolution}
                  onChange={(e) => setCustomResolution(e.target.value)}
                  placeholder="Enter custom resolution"
                  className="bg-slate-900/60 text-white placeholder:text-slate-500"
                />
              )}
              <Input
                value={dismissNotes}
                onChange={(e) => setDismissNotes(e.target.value)}
                placeholder="Optional notes"
                className="bg-slate-900/60 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2 text-sm text-slate-200">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Confirm password</p>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  value={dismissPassword}
                  onChange={(e) => setDismissPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="bg-slate-900/60 text-white placeholder:text-slate-500"
                />
              </div>
            </div>

            {dismissError && <p className="text-sm text-red-300">{dismissError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDismissOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={dismissLoading}
                onClick={submitReport}
                className="flex items-center gap-2"
              >
                {dismissLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit report
              </Button>
            </div>
          </div>
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
      ? 'bg-emerald-500/80 text-emerald-50'
      : tone === 'red'
      ? 'bg-red-500/80 text-red-50'
      : 'bg-amber-500/80 text-amber-50'
  return (
    <Card className={`border border-white/10 ${toneClass}`}>
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
