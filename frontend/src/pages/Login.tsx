import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

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
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-[380px]">
        <CardHeader>
          <CardTitle>Bantay</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label className="pb-2" htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label className="pb-2" htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <Button variant="outline" type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Login'}</Button>
            </div>
            {error && <div className="text-destructive">{error}</div>}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
