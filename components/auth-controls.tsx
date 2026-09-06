'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LogIn, LogOut, UserPlus, UserRound, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function AuthControls() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isAccountOpen, setIsAccountOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase?.auth.signOut()
    setUserEmail(null)
  }

  return (
    <>
      <div className="auth-actions" aria-label="Autenticazione">
        {userEmail ? <>
          <button type="button" className="account-icon-button" aria-label="Apri account" onClick={() => setIsAccountOpen((open) => !open)}><UserRound /></button>
          {isAccountOpen && <div className="account-popover"><button className="account-close" onClick={() => setIsAccountOpen(false)}><X /></button><span>{userEmail}</span><button type="button" className="auth-button auth-button-light" onClick={handleLogout}><LogOut className="size-3.5" />Esci</button></div>}
        </> : <>
          <Link href="/auth?mode=login" className="account-icon-button guest-account" aria-label="Login"><UserRound /></Link>
          <span className="auth-desktop-actions"><Link href="/auth?mode=login" className="auth-button auth-button-login"><LogIn className="size-3.5" />Login</Link><Link href="/auth?mode=signup" className="auth-button auth-button-signup"><UserPlus className="size-3.5" />Sign Up</Link></span>
        </>}
      </div>
    </>
  )
}
