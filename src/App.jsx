import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ClassesProvider } from './context/ClassesContext'
import AppLayout from './components/AppLayout'
import Unterricht from './pages/Unterricht'
import Verwaltung from './pages/Verwaltung'
import MeinLernen from './pages/MeinLernen'
import StundenView from './pages/StundenView'
import Login from './pages/Login'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <div style={{ padding: 24 }}>Lädt…</div>
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes – kein Auth erforderlich */}
        <Route
          path="/login"
          element={session ? <Navigate to="/unterricht" replace /> : <Login />}
        />

        <Route path="/stunde/:lessonId" element={<StundenView />} />

        {/* Protected Routes – Auth erforderlich */}
        <Route
          element={
            <RequireAuth session={session}>
              <ClassesProvider>
                <AppLayout user={session?.user} />
              </ClassesProvider>
            </RequireAuth>
          }
         >
           <Route path="/" element={<Navigate to="/unterricht" replace />} />
           <Route path="/unterricht" element={<Unterricht />} />
           <Route path="/verwaltung" element={<Verwaltung />} />
           <Route path="/mein-lernen" element={<MeinLernen />} />
         </Route>

        {/* Wildcard – muss nach allen anderen Routes kommen */}
        <Route path="*" element={
          session ? <Navigate to="/unterricht" replace /> : <Navigate to="/login" replace />
        } />
       </Routes>
    </BrowserRouter>
  )
}

function RequireAuth({ session, children }) {
  const location = useLocation()
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}
