import { useEffect, useState } from 'react'
import {
  getProfile,
  getLearningProgress,
} from '../lib/db'
import { getSession } from '../lib/auth'
import './MeinLernen.css'

// Level-Logik
const LEVELS = {
  1: { min: 0, max: 99, label: 'Einsteiger' },
  2: { min: 100, max: 249, label: 'Praktiker' },
  3: { min: 250, max: 499, label: 'Erfahrene Lehrkraft' },
  4: { min: 500, max: 999, label: 'Experte' },
  5: { min: 1000, max: Infinity, label: 'Meister' },
}

function getLevelInfo(totalXp) {
  for (let level = 5; level >= 1; level--) {
    if (totalXp >= LEVELS[level].min) {
      const currentLevelMin = LEVELS[level].min
      const nextLevel = level < 5 ? level + 1 : null
      const nextLevelMin = nextLevel ? LEVELS[nextLevel].min : null
      
      return {
        level,
        label: LEVELS[level].label,
        currentXp: totalXp,
        totalXp,
        nextLevelXp: nextLevelMin,
        progressXp: totalXp - currentLevelMin,
        progressMax: nextLevelMin ? nextLevelMin - currentLevelMin : 0,
      }
    }
  }
  return {
    level: 1,
    label: LEVELS[1].label,
    currentXp: totalXp,
    totalXp,
    nextLevelXp: LEVELS[2].min,
    progressXp: totalXp,
    progressMax: LEVELS[2].min,
  }
}

// Thema-Clustering
const THEME_KEYWORDS = {
  'Formatives Assessment': ['feedback', 'assessment', 'bewertung', 'diagnostik'],
  'Differenzierung': ['differenzier', 'heterogen', 'individualis', 'inklus'],
  'Motivation & Lernklima': ['motivation', 'lernklima', 'engagement', 'schulklima'],
  'Kognitive Aktivierung': ['kognitiv', 'aktivierung', 'tiefenverarbeitung', 'lernen'],
  'Klassenführung': ['klassenführung', 'classroom', 'management', 'disziplin'],
}

function detectTheme(resourceTitle) {
  const lower = resourceTitle.toLowerCase()
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return theme
    }
  }
  return 'Allgemeine Didaktik'
}

function formatDate(isoString) {
  const date = new Date(isoString)
  const day = date.getDate()
  const month = date.toLocaleString('de-DE', { month: 'short' })
  const year = date.getFullYear()
  return `${day}. ${month} ${year}`
}

function getTypeIcon(type) {
  switch (type) {
    case 'video': return '🎥'
    case 'artikel': return '📖'
    case 'podcast': return '🎧'
    default: return '📚'
  }
}

function daysAgo(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  return days
}

export default function MeinLernen() {
  const [profile, setProfile] = useState(null)
  const [progress, setProgress] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data: sessionData } = await getSession()
      if (!sessionData?.session?.user) {
        setError('Nicht eingeloggt')
        setLoading(false)
        return
      }

      const userId = sessionData.session.user.id

      // Lade Profil-Daten
      const { data: profileData, error: profileError } = await getProfile(userId)

      if (profileError) throw profileError

      setProfile(profileData || { total_xp: 0, level: 1 })

      // Lade Learning Progress mit Lektion-Info
      const { data: progressData, error: progressError } = await getLearningProgress(userId)

      if (progressError) throw progressError

      setProgress(progressData || [])
    } catch (err) {
      console.error('Error loading MeinLernen data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Lädt…</div>
  if (error) return <div style={{ padding: 24, color: 'red' }}>Fehler: {error}</div>

  if (!profile) return <div style={{ padding: 24 }}>Keine Daten verfügbar</div>

  const levelInfo = getLevelInfo(profile.total_xp || 0)

  // Statistiken
  const totalResources = progress.length
  const videosCount = progress.filter(p => p.resource_type === 'video').length
  const artikelCount = progress.filter(p => p.resource_type === 'artikel').length
  const podcastsCount = progress.filter(p => p.resource_type === 'podcast').length

  const weekAgoDate = new Date()
  weekAgoDate.setDate(weekAgoDate.getDate() - 7)
  const xpThisWeek = progress
    .filter(p => new Date(p.viewed_at) >= weekAgoDate)
    .reduce((sum, p) => sum + (p.xp_earned || 0), 0)

  // Thema-Cluster
  const clusterMap = {}
  progress.forEach(p => {
    const theme = detectTheme(p.resource_title)
    if (!clusterMap[theme]) {
      clusterMap[theme] = []
    }
    clusterMap[theme].push(p)
  })

  const clusters = Object.entries(clusterMap).map(([theme, items]) => ({
    theme,
    count: items.length,
    maxProgress: 5, // Basis: 5 Ressourcen = 100%
  }))

  return (
    <section className="mein-lernen">
      {/* Hero-Bereich */}
      <div className="hero-bereich">
        <div className="level-badge">
          <div className="level-number">{levelInfo.level}</div>
          <div className="level-label">{levelInfo.label}</div>
        </div>

        <div className="xp-info">
          <div className="xp-display">
            <span className="xp-total">{levelInfo.totalXp} XP</span>
          </div>

          {levelInfo.nextLevelXp && (
            <div className="xp-progress">
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${(levelInfo.progressXp / levelInfo.progressMax) * 100}%`,
                  }}
                ></div>
              </div>
              <p className="progress-text">
                {levelInfo.progressXp} / {levelInfo.progressMax} XP bis Level {levelInfo.level + 1}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Statistiken */}
      <div className="statistiken">
        <div className="stat-card">
          <div className="stat-number">{totalResources}</div>
          <div className="stat-label">Ressourcen gesehen</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{xpThisWeek}</div>
          <div className="stat-label">XP diese Woche</div>
        </div>

        <div className="stat-card">
          <div className="stat-subgroup">
            <div className="stat-mini">
              <span className="stat-mini-icon">🎥</span>
              <span className="stat-mini-count">{videosCount}</span>
            </div>
            <div className="stat-mini">
              <span className="stat-mini-icon">📖</span>
              <span className="stat-mini-count">{artikelCount}</span>
            </div>
            <div className="stat-mini">
              <span className="stat-mini-icon">🎧</span>
              <span className="stat-mini-count">{podcastsCount}</span>
            </div>
          </div>
          <div className="stat-label">Videos / Artikel / Podcasts</div>
        </div>
      </div>

      {/* Thematische Cluster */}
      {clusters.length > 0 && (
        <div className="thema-cluster">
          <h2>Meine Lernthemen</h2>
          <div className="cluster-list">
            {clusters.map(cluster => (
              <div key={cluster.theme} className="cluster-item">
                <div className="cluster-header">
                  <h3 className="cluster-title">{cluster.theme}</h3>
                  <span className="cluster-count">{cluster.count}</span>
                </div>
                <div className="cluster-progress">
                  <div className="cluster-progress-bar-container">
                    <div
                      className="cluster-progress-bar"
                      style={{
                        width: `${Math.min((cluster.count / cluster.maxProgress) * 100, 100)}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lernhistorie */}
      {progress.length > 0 && (
        <div className="lernhistorie">
          <h2>Meine Lernhistorie</h2>
          <div className="history-list">
            {progress.map(item => (
              <div key={item.id} className="history-item">
                <div className="history-type">{getTypeIcon(item.resource_type)}</div>
                <div className="history-content">
                  <h4 className="history-title">{item.resource_title}</h4>
                  {item.lessons?.title && (
                    <p className="history-lesson">Stunde: {item.lessons.title}</p>
                  )}
                </div>
                <div className="history-meta">
                  <span className="history-date">{formatDate(item.viewed_at)}</span>
                  <span className="history-xp">+{item.xp_earned} XP</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress.length === 0 && (
        <div className="onboarding-container">
          <div className="onboarding-box">
            <div className="onboarding-icon">🎓</div>
            <h2>Dein Lernweg beginnt hier</h2>
            <div className="onboarding-content">
              <p className="onboarding-intro">
                Verdiene XP indem du die Lernressourcen nutzt die PrepLess dir zu deinen Unterrichtsstunden vorschlägt.
              </p>

              <div className="onboarding-steps">
                <h3>So geht's:</h3>
                <ol>
                  <li>Öffne eine gespeicherte Unterrichtsstunde</li>
                  <li>Klicke auf "🎓 Dahinter steckt…"</li>
                  <li>Lies einen Artikel, schau ein Video oder höre einen Podcast</li>
                  <li>Klicke auf "+ XP · Gesehen" um Punkte zu verdienen</li>
                </ol>
              </div>

              <div className="onboarding-rewards">
                <h3>XP-Verteilung:</h3>
                <div className="reward-item">
                  <span className="reward-icon">📖</span>
                  <span className="reward-text">Artikel (~5 Min) = 10 XP</span>
                </div>
                <div className="reward-item">
                  <span className="reward-icon">🎥</span>
                  <span className="reward-text">Video (~10 Min) = 20 XP</span>
                </div>
                <div className="reward-item">
                  <span className="reward-icon">🎧</span>
                  <span className="reward-text">Podcast (~20 Min) = 40 XP</span>
                </div>
              </div>

              <p className="onboarding-note">
                Je mehr Zeit eine Ressource erfordert, desto mehr XP bekommst du!
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
