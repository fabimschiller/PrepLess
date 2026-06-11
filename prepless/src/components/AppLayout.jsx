import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useClasses } from '../context/ClassesContext'
import { SCHOOL_TYPE_SHORT } from '../lib/schoolTypes'
import './AppLayout.css'

const NAV_ITEMS = [
  { to: '/unterricht', label: 'Unterricht' },
  { to: '/verwaltung', label: 'Verwaltung' },
  { to: '/mein-lernen', label: 'Mein Lernen' },
]

// Stabile Farben für den Klassen-Punkt, rotierend über Index
const DOT_COLORS = ['#aa3bff', '#2563eb', '#16a34a', '#d99b1f', '#d12d2d']

export default function AppLayout({ user }) {
  const { classes, activeClassId, setActiveClassId, loading } = useClasses()
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          PrepLess
          <span className="sidebar-tagline">Prepare Less. Teach More.</span>
        </div>

        {/* Klassen-Liste */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Meine Klassen</div>
          {loading && (
            <p className="sidebar-empty">Lädt…</p>
          )}
          {!loading && classes.length === 0 && (
            <p className="sidebar-empty">Noch keine Klassen.</p>
          )}
          {!loading && classes.length > 0 && (
            <ul className="sidebar-class-list">
              {classes.map((cls, i) => {
                const isActive = cls.id === activeClassId
                return (
                  <li key={cls.id}>
                    <button
                      type="button"
                      className={`sidebar-class-item ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveClassId(cls.id)}
                    >
                      <span
                        className="sidebar-class-dot"
                        style={{
                          background: DOT_COLORS[i % DOT_COLORS.length],
                        }}
                      />
                      <span className="sidebar-class-label">
                        <span className="sidebar-class-name">
                          {cls.name}
                          {cls.school_type && (
                            <span className="school-type-badge">
                              {' '}{SCHOOL_TYPE_SHORT[cls.school_type] ?? cls.school_type}
                            </span>
                          )}
                        </span>
                        <span className="sidebar-class-meta">
                          {cls.school_type
                            ? `${cls.school_type} · Jg. ${cls.grade}`
                            : `Jg. ${cls.grade}`}
                        </span>
                        {(cls.subjects?.length > 0 || cls.subject) && (
                          <span className="sidebar-class-subjects">
                            {cls.subjects?.length > 0
                              ? cls.subjects.join(', ')
                              : cls.subject}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <hr className="sidebar-divider" />

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <hr className="sidebar-divider" />

        {/* Footer */}
        <div className="sidebar-footer">
          {user?.email && (
            <div className="sidebar-user-email" title={user.email}>
              {user.email}
            </div>
          )}
          <button className="sidebar-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
