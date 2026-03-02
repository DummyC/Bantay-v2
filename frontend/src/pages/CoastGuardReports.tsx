import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Map as MapIcon, Search, UserCircle, Waypoints } from 'lucide-react'

type Report = {
  id: number
  event_id: number
  device_id: number
  device_name?: string | null
  owner_name?: string | null
  filed_by_name?: string | null
  user_id: number
  resolution: string
  notes?: string | null
  timestamp?: string | null
  dismissal_time?: string | null
  event_timestamp?: string | null
}

function formatGMT8(ts?: string | null, fallback = 'N/A') {
  if (!ts) return fallback
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(ts)
  const iso = hasZone ? ts : `${ts}Z`
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return fallback
  return new Date(parsed).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
}

export default function CoastGuardReports() {
  const navigate = useNavigate()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [resolutionFilter, setResolutionFilter] = useState<'all' | 'rescued' | 'false alarm' | 'other'>('all')
  const [selected, setSelected] = useState<Report | null>(null)

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
    }
  }, [authValue, navigate])

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

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch('/api/coastguard/reports?limit=200', { headers: authHeader })
        if (!res.ok) throw new Error('Failed to load reports')
        const body = await res.json()
        setReports(Array.isArray(body) ? body : [])
      } catch (err) {
        setReports([])
      } finally {
        setLoading(false)
      }
    }
    loadReports()
  }, [authHeader])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return reports.filter((r) => {
      if (resolutionFilter !== 'all' && r.resolution?.toLowerCase() !== resolutionFilter) return false
      if (!term) return true
      return [
        r.device_name,
        r.owner_name,
        r.filed_by_name,
        r.resolution,
        r.notes,
        r.device_id?.toString(),
        r.event_id?.toString(),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    })
  }, [reports, search, resolutionFilter])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex h-screen">
        <aside className="flex h-full w-full max-w-[360px] flex-col border-r border-white/5 bg-slate-900/70 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Coast Guard</p>
              <p className="text-base font-semibold text-white">Reports</p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="border-t border-white/5 bg-slate-900/80 p-3">
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2 border border-white/10 bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => navigate('/coast-guard')}
              >
                <MapIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">Map</span>
              </Button>
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700"
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

        <main className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/80 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Reports</p>
                <p className="text-lg font-semibold text-white">Filed SOS resolutions</p>
              </div>
              <Button variant="destructive" className="text-white" onClick={handleLogout}>
                Logout
              </Button>
            </div>

            <div className="flex items-center gap-3 border-b border-white/5 bg-slate-900/70 px-6 py-3">
              <div className="relative w-full max-w-lg">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by device, owner, reporter, resolution, notes"
                  className="bg-slate-900/60 pl-9 text-white placeholder:text-slate-500"
                />
              </div>
              <select
                value={resolutionFilter}
                onChange={(e) => setResolutionFilter(e.target.value as any)}
                className="h-10 rounded-md border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
              >
                <option value="all">All resolutions</option>
                <option value="rescued">Rescued</option>
                <option value="false alarm">False alarm</option>
                <option value="other">Other</option>
              </select>
            </div>

            <ScrollArea className="flex-1 p-6">
              {loading && (
                <div className="flex h-full items-center justify-center text-slate-300">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading reports...
                </div>
              )}

              {!loading && !filtered.length && <p className="text-sm text-slate-400">No reports found.</p>}

              <div className="grid gap-3">
                {filtered.map((r) => (
                  <Card
                    key={r.id}
                    className="cursor-pointer border-white/5 bg-slate-900/70 transition hover:border-cyan-400/40 hover:bg-slate-900"
                    onClick={() => setSelected(r)}
                  >
                    <CardContent className="flex items-start justify-between gap-3 py-3">
                      <div className="space-y-1 text-xs text-slate-200">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                          <Badge className="bg-cyan-500/20 text-cyan-100">Event #{r.event_id}</Badge>
                          <Badge className="bg-slate-700 text-slate-100">{r.device_name || `Device ${r.device_id}`}</Badge>
                          {r.owner_name && <Badge className="bg-slate-800 text-slate-100">Owner: {r.owner_name}</Badge>}
                        </div>
                        <p className="text-sm font-semibold text-white">{r.resolution}</p>
                        <p className="text-[12px] text-slate-400">Notes: {r.notes || 'No notes'}</p>
                        <p className="text-[11px] text-slate-500">
                          Filed by {r.filed_by_name || `User ${r.user_id}`} · {formatGMT8(r.timestamp, 'No timestamp')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </main>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => setSelected(open ? selected : null)}>
        <DialogContent className="max-w-xl bg-slate-950 text-slate-100">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  Report #{selected.id}
                  <Badge className="bg-cyan-500/20 text-cyan-100">Event {selected.event_id}</Badge>
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  {selected.device_name || `Device ${selected.device_id}`} · {selected.owner_name || 'Unknown owner'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 text-sm text-slate-200">
                <p className="font-semibold">Resolution</p>
                <p className="rounded-md border border-white/10 bg-slate-900/60 p-2 text-slate-100">{selected.resolution}</p>
                <p className="rounded-md border border-white/10 bg-slate-900/60 p-2 text-slate-200">Notes: {selected.notes || 'No notes'}</p>
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="space-y-1">
                    <p className="text-slate-400">Filed by</p>
                    <p className="font-semibold text-slate-100">{selected.filed_by_name || `User ${selected.user_id}`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400">Owner</p>
                    <p className="font-semibold text-slate-100">{selected.owner_name || 'Unknown'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400">Event time</p>
                    <p>{formatGMT8(selected.event_timestamp)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400">Report time</p>
                    <p>{formatGMT8(selected.timestamp)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400">Dismissal time</p>
                    <p>{formatGMT8(selected.dismissal_time)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
