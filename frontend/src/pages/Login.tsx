import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('auth')
    if (!token) return
    ;(async () => {
      try {
        const me = await fetch('/api/auth/me', { headers: { Authorization: token } })
        if (!me.ok) {
          localStorage.removeItem('auth')
          return
        }
        const u = await me.json()
        const role = u.role?.name || u.role
        if (role === 'administrator') navigate('/admin')
        else if (role === 'coast_guard') navigate('/coast-guard')
        else navigate('/fisherfolk')
      } catch (err) {
        localStorage.removeItem('auth')
      }
    })()
  }, [navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error('Login failed')
      const data = await res.json()
      const token = `${data.token_type} ${data.access_token}`
      localStorage.setItem('auth', token)

      const me = await fetch('/api/auth/me', { headers: { Authorization: token } })
      if (!me.ok) throw new Error('Failed to fetch user')
      const u = await me.json()
      const role = u.role?.name || u.role

      if (role === 'administrator') navigate('/admin')
      else if (role === 'coast_guard') navigate('/coast-guard')
      else navigate('/fisherfolk')
    } catch (err: any) {
      setError(err.message || 'Login error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex flex-col">
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-8">
          <div className="mb-4 flex items-center gap-3">
            <img src="/icons/bantay-icon.svg" alt="Bantay" className="h-10 w-auto" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Bantay</p>
              <p className="text-sm font-semibold text-white">Operations Console</p>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-start sm:items-center">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-2 sm:px-8 lg:flex-row lg:py-0">
          <div className="w-full max-w-xl space-y-4 pb-4 text-center lg:w-1/2 lg:pb-0 lg:text-left">
            <Badge variant="outline" className="border-white/20 bg-white/10 text-slate-200">
              Coastal Safety
            </Badge>
            <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Bantay Operations Console
            </h1>
            <p className="max-w-xl text-sm text-slate-300 sm:text-base">
              Monitor vessels, receive alerts, and respond quickly. Secure access for administrators, coast guards, and fisherfolk.
            </p>
            <div className="hidden flex-wrap gap-2 text-xs text-slate-300 sm:flex">
              <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-200">Real-time positions</Badge>
              <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-200">Event alerts</Badge>
              <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-200">Role-based access</Badge>
            </div>
          </div>

            <div className="w-full max-w-lg lg:w-1/2">
              <Card className="border-white/10 bg-slate-900/70 backdrop-blur">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-xl text-white">Sign in to Bantay</CardTitle>
                  <p className="text-sm text-slate-300">Use your issued credentials to continue.</p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-slate-200" htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-slate-950/60 text-white placeholder:text-slate-500"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-200" htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="bg-slate-950/60 text-white placeholder:text-slate-500"
                        placeholder="••••••••"
                      />
                    </div>

                    {error && (
                      <Alert variant="destructive" className="border-red-500/40 bg-red-500/10 text-red-50">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-white text-slate-900 hover:bg-slate-100"
                    >
                      {loading ? 'Signing in…' : 'Sign in'}
                    </Button>
                    <p className="text-center text-xs text-slate-400">
                      Access for authorized personnel only.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
