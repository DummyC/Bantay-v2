import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Activity,
  Bell,
  Edit3,
  Eye,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map,
  MapPinned,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  Waypoints,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

type UserRecord = {
  id: number
  name: string
  email: string
  role: string
  is_active?: boolean
  created_at?: string | null
  medical_record?: string | null
}

type DeviceRecord = {
  id: number
  traccar_device_id?: number | null
  unique_id?: string | null
  name?: string | null
  user_id?: number | null
  geofence_id?: number | null
}

type GeofenceRecord = {
  id: number
  name: string
  description?: string | null
  area?: string | null
  traccar_id?: number | null
}

type AlertRecord = {
  id: number
  device_id: number
  device_name?: string | null
  owner_name?: string | null
  event_type: string
  timestamp?: string | null
  attributes?: Record<string, unknown> | null
}

type ReportRecord = {
  id: number
  event_id: number
  user_id: number
  resolution: string
  notes?: string | null
  timestamp?: string | null
  dismissal_time?: string | null
  device_id?: number | null
  device_name?: string | null
  owner_name?: string | null
  filed_by_name?: string | null
  event_timestamp?: string | null
}

type LogRecord = {
  id: number
  table_name: string
  record_id: number
  action: string
  actor_user_id?: number | null
  actor_name?: string | null
  timestamp?: string | null
  details?: Record<string, unknown> | null
}

type TabKey = 'dashboard' | 'users' | 'devices' | 'geofences' | 'alerts' | 'reports' | 'logs'

type Profile = {
  id: number
  name?: string | null
  email: string
  role?: string | null
}

type DialogState =
  | { kind: 'user'; mode: 'create' | 'edit' | 'detail' | 'reset'; user?: UserRecord }
  | { kind: 'device'; mode: 'create' | 'edit' | 'detail'; device?: DeviceRecord }
  | { kind: 'geofence'; mode: 'create' | 'edit' | 'detail'; geofence?: GeofenceRecord }
  | { kind: 'geofence-upload' }
  | { kind: 'register'; role: 'fisher' | 'coast_guard' | 'administrator' }
  | { kind: 'delete'; target: 'user' | 'device' | 'geofence'; id: number }

const defaultUserForm = { name: '', email: '', password: '', role: 'fisherfolk', medical_record: '' }
const defaultDeviceForm = { unique_id: '', name: '', owner_id: '', geofence_id: '' }
const defaultGeofenceForm = { name: '', description: '', area: '' }
const defaultRegisterForm = {
  name: '',
  email: '',
  password: '',
  unique_id: '',
  device_name: '',
  medical_record: '',
  geofence_id: '',
}

function formatGMT8(ts?: string | null, fallback = 'N/A') {
  if (!ts) return fallback
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(ts)
  const iso = hasZone ? ts : `${ts}Z`
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return fallback
  return new Date(parsed).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
}

function intOrNull(value: string) {
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

export default function Admin() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [users, setUsers] = useState<UserRecord[]>([])
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [geofences, setGeofences] = useState<GeofenceRecord[]>([])
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [, setProfile] = useState<Profile | null>(null)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [userForm, setUserForm] = useState({ ...defaultUserForm })
  const [deviceForm, setDeviceForm] = useState({ ...defaultDeviceForm })
  const [geofenceForm, setGeofenceForm] = useState({ ...defaultGeofenceForm })
  const [registerForm, setRegisterForm] = useState({ ...defaultRegisterForm })
  const [geofenceFile, setGeofenceFile] = useState<File | null>(null)
  const [deleteCascade, setDeleteCascade] = useState(false)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'administrator' | 'coast_guard' | 'fisherfolk'>('all')
  const [deviceOwnerFilter, setDeviceOwnerFilter] = useState<'all' | 'assigned' | 'unassigned'>('all')
  const [alertTypeFilter, setAlertTypeFilter] = useState<'all' | 'sos' | 'geofence' | 'offline'>('sos')
  const [reportResolutionFilter, setReportResolutionFilter] = useState<'all' | 'rescued' | 'false alarm' | 'other'>('all')
  const [logActionFilter, setLogActionFilter] = useState<'all' | 'create' | 'update' | 'delete'>('all')
  const [logTableFilter, setLogTableFilter] = useState<'all' | 'users' | 'devices' | 'geofences' | 'reports' | 'events'>('all')

  const authValue = typeof window !== 'undefined' ? localStorage.getItem('auth') : null
  const token = useMemo(() => {
    if (!authValue) return ''
    const match = authValue.match(/\s*bearer\s+(.+)/i)
    return match ? match[1] : authValue
  }, [authValue])
  const authHeader = token ? { Authorization: `Bearer ${token}` } : undefined

  useEffect(() => {
    if (!authValue) {
      navigate('/login')
      return
    }
    loadData()
  }, [authValue])

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => {
    if (!dialog) return
    if (dialog.kind === 'user' && dialog.user) {
      setUserForm({
        name: dialog.user.name || '',
        email: dialog.user.email || '',
        password: '',
        role: dialog.user.role || 'fisherfolk',
        medical_record: dialog.user.medical_record || '',
      })
    }
    if (dialog.kind === 'device' && dialog.device) {
      setDeviceForm({
        unique_id: dialog.device.unique_id || '',
        name: dialog.device.name || '',
        owner_id: dialog.device.user_id?.toString() || '',
        geofence_id: dialog.device.geofence_id?.toString() || '',
      })
    }
    if (dialog.kind === 'geofence' && dialog.geofence) {
      setGeofenceForm({
        name: dialog.geofence.name || '',
        description: dialog.geofence.description || '',
        area: dialog.geofence.area || '',
      })
    }
    if (dialog.kind === 'geofence' && !dialog.geofence) {
      setGeofenceForm({ ...defaultGeofenceForm })
    }
    if (dialog.kind === 'register') {
      setRegisterForm({ ...defaultRegisterForm })
    }
    if (dialog.kind === 'geofence-upload') {
      setGeofenceFile(null)
      setGeofenceForm({ ...defaultGeofenceForm })
    }
    if (dialog.kind === 'delete') {
      setDeleteCascade(false)
    }
  }, [dialog])

  const apiFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}), ...authHeader } })
    if (!res.ok) {
      let msg = `Request failed (${res.status})`
      try {
        const body = await res.json()
        msg = body?.detail || msg
      } catch (err) {
        // ignore
      }
      throw new Error(msg)
    }
    return res
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: authHeader })
    } catch (err) {
      // ignore
    } finally {
      localStorage.removeItem('auth')
      navigate('/login', { replace: true })
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const meRes = await fetch('/api/auth/me', { headers: authHeader })
      if (!meRes.ok) {
        const body = await meRes.json().catch(() => ({}))
        const msg = body?.detail || `Auth check failed (${meRes.status})`
        throw new Error(msg)
      }
      const me = (await meRes.json()) as Profile
      setProfile(me)
      if (me?.role !== 'administrator') {
        throw new Error('Administrator role required to access this panel')
      }

      const responses = await Promise.all([
        fetch('/api/admin/users', { headers: authHeader }),
        fetch('/api/admin/devices', { headers: authHeader }),
        fetch('/api/admin/geofences', { headers: authHeader }),
        fetch('/api/admin/alerts?limit=200', { headers: authHeader }),
        fetch('/api/admin/reports?limit=200', { headers: authHeader }),
        fetch('/api/admin/logs?limit=200', { headers: authHeader }),
      ])

      const firstError = responses.find((r) => !r.ok)
      if (firstError) {
        const body = await firstError.json().catch(() => ({}))
        const msg = body?.detail || `Failed to load admin data (${firstError.status})`
        throw new Error(msg)
      }

      const [u, d, g, a, r, l] = await Promise.all(responses.map((res) => res.json()))
      setUsers(Array.isArray(u) ? u : [])
      setDevices(Array.isArray(d) ? d : [])
      setGeofences(Array.isArray(g) ? g : [])
      setAlerts(Array.isArray(a) ? a : [])
      setReports(Array.isArray(r) ? r : [])
      setLogs(Array.isArray(l) ? l : [])
    } catch (err: any) {
      setError(err?.message || 'Unable to load admin data')
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!term) return true
      return [u.name, u.email, u.role, u.id?.toString()].some((v) => (v || '').toLowerCase().includes(term))
    })
  }, [users, search, roleFilter])

  const filteredDevices = useMemo(() => {
    const term = search.toLowerCase().trim()
    return devices.filter((d) => {
      if (deviceOwnerFilter === 'assigned' && !d.user_id) return false
      if (deviceOwnerFilter === 'unassigned' && d.user_id) return false
      if (!term) return true
      return [d.name, d.unique_id, d.id?.toString(), d.traccar_device_id?.toString()].some((v) => (v || '').toLowerCase().includes(term))
    })
  }, [devices, search, deviceOwnerFilter])

  const filteredGeofences = useMemo(() => {
    const term = search.toLowerCase().trim()
    return geofences.filter((g) => {
      if (!term) return true
      return [g.name, g.description, g.traccar_id?.toString()].some((v) => (v || '').toLowerCase().includes(term))
    })
  }, [geofences, search])

  const filteredAlerts = useMemo(() => {
    const term = search.toLowerCase().trim()
    return alerts.filter((a) => {
      if (alertTypeFilter !== 'all') {
        const et = a.event_type.toLowerCase()
        const isSos = et.includes('sos')
        const isGeo = et.includes('geofence')
        const isOffline = et.includes('offline')
        if (alertTypeFilter === 'sos' && !isSos) return false
        if (alertTypeFilter === 'geofence' && !isGeo) return false
        if (alertTypeFilter === 'offline' && !isOffline) return false
      }
      if (!term) return true
      return [a.device_name, a.owner_name, a.event_type, a.device_id.toString()].some((v) => (v || '').toLowerCase().includes(term))
    })
  }, [alerts, search, alertTypeFilter])

  const filteredReports = useMemo(() => {
    const term = search.toLowerCase().trim()
    return reports.filter((r) => {
      if (reportResolutionFilter !== 'all' && r.resolution.toLowerCase() !== reportResolutionFilter) return false
      if (!term) return true
      return [r.resolution, r.notes, r.device_name, r.owner_name, r.filed_by_name, r.event_id?.toString(), r.device_id?.toString()]
        .filter(Boolean)
        .some((v) => (v || '').toLowerCase().includes(term))
    })
  }, [reports, search, reportResolutionFilter])

  const filteredLogs = useMemo(() => {
    const term = search.toLowerCase().trim()
    return logs.filter((l) => {
      if (logActionFilter !== 'all' && l.action.toLowerCase() !== logActionFilter) return false
      if (logTableFilter !== 'all' && l.table_name.toLowerCase() !== logTableFilter) return false
      if (!term) return true
      return [l.table_name, l.action, l.actor_name, l.details ? JSON.stringify(l.details) : ''].some((v) => (v || '').toLowerCase().includes(term))
    })
  }, [logs, search, logActionFilter, logTableFilter])

  const navItems: { key: TabKey; label: string; icon: ReactElement }[] = [
    { key: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
    { key: 'devices', label: 'Devices', icon: <Map className="h-4 w-4" /> },
    { key: 'geofences', label: 'Geofences', icon: <MapPinned className="h-4 w-4" /> },
    { key: 'alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" /> },
    { key: 'reports', label: 'Reports', icon: <FileText className="h-4 w-4" /> },
    { key: 'logs', label: 'Logs', icon: <ListChecks className="h-4 w-4" /> },
  ]

  const openCreateUser = () => {
    setDialog({ kind: 'user', mode: 'create' })
    setUserForm({ ...defaultUserForm })
  }

  const openCreateDevice = () => {
    setDialog({ kind: 'device', mode: 'create' })
    setDeviceForm({ ...defaultDeviceForm })
  }

  const openCreateGeofence = () => {
    setDialog({ kind: 'geofence', mode: 'create' })
    setGeofenceForm({ ...defaultGeofenceForm })
  }

  const submitUser = async () => {
    if (!dialog || dialog.kind !== 'user') return
    setBusy(true)
    try {
      const payload: any = {
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
      }
      if (userForm.password) payload.password = userForm.password
      if (userForm.medical_record) payload.medical_record = userForm.medical_record

      if (dialog.mode === 'create') {
        await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ ...payload, password: userForm.password || 'changeme123' }) })
      } else {
        await apiFetch(`/api/admin/users/${dialog.user?.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }
      await loadData()
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'User save failed')
    } finally {
      setBusy(false)
    }
  }

  const submitResetPassword = async () => {
    if (!dialog || dialog.kind !== 'user' || dialog.mode !== 'reset' || !dialog.user) return
    if (!userForm.password) {
      setError('Please provide a new password')
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/admin/users/${dialog.user.id}/reset_password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: userForm.password }),
      })
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'Password reset failed')
    } finally {
      setBusy(false)
    }
  }

  const submitDevice = async () => {
    if (!dialog || dialog.kind !== 'device') return
    setBusy(true)
    try {
      const payload: any = {
        unique_id: deviceForm.unique_id || undefined,
        name: deviceForm.name || undefined,
        owner_id: deviceForm.owner_id === '' ? null : Number(deviceForm.owner_id),
        geofence_id: deviceForm.geofence_id === '' ? null : intOrNull(deviceForm.geofence_id),
      }

      if (dialog.mode === 'create') {
        await apiFetch('/api/admin/devices', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/api/admin/devices/${dialog.device?.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }
      await loadData()
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'Device save failed')
    } finally {
      setBusy(false)
    }
  }

  const submitGeofence = async () => {
    if (!dialog || dialog.kind !== 'geofence') return
    setBusy(true)
    try {
      const payload = { name: geofenceForm.name, description: geofenceForm.description || null, area: geofenceForm.area }
      if (dialog.mode === 'create') {
        await apiFetch('/api/admin/geofences', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/api/admin/geofences/${dialog.geofence?.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }
      await loadData()
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'Geofence save failed')
    } finally {
      setBusy(false)
    }
  }

  const submitGeofenceUpload = async () => {
    if (!geofenceFile) {
      setError('Please choose a geofence file')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', geofenceFile)
      if (geofenceForm.name) fd.append('name', geofenceForm.name)
      if (geofenceForm.description) fd.append('description', geofenceForm.description)
      const res = await fetch('/api/admin/geofences/upload', { method: 'POST', headers: { ...(authHeader || {}) }, body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Upload failed (${res.status})`)
      }
      await loadData()
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const submitRegister = async () => {
    if (!dialog || dialog.kind !== 'register') return
    setBusy(true)
    try {
      if (dialog.role === 'fisher') {
        const payload = {
          fisher_name: registerForm.name,
          fisher_email: registerForm.email,
          fisher_password: registerForm.password,
          unique_id: registerForm.unique_id || undefined,
          name: registerForm.device_name || undefined,
          medical_record: registerForm.medical_record || undefined,
          geofence_id: registerForm.geofence_id ? Number(registerForm.geofence_id) : undefined,
        }
        await apiFetch('/api/admin/register', { method: 'POST', body: JSON.stringify(payload) })
      } else if (dialog.role === 'coast_guard') {
        const payload = { name: registerForm.name, email: registerForm.email, password: registerForm.password }
        await apiFetch('/api/admin/register_coastguard', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        const payload = { name: registerForm.name, email: registerForm.email, password: registerForm.password }
        await apiFetch('/api/admin/register_admin', { method: 'POST', body: JSON.stringify(payload) })
      }
      await loadData()
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async () => {
    if (!dialog || dialog.kind !== 'delete') return
    setBusy(true)
    try {
      let url = ''
      const params = new URLSearchParams()
      if (dialog.target === 'user') {
        if (deleteCascade) params.append('delete_devices', 'true')
        url = `/api/admin/users/${dialog.id}?${params.toString()}`
      } else if (dialog.target === 'device') {
        if (deleteCascade) params.append('delete_user', 'true')
        url = `/api/admin/devices/${dialog.id}?${params.toString()}`
      } else {
        url = `/api/admin/geofences/${dialog.id}`
      }
      const res = await fetch(url, { method: 'DELETE', headers: { ...(authHeader || {}) } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || `Delete failed (${res.status})`)
      }
      await loadData()
      setDialog(null)
    } catch (err: any) {
      setError(err?.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const renderFilters = () => {
    switch (activeTab) {
      case 'users':
        return (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/60 text-white"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            >
              <option value="all">All roles</option>
              <option value="administrator">Administrator</option>
              <option value="coast_guard">Coast Guard</option>
              <option value="fisherfolk">Fisherfolk</option>
            </select>
          </div>
        )
      case 'devices':
        return (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search devices"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/60 text-white"
            />
            <select
              value={deviceOwnerFilter}
              onChange={(e) => setDeviceOwnerFilter(e.target.value as any)}
              className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            >
              <option value="all">All ownership</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        )
      case 'geofences':
        return (
          <Input
            placeholder="Search geofences"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-900/60 text-white"
          />
        )
      case 'alerts':
        return (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search alerts"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/60 text-white"
            />
            <select
              value={alertTypeFilter}
              onChange={(e) => setAlertTypeFilter(e.target.value as any)}
              className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            >
              <option value="all">All types</option>
              <option value="sos">SOS</option>
              <option value="geofence">Geofence</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        )
      case 'reports':
        return (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search reports"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/60 text-white"
            />
            <select
              value={reportResolutionFilter}
              onChange={(e) => setReportResolutionFilter(e.target.value as any)}
              className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            >
              <option value="all">All resolutions</option>
              <option value="rescued">Rescued</option>
              <option value="false alarm">False alarm</option>
              <option value="other">Other</option>
            </select>
          </div>
        )
      case 'logs':
        return (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search logs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/60 text-white"
            />
            <select
              value={logTableFilter}
              onChange={(e) => setLogTableFilter(e.target.value as any)}
              className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            >
              <option value="all">All tables</option>
              <option value="users">Users</option>
              <option value="devices">Devices</option>
              <option value="geofences">Geofences</option>
              <option value="reports">Reports</option>
              <option value="events">Events</option>
            </select>
            <select
              value={logActionFilter}
              onChange={(e) => setLogActionFilter(e.target.value as any)}
              className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
            >
              <option value="all">All actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        )
      default:
        return null
    }
  }

  const StatCard = ({ label, value, icon, tone }: { label: string; value: number | string; icon: ReactElement; tone: 'cyan' | 'amber' | 'emerald' | 'red' }) => (
    <Card className="border-white/5 bg-slate-900/70">
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
        </div>
        <div
          className={`rounded-full p-2 ${
            tone === 'cyan'
              ? 'bg-cyan-500/15 text-cyan-200'
              : tone === 'amber'
              ? 'bg-amber-500/15 text-amber-200'
              : tone === 'emerald'
              ? 'bg-emerald-500/15 text-emerald-200'
              : 'bg-red-500/15 text-red-200'
          }`}
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  )

  const renderActions = () => {
    if (activeTab === 'users') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500" onClick={openCreateUser}>
            <Plus className="mr-2 h-4 w-4" /> New User
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'register', role: 'fisher' })}>
            <Users className="mr-2 h-4 w-4" /> Register Fisher
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'register', role: 'coast_guard' })}>
            <Waypoints className="mr-2 h-4 w-4" /> Register Coast Guard
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'register', role: 'administrator' })}>
            <KeyRound className="mr-2 h-4 w-4" /> Register Admin
          </Button>
        </div>
      )
    }
    if (activeTab === 'devices') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={openCreateDevice}>
            <Plus className="mr-2 h-4 w-4" /> New Device
          </Button>
        </div>
      )
    }
    if (activeTab === 'geofences') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-500" onClick={openCreateGeofence}>
            <Plus className="mr-2 h-4 w-4" /> New Geofence
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'geofence-upload' })}>
            <Upload className="mr-2 h-4 w-4" /> Upload Geofence
          </Button>
        </div>
      )
    }
    return null
  }

  const fisherfolkUsers = useMemo(() => users.filter((u) => u.role === 'fisherfolk'), [users])
  const geofenceOptions = useMemo(() => geofences.map((g) => ({ id: g.id, name: g.name })), [geofences])
  const geofenceNameById = (id?: number | null) => geofences.find((g) => g.id === id)?.name || 'None'
  const ownerDisplay = (ownerId?: number | null) => {
    const owner = users.find((u) => u.id === ownerId)
    if (!owner) return 'Unassigned'
    return `${owner.name || 'Unnamed'} (${owner.email})`
  }

  const renderContent = () => {
    if (activeTab === 'dashboard') {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard label="Users" value={users.length} icon={<Users className="h-5 w-5" />} tone="cyan" />
            <StatCard label="Devices" value={devices.length} icon={<Map className="h-5 w-5" />} tone="emerald" />
            <StatCard label="Geofences" value={geofences.length} icon={<MapPinned className="h-5 w-5" />} tone="amber" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              label="Alerts (recent)"
              value={alerts.filter((a) => a.event_type.toLowerCase().includes('sos')).length}
              icon={<Bell className="h-5 w-5" />}
              tone="red"
            />
            <StatCard label="Reports" value={reports.length} icon={<FileText className="h-5 w-5" />} tone="cyan" />
            <StatCard label="Logs" value={logs.length} icon={<ListChecks className="h-5 w-5" />} tone="amber" />
          </div>

          <Card className="border-white/5 bg-slate-900/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-200">
              {alerts
                .filter((a) => a.event_type.toLowerCase().includes('sos'))
                .slice(0, 6)
                .map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-white/5 bg-slate-900/50 px-3 py-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-white">{a.device_name || `Device ${a.device_id}`}</p>
                    <p className="text-xs text-slate-400">{a.event_type}</p>
                  </div>
                  <p className="text-xs text-slate-400">{formatGMT8(a.timestamp)}</p>
                </div>
              ))}
              {!alerts.filter((a) => a.event_type.toLowerCase().includes('sos')).length && <p className="text-sm text-slate-400">No alerts yet.</p>}
            </CardContent>
          </Card>
        </div>
      )
    }

    if (activeTab === 'users') {
      return (
        <div className="space-y-2">
          {filteredUsers.map((u) => (
            <Card key={u.id} className="border-white/5 bg-slate-900/70">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{u.name || 'Unnamed user'}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-cyan-500/20 text-cyan-100">{u.role}</Badge>
                  {u.is_active === false && <Badge className="bg-amber-500/20 text-amber-100">Inactive</Badge>}
                  {u.created_at && <span className="text-xs text-slate-500">Joined {formatGMT8(u.created_at)}</span>}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'user', mode: 'detail', user: u })}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'user', mode: 'edit', user: u })}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'user', mode: 'reset', user: u })}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: 'delete', target: 'user', id: u.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!filteredUsers.length && <p className="text-sm text-slate-400">No users match your filters.</p>}
        </div>
      )
    }

    if (activeTab === 'devices') {
      return (
        <div className="space-y-2">
          {filteredDevices.map((d) => (
            <Card key={d.id} className="border-white/5 bg-slate-900/70">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{d.name || `Device ${d.id}`}</p>
                  <p className="text-xs text-slate-400">UID: {d.unique_id || '—'}</p>
                  <p className="text-xs text-slate-500">Geofence: {geofenceNameById(d.geofence_id)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <Badge className="bg-emerald-500/15 text-emerald-200">Owner: {ownerDisplay(d.user_id)}</Badge>
                  {d.traccar_device_id && <Badge className="bg-slate-700 text-slate-200">Traccar {d.traccar_device_id}</Badge>}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'device', mode: 'detail', device: d })}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'device', mode: 'edit', device: d })}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: 'delete', target: 'device', id: d.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!filteredDevices.length && <p className="text-sm text-slate-400">No devices match your filters.</p>}
        </div>
      )
    }

    if (activeTab === 'geofences') {
      return (
        <div className="space-y-2">
          {filteredGeofences.map((g) => (
            <Card key={g.id} className="border-white/5 bg-slate-900/70">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{g.name}</p>
                  <p className="text-xs text-slate-400">{g.description || 'No description'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-800 text-slate-200">ID {g.id}</Badge>
                  {g.traccar_id && <Badge className="bg-emerald-500/15 text-emerald-200">Traccar {g.traccar_id}</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'geofence', mode: 'detail', geofence: g })}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'geofence', mode: 'edit', geofence: g })}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: 'delete', target: 'geofence', id: g.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!filteredGeofences.length && <p className="text-sm text-slate-400">No geofences match your filters.</p>}
        </div>
      )
    }

    if (activeTab === 'alerts') {
      return (
        <div className="space-y-2">
          {filteredAlerts.map((a) => (
            <Card key={a.id} className="border-white/5 bg-slate-900/70">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">{a.device_name || `Device ${a.device_id}`}</p>
                  <p className="text-xs text-slate-400">{a.event_type}</p>
                  {a.owner_name && <p className="text-xs text-slate-500">Owner: {a.owner_name}</p>}
                </div>
                <div className="text-xs text-slate-400 text-right">
                  <p>{formatGMT8(a.timestamp)}</p>
                  <p>ID {a.id}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!filteredAlerts.length && <p className="text-sm text-slate-400">No alerts match your filters.</p>}
        </div>
      )
    }

    if (activeTab === 'reports') {
      return (
        <div className="space-y-2">
          {filteredReports.map((r) => (
            <Card key={r.id} className="border-white/5 bg-slate-900/70">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                    <Badge className="bg-cyan-500/20 text-cyan-100">Event #{r.event_id}</Badge>
                    <Badge className="bg-slate-700 text-slate-100">{r.device_name || `Device ${r.device_id}`}</Badge>
                    {r.owner_name && <Badge className="bg-slate-800 text-slate-100">Owner: {r.owner_name}</Badge>}
                  </div>
                  <p className="text-sm font-semibold text-white">{r.resolution}</p>
                  <p className="text-xs text-slate-400">Notes: {r.notes || 'No notes'}</p>
                  <p className="text-[11px] text-slate-500">Filed by {r.filed_by_name || `User ${r.user_id}`} • {formatGMT8(r.timestamp)}</p>
                </div>
                <div className="text-xs text-slate-400 text-right">
                  <p>Event time: {formatGMT8(r.event_timestamp)}</p>
                  <p>Dismissal: {formatGMT8(r.dismissal_time)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {!filteredReports.length && <p className="text-sm text-slate-400">No reports match your filters.</p>}
        </div>
      )
    }

    if (activeTab === 'logs') {
      return (
        <div className="space-y-2">
          {filteredLogs.map((l) => (
            <Card key={l.id} className="border-white/5 bg-slate-900/70">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">{l.table_name} #{l.record_id}</p>
                  <p className="text-xs text-slate-400">{l.action} by {l.actor_name || `User ${l.actor_user_id ?? 'unknown'}`}</p>
                  {l.details && <p className="text-xs text-slate-500">{JSON.stringify(l.details)}</p>}
                </div>
                <p className="text-xs text-slate-400">{formatGMT8(l.timestamp)}</p>
              </CardContent>
            </Card>
          ))}
          {!filteredLogs.length && <p className="text-sm text-slate-400">No logs match your filters.</p>}
        </div>
      )
    }

    return null
  }

  const renderDialog = () => {
    if (!dialog) return null

    if (dialog.kind === 'user') {
      const isDetail = dialog.mode === 'detail'
      const isReset = dialog.mode === 'reset'
      return (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent className="bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>{dialog.mode === 'create' ? 'Create user' : dialog.mode === 'edit' ? 'Edit user' : dialog.mode === 'reset' ? 'Reset password' : 'User details'}</DialogTitle>
              <DialogDescription className="text-slate-400">
                {dialog.mode === 'detail' && 'Review user details'}
                {dialog.mode === 'reset' && 'Set a new password for this user'}
              </DialogDescription>
            </DialogHeader>
            {!isDetail && !isReset && (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm text-slate-200">Name</Label>
                  <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="bg-slate-900 text-white" />
                </div>
                <div>
                  <Label className="text-sm text-slate-200">Email</Label>
                  <Input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="bg-slate-900 text-white" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-slate-200">Password {dialog.mode === 'create' ? '' : '(leave blank to keep)'}</Label>
                    <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="bg-slate-900 text-white" />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-200">Role</Label>
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white"
                    >
                      <option value="administrator">Administrator</option>
                      <option value="coast_guard">Coast Guard</option>
                      <option value="fisherfolk">Fisherfolk</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-sm text-slate-200">Medical record (optional)</Label>
                  <textarea
                    value={userForm.medical_record}
                    onChange={(e) => setUserForm({ ...userForm, medical_record: e.target.value })}
                    className="h-20 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
            )}

            {isDetail && dialog.user && (
              <div className="space-y-2 text-sm text-slate-200">
                <p><span className="text-slate-400">Name:</span> {dialog.user.name}</p>
                <p><span className="text-slate-400">Email:</span> {dialog.user.email}</p>
                <p><span className="text-slate-400">Role:</span> {dialog.user.role}</p>
                <p><span className="text-slate-400">Active:</span> {dialog.user.is_active ? 'Yes' : 'No'}</p>
                <p><span className="text-slate-400">Created:</span> {formatGMT8(dialog.user.created_at)}</p>
                <p><span className="text-slate-400">Medical:</span> {dialog.user.medical_record || '—'}</p>
              </div>
            )}

            {isReset && (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm text-slate-200">New password</Label>
                  <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="bg-slate-900 text-white" />
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
              {!isDetail && !isReset && (
                <Button disabled={busy} onClick={submitUser} className="bg-cyan-600 text-white hover:bg-cyan-500">
                  {busy ? 'Saving...' : 'Save'}
                </Button>
              )}
              {isReset && (
                <Button disabled={busy} onClick={submitResetPassword} className="bg-cyan-600 text-white hover:bg-cyan-500">
                  {busy ? 'Updating...' : 'Reset password'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    if (dialog.kind === 'device') {
      const isDetail = dialog.mode === 'detail'
      return (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent className="bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>{dialog.mode === 'create' ? 'Create device' : dialog.mode === 'edit' ? 'Edit device' : 'Device details'}</DialogTitle>
            </DialogHeader>
            {!isDetail && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-slate-200">SSEN</Label>
                    <Input value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} className="bg-slate-900 text-white" />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-200">Unique ID</Label>
                    <Input value={deviceForm.unique_id} onChange={(e) => setDeviceForm({ ...deviceForm, unique_id: e.target.value })} className="bg-slate-900 text-white" />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-slate-200">Owner (fisherfolk)</Label>
                    <select
                      value={deviceForm.owner_id}
                      onChange={(e) => setDeviceForm({ ...deviceForm, owner_id: e.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white"
                    >
                      <option value="">Unassigned</option>
                      {fisherfolkUsers.map((u) => (
                        <option key={u.id} value={u.id}>{`${u.name || 'Unnamed'} (${u.email})`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-200">Geofence (optional)</Label>
                    <select
                      value={deviceForm.geofence_id}
                      onChange={(e) => setDeviceForm({ ...deviceForm, geofence_id: e.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white"
                    >
                      <option value="">None</option>
                      {geofenceOptions.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {isDetail && dialog.device && (
              <div className="space-y-2 text-sm text-slate-200">
                <p><span className="text-slate-400">SSEN:</span> {dialog.device.name}</p>
                <p><span className="text-slate-400">Unique ID:</span> {dialog.device.unique_id || '—'}</p>
                <p><span className="text-slate-400">Owner:</span> {ownerDisplay(dialog.device.user_id)}</p>
                <p><span className="text-slate-400">Geofence:</span> {geofenceNameById(dialog.device.geofence_id)}</p>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
              {!isDetail && (
                <Button disabled={busy} onClick={submitDevice} className="bg-emerald-600 text-white hover:bg-emerald-500">
                  {busy ? 'Saving...' : 'Save'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    if (dialog.kind === 'geofence') {
      const isDetail = dialog.mode === 'detail'
      return (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent className="bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>{dialog.mode === 'create' ? 'Create geofence' : dialog.mode === 'edit' ? 'Edit geofence' : 'Geofence details'}</DialogTitle>
            </DialogHeader>
            {!isDetail && (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm text-slate-200">Name</Label>
                  <Input value={geofenceForm.name} onChange={(e) => setGeofenceForm({ ...geofenceForm, name: e.target.value })} className="bg-slate-900 text-white" />
                </div>
                <div>
                  <Label className="text-sm text-slate-200">Description</Label>
                  <Input value={geofenceForm.description} onChange={(e) => setGeofenceForm({ ...geofenceForm, description: e.target.value })} className="bg-slate-900 text-white" />
                </div>
                <div>
                  <Label className="text-sm text-slate-200">Area (WKT POLYGON)</Label>
                  <textarea
                    value={geofenceForm.area}
                    onChange={(e) => setGeofenceForm({ ...geofenceForm, area: e.target.value })}
                    className="h-24 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
            )}

            {isDetail && dialog.geofence && (
              <div className="space-y-2 text-sm text-slate-200">
                <p><span className="text-slate-400">Name:</span> {dialog.geofence.name}</p>
                <p><span className="text-slate-400">Description:</span> {dialog.geofence.description || '—'}</p>
                <p><span className="text-slate-400">Traccar ID:</span> {dialog.geofence.traccar_id || '—'}</p>
                <p className="break-words text-xs"><span className="text-slate-400">Area:</span> {dialog.geofence.area}</p>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
              {!isDetail && (
                <Button disabled={busy} onClick={submitGeofence} className="bg-amber-600 text-white hover:bg-amber-500">
                  {busy ? 'Saving...' : 'Save'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    if (dialog.kind === 'geofence-upload') {
      return (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent className="bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>Upload geofence</DialogTitle>
              <DialogDescription className="text-slate-400">Upload a GeoJSON polygon or WKT POLYGON file.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-sm text-slate-200">Name (optional)</Label>
                <Input value={geofenceForm.name} onChange={(e) => setGeofenceForm({ ...geofenceForm, name: e.target.value })} className="bg-slate-900 text-white" />
              </div>
              <div>
                <Label className="text-sm text-slate-200">Description (optional)</Label>
                <Input value={geofenceForm.description} onChange={(e) => setGeofenceForm({ ...geofenceForm, description: e.target.value })} className="bg-slate-900 text-white" />
              </div>
              <div>
                <Label className="text-sm text-slate-200">File</Label>
                <input type="file" accept=".json,.geojson,.wkt,.txt,.gpx" onChange={(e) => setGeofenceFile(e.target.files?.[0] || null)} className="text-sm text-slate-200" />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
              <Button disabled={busy} onClick={submitGeofenceUpload} className="bg-amber-600 text-white hover:bg-amber-500">
                {busy ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    if (dialog.kind === 'register') {
      const isFisher = dialog.role === 'fisher'
      return (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent className="bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>
                {dialog.role === 'fisher' ? 'Register fisher with device' : dialog.role === 'coast_guard' ? 'Register coast guard' : 'Register admin'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-sm text-slate-200">Name</Label>
                  <Input value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} className="bg-slate-900 text-white" />
                </div>
                <div>
                  <Label className="text-sm text-slate-200">Email</Label>
                  <Input value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} className="bg-slate-900 text-white" />
                </div>
              </div>
              <div>
                <Label className="text-sm text-slate-200">Password</Label>
                <Input type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} className="bg-slate-900 text-white" />
              </div>
              {isFisher && (
                <div className="space-y-3 rounded-md border border-white/10 bg-slate-900/60 p-3">
                  <p className="text-sm font-semibold text-white">Device details</p>
                  <div>
                    <Label className="text-sm text-slate-200">Unique ID</Label>
                    <Input value={registerForm.unique_id} onChange={(e) => setRegisterForm({ ...registerForm, unique_id: e.target.value })} className="bg-slate-900 text-white" />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-200">SSEN</Label>
                    <Input value={registerForm.device_name} onChange={(e) => setRegisterForm({ ...registerForm, device_name: e.target.value })} className="bg-slate-900 text-white" />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-200">Geofence (optional)</Label>
                    <select
                      value={registerForm.geofence_id}
                      onChange={(e) => setRegisterForm({ ...registerForm, geofence_id: e.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white"
                    >
                      <option value="">None</option>
                      {geofenceOptions.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm text-slate-200">Medical record (optional)</Label>
                    <textarea
                      value={registerForm.medical_record}
                      onChange={(e) => setRegisterForm({ ...registerForm, medical_record: e.target.value })}
                      className="h-20 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
              <Button disabled={busy} onClick={submitRegister} className="bg-cyan-600 text-white hover:bg-cyan-500">
                {busy ? 'Submitting...' : 'Submit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    if (dialog.kind === 'delete') {
      const cascadeLabel = dialog.target === 'user' ? 'Also delete their devices' : dialog.target === 'device' ? 'Also delete the owner user' : ''
      return (
        <Dialog open onOpenChange={(v) => !v && setDialog(null)}>
          <DialogContent className="bg-slate-950 text-white">
            <DialogHeader>
              <DialogTitle>Confirm delete</DialogTitle>
              <DialogDescription className="text-slate-400">This action cannot be undone.</DialogDescription>
            </DialogHeader>
            {cascadeLabel && (
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={deleteCascade} onChange={(e) => setDeleteCascade(e.target.checked)} />
                {cascadeLabel}
              </label>
            )}
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button disabled={busy} variant="destructive" onClick={submitDelete}>
                {busy ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )
    }

    return null
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex h-screen">
        <aside className="flex h-full w-72 flex-col border-r border-white/5 bg-slate-900/70 backdrop-blur">
          <div className="px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bantay</p>
            <p className="text-base font-semibold text-white">Admin Panel</p>
          </div>

          <nav className="flex-1 space-y-1 px-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  activeTab === item.key ? 'bg-slate-800 text-white ring-1 ring-cyan-400/50' : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="border-t border-white/5 bg-slate-900/80 p-3">
            <Button variant="destructive" className="flex w-full items-center justify-center gap-2" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/80 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Admin</p>
                <p className="text-lg font-semibold text-white">{activeTab === 'dashboard' ? 'Dashboard' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="border-white/20 text-white">
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Reload
                </Button>
              </div>
            </div>

            <div className="border-b border-white/5 bg-slate-900/70 px-6 py-3 space-y-2">
              {renderFilters()}
              {renderActions()}
              {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            </div>

            <ScrollArea className="flex-1 p-6">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-300">
                  <Activity className="mr-2 h-5 w-5 animate-spin" /> Loading...
                </div>
              ) : (
                <div className="pb-6">{renderContent()}</div>
              )}
            </ScrollArea>
          </div>
        </main>
      </div>
      {renderDialog()}
    </div>
  )
}