'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, Moon, ShieldCheck, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'signup'
const THEME_STORAGE_KEY = 'tesori-italia-theme'

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get('mode')
    if (requestedMode === 'signup') setMode('signup')
  }, [])

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (savedTheme === 'dark') setIsDarkMode(true)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

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
    window.location.assign(new URL('./', window.location.href).toString())
  }

  return (
    <main className={`auth-page ${isDarkMode ? 'auth-dark' : ''}`}>
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <Link href="/" className="auth-back auth-back-home"><ArrowLeft className="size-5" /><span>Torna alla home</span></Link>
      <button type="button" className="auth-theme-toggle" onClick={() => setIsDarkMode((current) => !current)} aria-label={isDarkMode ? 'Attiva modalità chiara' : 'Attiva modalità scura'}>{isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>

      <div className="auth-layout">
        <section className="auth-intro">
          <div className="auth-identity"><img src="/Tesori-italia-900/logo.jpg" alt="Tesori Italia '900s" /><span>Tesori Italia <b>'900s</b></span></div>
          <p className="auth-page-kicker"><span /> Negozio online</p>
          <h1>Trova qualcosa di<br /><em>speciale.</em></h1>
          <p className="auth-intro-copy">Entra in Tesori Italia '900s e scopri oggetti vintage, memorabilia e pezzi da collezione scelti per chi ama le cose con una storia.</p>
          <div className="auth-benefits">
            <p><Check /> Pezzi selezionati da scoprire</p>
            <p><Check /> Prezzi chiari e acquisto su eBay</p>
            <p><Check /> Catalogo aggiornato ogni giorno</p>
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
