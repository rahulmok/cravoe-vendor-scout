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
    <form className="login-card" onSubmit={submit}>
      <span className="eyebrow">CRAVOE / INTERNAL</span>
      <h1>Vendor Scout</h1>
      <p>Sign in to access the internal restaurant pipeline.</p>
      <label htmlFor="password">Access password</label>
      <input id="password" type="password" autoComplete="current-password" value={password}
        onChange={event => setPassword(event.target.value)} required maxLength={1024} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>
}
