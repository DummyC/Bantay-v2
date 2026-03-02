import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-500/20 ring-1 ring-cyan-400/40" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bantay</p>
            <p className="text-sm font-semibold text-white">Coastal Safety Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200">Secure access</Badge>
          <Link to="/login">
            <Button variant="secondary" className="bg-white text-slate-900 hover:bg-slate-200">Login</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-4 pb-16 pt-6 sm:px-8 lg:flex-row lg:items-center lg:gap-16 lg:pb-24">
        <div className="w-full max-w-2xl space-y-6">
          <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-100">Coast Guard • Fisherfolk • Admin</Badge>
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Keep fisherfolk safe with live tracking, SOS alerts, and rapid response.
          </h1>
          <p className="text-lg text-slate-200">
            Bantay unifies vessel tracking, distress monitoring, and medical context so you can react fast when every second counts.
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-slate-200">
            <Badge variant="outline" className="border-white/15 bg-white/5">Real-time positions</Badge>
            <Badge variant="outline" className="border-white/15 bg-white/5">SOS escalations</Badge>
            <Badge variant="outline" className="border-white/15 bg-white/5">Role-aware access</Badge>
            <Badge variant="outline" className="border-white/15 bg-white/5">Medical context</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/login">
              <Button size="lg" className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">Proceed to login</Button>
            </Link>
            <p className="text-sm text-slate-300">Authorized users only.</p>
          </div>
        </div>

        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Live watch</p>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-100">Operational</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-sm text-slate-200">
              <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                <p className="text-2xl font-semibold text-white">24</p>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Trackers</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                <p className="text-2xl font-semibold text-white">3</p>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">SOS (24h)</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                <p className="text-2xl font-semibold text-white">7</p>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Patrols</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-gradient-to-r from-cyan-500/15 via-blue-500/15 to-indigo-500/15 p-4 text-sm text-slate-200">
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-100">How it works</p>
              <ul className="mt-2 space-y-2 list-disc pl-4">
                <li>Vessels broadcast positions and alarms via secure devices.</li>
                <li>Control rooms receive live updates and incident details.</li>
                <li>Responders dispatch aid with medical context on hand.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
