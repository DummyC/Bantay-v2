import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, LogOut, Map as MapIcon, Shield, User, UserCircle } from 'lucide-react'

type UserProfile = {
  id: number
  name: string
  email: string
  role: string
  created_at?: string | null
}

function formatGMT8(ts?: string | null, fallback = 'N/A') {
  if (!ts) return fallback
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(ts)
  const iso = hasZone ? ts : `${ts}Z`
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return fallback
  return new Date(parsed).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
}

export default function FisherfolkAccount() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changeLoading, setChangeLoading] = useState(false)
  const [changeError, setChangeError] = useState<string | null>(null)
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null)

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
    }
  }, [authValue, navigate])

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/auth/me', { headers: authHeader })
        if (!res.ok) throw new Error('Failed to load profile')
        const body = await res.json()
        if ((body.role?.name || body.role) !== 'fisherfolk') {
          navigate('/login', { replace: true })
          return
        }
        setProfile(body)
      } catch (err) {
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [token, authHeader, navigate])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: authHeader })
    } catch (err) {
      // ignore network errors on logout
    } finally {
      localStorage.removeItem('auth')
      navigate('/login', { replace: true })
    }
  }

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    if (!currentPassword || !newPassword || !confirmPassword) {
      setChangeError('Please fill in all fields')
      setChangeSuccess(null)
      return
    }
    if (newPassword !== confirmPassword) {
      setChangeError('New passwords do not match')
      setChangeSuccess(null)
      return
    }

    setChangeLoading(true)
    setChangeError(null)
    setChangeSuccess(null)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader || {}),
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail || 'Unable to change password')
      }

      setChangeSuccess('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setChangeError(err?.message || 'Unable to change password')
    } finally {
      setChangeLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="hidden h-full w-full max-w-[340px] flex-col border-r border-white/5 bg-slate-900/75 backdrop-blur lg:flex">
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Fisherfolk</p>
              <p className="text-base font-semibold text-white">Account</p>
            </div>
            <Shield className="h-5 w-5 text-cyan-300" />
          </div>

          <div className="flex-1" />

          <div className="border-t border-white/5 bg-slate-900/80 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                className="flex items-center justify-center gap-2 border border-white/10 bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => navigate('/fisherfolk')}
              >
                <MapIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">Map</span>
              </Button>
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700"
              >
                <UserCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">Account</span>
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/80 px-4 py-3 lg:px-6 lg:py-4">
              <div className="flex items-center gap-2 lg:hidden">
                <Button variant="ghost" size="icon" onClick={() => navigate('/fisherfolk')} aria-label="Back to map">
                  <MapIcon className="h-4 w-4 text-white" />
                </Button>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">Fisherfolk</p>
                  <p className="text-sm font-semibold text-white">Account</p>
                </div>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Account</p>
                <p className="text-lg font-semibold text-white">Your profile</p>
              </div>
              <Button variant="destructive" onClick={handleLogout} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-6">
              {loading && (
                <div className="flex h-full items-center justify-center text-slate-300">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profile...
                </div>
              )}

              {!loading && profile && (
                <Card className="border-white/5 bg-slate-900/80">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-5 w-5" /> {profile.name || 'Unknown'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-200">
                    <p>Email: {profile.email}</p>
                    <p className="flex items-center gap-2">
                      Role:
                      <Badge className="bg-cyan-500/20 text-cyan-100">{profile.role}</Badge>
                    </p>
                    {profile.created_at && (
                      <p className="text-xs text-slate-400">Joined {formatGMT8(profile.created_at)}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {!loading && !profile && (
                <Alert className="border-red-500/40 bg-red-500/10 text-red-50">
                  <AlertDescription>Unable to load account information.</AlertDescription>
                </Alert>
              )}

              <Card className="border-white/5 bg-slate-900/80">
                <CardHeader>
                  <CardTitle className="text-lg">Change password</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={handlePasswordChange}>
                    <div className="space-y-1">
                      <Label htmlFor="current-password">Current password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-slate-900 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-slate-900 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="confirm-password">Confirm new password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-slate-900 text-white"
                      />
                    </div>

                    {changeError && <p className="text-sm text-red-300">{changeError}</p>}
                    {changeSuccess && <p className="text-sm text-emerald-300">{changeSuccess}</p>}

                    <div className="flex justify-end gap-2">
                      <Button type="submit" disabled={changeLoading} className="bg-cyan-600 text-white hover:bg-cyan-500">
                        {changeLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
