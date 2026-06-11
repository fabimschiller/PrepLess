import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const isRegister = mode === 'register'

  function toggleMode() {
    setMode(isRegister ? 'login' : 'register')
    setError(null)
    setInfo(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error

        // Wenn E-Mail-Bestätigung in Supabase aktiviert ist, gibt es noch keine Session.
        if (data.session) {
          navigate('/', { replace: true })
        } else {
          setInfo(
            'Account erstellt. Bitte E-Mail-Postfach prüfen und Bestätigungslink anklicken.'
          )
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err.message ?? 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">PrepLess</div>
        <h1 className="login-title">
          {isRegister ? 'Account erstellen' : 'Willkommen zurück'}
        </h1>
        <p className="login-subtitle">
          {isRegister
            ? 'Registriere dich mit E-Mail und Passwort.'
            : 'Melde dich mit E-Mail und Passwort an.'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          {error && <div className="login-alert error">{error}</div>}
          {info && <div className="login-alert success">{info}</div>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading
              ? 'Bitte warten…'
              : isRegister
                ? 'Registrieren'
                : 'Einloggen'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? 'Schon einen Account?' : 'Noch keinen Account?'}
          <button type="button" onClick={toggleMode}>
            {isRegister ? 'Einloggen' : 'Registrieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
