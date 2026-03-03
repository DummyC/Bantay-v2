import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 sm:flex-row sm:items-center sm:px-8">
        <div className="flex items-center gap-3">
          <img src="/icons/bantay-icon.svg" alt="Bantay" className="h-10 w-auto" />
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bantay</p>
            <p className="text-sm font-semibold text-white">Coastal Safety Platform</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          <Badge variant="outline" className="hidden border-white/20 bg-white/5 text-slate-200 sm:inline-flex">Secure access</Badge>
          <Link to="/login" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="sm"
              className="w-full bg-white text-slate-900 hover:bg-slate-200 sm:w-auto"
            >
              Login
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-4 pb-20 pt-6 sm:px-8 lg:flex-row lg:items-center lg:gap-16">
        <div className="w-full max-w-3xl space-y-6">
          <Badge variant="outline" className="border-cyan-400/40 bg-cyan-500/10 text-cyan-100">Coast Guard • Fisherfolk • Admin</Badge>
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
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
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 sm:w-auto">Proceed to login</Button>
            </Link>
            <p className="text-sm text-slate-300">Authorized users only.</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur lg:w-1/2 lg:max-w-lg">
          <p className="text-sm font-semibold text-slate-100">Trusted by responders</p>
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-200 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Coverage</p>
              <p className="mt-1 text-lg font-semibold text-white">Provincial waters</p>
              <p className="text-xs text-slate-400">Built for patrol teams and fisherfolk coordinators.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Security</p>
              <p className="mt-1 text-lg font-semibold text-white">Role-based</p>
              <p className="text-xs text-slate-400">Only authorized users can view sensitive locations.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Response</p>
              <p className="mt-1 text-lg font-semibold text-white">SOS-first</p>
              <p className="text-xs text-slate-400">Alerts surface with location and history context.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Reliability</p>
              <p className="mt-1 text-lg font-semibold text-white">Built for sea</p>
              <p className="text-xs text-slate-400">Designed for low signal and rugged use.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
