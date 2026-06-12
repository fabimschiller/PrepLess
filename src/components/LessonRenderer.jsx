import { memo } from 'react'
import './LessonRenderer.css'

const LessonRenderer = memo(function LessonRenderer({ lessonJson, isStreaming = false }) {
  if (!lessonJson || typeof lessonJson !== 'object') {
    return <div className="lesson-renderer-loading">Stunde wird geladen…</div>
  }

  const {
    titel,
    fach,
    jahrgang,
    schultyp,
    dauer_minuten = 45,
    lernziele = [],
    phasen = [],
    differenzierung = {},
    wissenschaft,
  } = lessonJson

  // Progressive Rendering: nur anzeigen was bereits vorhanden ist
  const isEmpty = !titel && lernziele.length === 0 && phasen.length === 0

  return (
    <div className="lesson-renderer">{isEmpty ? (
        <div className="lesson-renderer-loading">Stunde wird geladen…</div>
      ) : (
        <>

      {/* HEADER */}
      <div className="lesson-header">
        <h1 className="lesson-title">{titel}</h1>
        <p className="lesson-meta">
          {fach} · Jg. {jahrgang} · {schultyp} · {dauer_minuten} Min
        </p>

        {lernziele.length > 0 && (
          <div className="lesson-lernziele">
            <h3>Lernziele</h3>
            <ul>
              {lernziele.map((ziel, idx) => (
                <li key={idx}>{ziel}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* PHASEN */}
      {phasen.length > 0 && (
        <div className="lesson-phasen">
          <h2>Stundenablauf</h2>
          <div className="phasen-list">
            {phasen.map((phase, idx) => (
              <div key={idx} className="phase-card">
                <div className="phase-header">
                  <span className="phase-number">{phase.nummer}</span>
                  <span className="phase-title">{phase.titel}</span>
                  <span className="phase-duration">{phase.dauer_minuten} Min</span>
                </div>

                <div className="phase-content">
                  {phase.inhalt && (
                    <div className="phase-inhalt">
                      <p>{phase.inhalt}</p>
                    </div>
                  )}

                  {phase.lehreraktion && (
                    <div className="phase-aktion">
                      <label>👩‍🏫 Lehrkraft:</label>
                      <p>{phase.lehreraktion}</p>
                    </div>
                  )}

                  {phase.schueleraktion && (
                    <div className="phase-aktion">
                      <label>👥 Schüler:</label>
                      <p>{phase.schueleraktion}</p>
                    </div>
                  )}

                  {phase.material && phase.material.length > 0 && (
                    <div className="phase-material">
                      <label>Material:</label>
                      <div className="material-chips">
                        {phase.material.map((mat, midx) => (
                          <span key={midx} className="material-chip">
                            {mat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {phase.transition && (
                    <div className="phase-transition">
                      → {phase.transition}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DIFFERENZIERUNG */}
      {(differenzierung.foerderung || differenzierung.erweiterung) && (
        <div className="lesson-differenzierung">
          <h2>Differenzierung</h2>
          <div className="diff-columns">
            {differenzierung.foerderung && (
              <div className="diff-column">
                <h3>🔽 Förderung</h3>
                <p>{differenzierung.foerderung}</p>
              </div>
            )}
            {differenzierung.erweiterung && (
              <div className="diff-column">
                <h3>🔼 Erweiterung</h3>
                <p>{differenzierung.erweiterung}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WISSENSCHAFT */}
      {wissenschaft && (
        <div className="lesson-wissenschaft">
          <h2>🔬 Wissenschaftliche Begründung</h2>
          <p>{wissenschaft}</p>
        </div>
      )}

      {/* LOADING INDICATOR */}
      {isStreaming && (
        <div className="lesson-loading">
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p className="loading-text">
            👨‍🏫 Gute Unterrichtsstunden brauchen etwas Zeit — auch für uns. Gleich ist es soweit. 👷
          </p>
        </div>
      )}
        </>
      )}
    </div>
  )
})

export default LessonRenderer
