/**
 * StundenView – Smartphone-Slideshow für eine einzelne Stunde
 * Route: /stunde/:lessonId
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './StundenView.css'

export default function StundenView() {
  const { lessonId } = useParams()
  console.log('RAW lessonId from useParams:', lessonId)
  const navigate = useNavigate()
  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [parsedContent, setParsedContent] = useState(null)
  const [currentPhase, setCurrentPhase] = useState(0)
  const [expandedDetails, setExpandedDetails] = useState(false)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    async function load() {
      console.log('1. lessonId:', lessonId)
      
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .maybeSingle()
      
      console.log('2. data:', data)
      console.log('3. error:', error)
      
      if (error) { setError(error.message); setLoading(false); return }
      if (!data) { setError('not_found'); setLoading(false); return }
      
      try {
        const parsed = JSON.parse(data.content)
        console.log('4. parsed OK:', parsed.titel)
        setLesson(parsed)
        setParsedContent(parsed)
      } catch(e) {
        console.log('4. parse error:', e.message)
        setError('legacy')
      }
      setLoading(false)
    }
    if (lessonId) load()
  }, [lessonId])

  async function handleMarkConducted() {
    if (!lessonId) return
    setMarking(true)
    try {
      const { error: updateError } = await supabase
        .from('lessons')
        .update({ status: 'conducted' })
        .eq('id', lessonId)

      if (updateError) throw updateError
      // Nach erfolgreichem Update: kurz warten, dann zurück
      setTimeout(() => {
        navigate('/')
      }, 500)
    } catch (err) {
      console.error('Error marking as conducted:', err)
      setError('Fehler beim Speichern')
    } finally {
      setMarking(false)
    }
  }

  if (loading) {
    return (
      <div className="stunden-view">
        <div className="stunden-loading">Lädt…</div>
      </div>
    )
  }

  if (error === 'legacy') {
    return (
      <div className="stunden-view">
        <div className="stunden-slide stunden-error-slide">
          <div className="stunden-error-content">
            <div className="stunden-error-icon">⚠️</div>
            <h2>Diese Stunde ist zu alt</h2>
            <p>Diese Stunde wurde mit einer älteren Version von PrepLess erstellt. Bitte generiere sie neu um die Smartphone-Ansicht zu nutzen.</p>
            <button
              className="stunden-btn stunden-btn-primary stunden-btn-large"
              onClick={() => navigate('/')}
            >
              Zurück zur App
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="stunden-view">
        <div className="stunden-slide stunden-error-slide">
          <div className="stunden-error-content">
            <div className="stunden-error-icon">❓</div>
            <h2>Stunde nicht gefunden</h2>
            <p>Diese Stunde existiert nicht oder wurde gelöscht.</p>
            <button
              className="stunden-btn stunden-btn-primary stunden-btn-large"
              onClick={() => navigate('/')}
            >
              Zurück zur App
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stunden-view">
        <div className="stunden-slide stunden-error-slide">
          <div className="stunden-error-content">
            <div className="stunden-error-icon">❌</div>
            <h2>Fehler beim Laden</h2>
            <p>{error}</p>
            <p style={{ fontSize: '12px', color: 'gray', marginTop: '12px', maxWidth: '300px', wordBreak: 'break-word' }}>
              {error}
            </p>
            <button
              className="stunden-btn stunden-btn-primary stunden-btn-large"
              onClick={() => navigate('/')}
            >
              Zurück zur App
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="stunden-view">
        <div className="stunden-slide stunden-error-slide">
          <div className="stunden-error-content">
            <div className="stunden-error-icon">❓</div>
            <h2>Lektion nicht gefunden</h2>
            <button
              className="stunden-btn stunden-btn-primary stunden-btn-large"
              onClick={() => navigate('/')}
            >
              Zurück zur App
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!parsedContent) {
    return (
      <div className="stunden-view">
        <div className="stunden-slide stunden-error-slide">
          <div className="stunden-error-content">
            <div className="stunden-error-icon">⚠️</div>
            <h2>Stundeninhalt konnte nicht geladen werden</h2>
            <button
              className="stunden-btn stunden-btn-primary stunden-btn-large"
              onClick={() => navigate('/')}
            >
              Zurück zur App
            </button>
          </div>
        </div>
      </div>
    )
  }

  console.log('[StundenView Render]', {
    loading,
    error,
    lessonExists: !!lesson,
    parsedContentExists: !!parsedContent,
    currentPhase,
  })

  const phases = parsedContent.phasen || []
  const totalPhases = phases.length
  const isIntro = currentPhase === 0
  const isOutro = currentPhase === totalPhases + 1
  const currentPhaseData = phases[currentPhase - 1] || null

  return (
    <div className="stunden-view">
      {/* SLIDE 0: Intro */}
      {isIntro && (
        <div className="stunden-slide stunden-intro">
          <div className="stunden-logo">PrepLess</div>
          
          <h1 className="stunden-title">{parsedContent.titel}</h1>
          
          <div className="stunden-meta">
            <span>{parsedContent.fach}</span>
            <span>·</span>
            <span>Jg. {parsedContent.jahrgang}</span>
            <span>·</span>
            <span>{parsedContent.schultyp}</span>
          </div>

          <div className="stunden-duration">⏱ {parsedContent.dauer_minuten} Minuten</div>

          {parsedContent.lernziele && parsedContent.lernziele.length > 0 && (
            <div className="stunden-lernziele">
              <h3>Lernziele:</h3>
              <ul>
                {parsedContent.lernziele.map((ziel, idx) => (
                  <li key={idx}>{ziel}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="stunden-btn stunden-btn-primary stunden-btn-large"
            onClick={() => setCurrentPhase(1)}
          >
            Stunde beginnen →
          </button>
        </div>
      )}

      {/* SLIDES 1 bis N: Phasen */}
      {!isIntro && !isOutro && currentPhaseData && (
        <div className="stunden-slide stunden-phase">
          {/* Fortschrittsbalken */}
          <div className="stunden-progress-container">
            <div className="stunden-progress-bar">
              <div
                className="stunden-progress-fill"
                style={{
                  width: `${((currentPhase - 1) / totalPhases) * 100}%`,
                }}
              />
            </div>
            <div className="stunden-progress-text">
              Phase {currentPhase} von {totalPhases}
            </div>
          </div>

          {/* Phase Header */}
          <div className="stunden-phase-header">
            <div className="stunden-phase-number">Phase {currentPhaseData.nummer}</div>
            <h2 className="stunden-phase-title">{currentPhaseData.titel}</h2>
          </div>

          {/* Dauer */}
          <div className="stunden-phase-duration">
            ⏱ {currentPhaseData.dauer_minuten} min
          </div>

          {/* Kurzfassung (Gedächtnisstütze) */}
          <div className="stunden-kurzfassung">
            {currentPhaseData.kurzfassung}
          </div>

          {/* Akkordeon: Details */}
          <div className="stunden-accordion">
            <button
              className="stunden-accordion-trigger"
              onClick={() => setExpandedDetails(!expandedDetails)}
            >
              {expandedDetails ? '▼' : '▶'} Details anzeigen
            </button>
            {expandedDetails && (
              <div className="stunden-accordion-content">
                {currentPhaseData.inhalt && (
                  <div className="stunden-detail-block">
                    <h4>Inhalt:</h4>
                    <p>{currentPhaseData.inhalt}</p>
                  </div>
                )}
                {currentPhaseData.lehreraktion && (
                  <div className="stunden-detail-block">
                    <h4>Lehreraktion:</h4>
                    <p>{currentPhaseData.lehreraktion}</p>
                  </div>
                )}
                {currentPhaseData.schueleraktion && (
                  <div className="stunden-detail-block">
                    <h4>Schüleraktion:</h4>
                    <p>{currentPhaseData.schueleraktion}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Material als Chips */}
          {currentPhaseData.material && currentPhaseData.material.length > 0 && (
            <div className="stunden-material">
              {currentPhaseData.material.map((mat, idx) => (
                <span key={idx} className="stunden-material-chip">
                  {mat}
                </span>
              ))}
            </div>
          )}

          {/* Transition */}
          {currentPhaseData.transition && (
            <div className="stunden-transition">
              → {currentPhaseData.transition}
            </div>
          )}

          {/* Navigation */}
          <div className="stunden-navigation">
            <button
              className="stunden-btn stunden-btn-back"
              onClick={() => setCurrentPhase(currentPhase - 1)}
              disabled={currentPhase === 1}
            >
              ← Zurück
            </button>
            <button
              className="stunden-btn stunden-btn-primary"
              onClick={() => {
                if (currentPhase < totalPhases) {
                  setCurrentPhase(currentPhase + 1)
                  setExpandedDetails(false)
                } else {
                  setCurrentPhase(totalPhases + 1)
                }
              }}
            >
              Weiter →
            </button>
          </div>
        </div>
      )}

      {/* SLIDE N+1: Abschluss */}
      {isOutro && (
        <div className="stunden-slide stunden-outro">
          <div className="stunden-checkmark">✓</div>
          <h2 className="stunden-outro-title">Stunde abgeschlossen!</h2>
          
          <button
            className="stunden-btn stunden-btn-primary stunden-btn-large"
            onClick={handleMarkConducted}
            disabled={marking}
          >
            {marking ? 'Speichert…' : 'Als durchgeführt markieren'}
          </button>

          <button
            className="stunden-btn stunden-btn-secondary stunden-btn-large"
            onClick={() => navigate('/')}
          >
            Zurück zur App
          </button>
        </div>
      )}
    </div>
  )
}
