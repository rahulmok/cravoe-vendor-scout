'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Sign in failed')
      router.replace('/')
      router.refresh()
    } catch (cause) {
      setError(cause.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-shell">
    <div className="login-glow login-glow-one" />
    <div className="login-glow login-glow-two" />
    <section className="login-frame">
      <div className="login-brand">
        <div className="login-mark">C</div>
        <span>CRAVOE</span>
      </div>

      <div className="login-copy">
        <span className="login-kicker">INTERNAL ACQUISITION INTELLIGENCE</span>
        <h1>Find the restaurants<br/><em>worth chasing.</em></h1>
        <p>Private vendor discovery, research and outreach pipeline for Cravoe.</p>
      </div>

      <form className="login-card" onSubmit={submit}>
        <div className="login-card-head">
          <span>SECURE ACCESS</span>
          <b>Vendor Scout</b>
          <p>Enter your internal passphrase to continue.</p>
        </div>

        <label className="login-field" htmlFor="password">
          <span>Passphrase</span>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Enter passphrase"
            required
            maxLength={1024}
            autoFocus
          />
        </label>

        {error && <p className="login-error" role="alert">{error}</p>}

        <button className="login-submit" type="submit" disabled={busy || !password}>
          <span>{busy ? 'Authenticating…' : 'Enter Vendor Scout'}</span>
          <span aria-hidden="true">↗</span>
        </button>

        <div className="login-foot">
          <span><i /> Private workspace</span>
          <span>Cravoe · Kolkata</span>
        </div>
      </form>
    </section>
  </main>
}
