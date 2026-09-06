'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get('mode')
    if (requestedMode === 'signup') setMode('signup')
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setMessage('Configura le variabili Supabase per continuare.')
      return
    }
    setIsSubmitting(true)
    setMessage('')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })
    setIsSubmitting(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    if (mode === 'signup') {
      setMessage("Account creato. Controlla l'email per confermare l'accesso.")
      return
    }
    window.location.assign('/')
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <header className="auth-page-header">
        <Link href="/" className="auth-brand"><img src="/logo.jpg" alt="Tesori Italia '900s" /><span>Tesori Italia <b>'900s</b></span></Link>
        <Link href="/" className="auth-back"><ArrowLeft className="size-4" /> Torna al catalogo</Link>
      </header>

      <div className="auth-layout">
        <section className="auth-intro">
          <p className="auth-page-kicker"><span /> Collezione privata</p>
          <h1>Il tuo catalogo,<br /><em>sempre con te.</em></h1>
          <p className="auth-intro-copy">Accedi a Tesori Italia '900s per esplorare e gestire il tuo inventario con la calma e la precisione di una collezione curata.</p>
          <div className="auth-benefits">
            <p><Check /> Accesso personale e sicuro</p>
            <p><Check /> Catalogo pronto in pochi istanti</p>
            <p><Check /> Un'esperienza senza distrazioni</p>
          </div>
        </section>

        <section className="auth-card" aria-labelledby="auth-page-title">
          <div className="auth-segmented" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMessage('') }}>Login</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage('') }}>Sign Up</button>
          </div>
          <div className="auth-card-heading">
            <div className="auth-card-icon">{mode === 'login' ? <LockKeyhole /> : <ShieldCheck />}</div>
            <p className="auth-kicker">Tesori Italia '900s</p>
            <h2 id="auth-page-title">{mode === 'login' ? 'Bentornato.' : 'Inizia la tua collezione.'}</h2>
            <p>{mode === 'login' ? 'Accedi al tuo spazio personale.' : 'Crea un account per continuare.'}</p>
          </div>
          <form onSubmit={handleSubmit} className="auth-page-form">
            <label><span>Email</span><div className="auth-input-wrap"><Mail /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@email.com" /></div></label>
            <label><span>Password</span><div className="auth-input-wrap"><LockKeyhole /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Almeno 6 caratteri" /><button type="button" aria-label={showPassword ? 'Nascondi password' : 'Mostra password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {message && <p className="auth-page-message" role="status">{message}</p>}
            <button type="submit" className="auth-page-submit" disabled={isSubmitting}>{isSubmitting ? 'Attendi…' : mode === 'login' ? 'Accedi al catalogo' : 'Crea il mio account'}<ArrowRight /></button>
          </form>
          <p className="auth-legal">Continuando accetti i termini di utilizzo del catalogo.</p>
        </section>
      </div>
    </main>
  )
}
