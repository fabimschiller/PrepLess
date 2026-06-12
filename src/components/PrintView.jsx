/**
 * PrintView.jsx
 *
 * Wird nicht direkt in der App gerendert — der Inhalt dieser Komponente
 * wird via renderToStaticMarkup() als HTML-String in ein neues Fenster
 * geschrieben und dort gedruckt.
 *
 * Props:
 *   lessonJson  – geparste Lektion { titel, lernziele, phasen, differenzierung, ... }
 *   meta        – { subject, grade, schoolType, className }
 */
export default function PrintView({ lessonJson, meta = {} }) {
  if (!lessonJson) return null

  const { titel, lernziele = [], phasen = [], differenzierung } = lessonJson
  const { subject, grade, schoolType, className } = meta

  const gesamtdauer = phasen.reduce((sum, p) => sum + (p.dauer_minuten ?? 0), 0)

  const metaLine = [subject, grade ? `Jg. ${grade}` : null, schoolType]
    .filter(Boolean)
    .join(' · ')

  const hasDiff = differenzierung?.foerderung || differenzierung?.erweiterung

  return (
    <div>
      {/* ── KARTE 0: Übersicht ─────────────────────────────────────── */}
      <div className="karte karte-overview">
        <div className="karte-logo">PrepLess</div>
        <h1 className="karte-titel">{titel ?? 'Unterrichtsstunde'}</h1>
        {metaLine && <p className="karte-meta">{metaLine}</p>}
        {gesamtdauer > 0 && (
          <p className="karte-dauer">{gesamtdauer} Minuten</p>
        )}
        {lernziele.length > 0 && (
          <div className="karte-lernziele">
            <div className="karte-section-label">Lernziele</div>
            <ul>
              {lernziele.map((z, i) => (
                <li key={i}>{z}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── KARTEN 1…N: Phasen ────────────────────────────────────── */}
      {phasen.map((phase, i) => (
        <div key={i} className="karte karte-phase">
          <div className="karte-phase-header">
            <span className="karte-phase-num">{phase.nummer ?? i + 1}</span>
            <span className="karte-phase-titel">{phase.titel}</span>
            {phase.dauer_minuten && (
              <span className="karte-phase-dauer">{phase.dauer_minuten} min</span>
            )}
          </div>

          {phase.kurzfassung && (
            <p className="karte-kurzfassung">{phase.kurzfassung}</p>
          )}

          <div className="karte-aktionen">
            {phase.lehreraktion && (
              <p className="karte-aktion">
                <span className="karte-aktion-icon">👩‍🏫</span>
                {phase.lehreraktion}
              </p>
            )}
            {phase.schueleraktion && (
              <p className="karte-aktion">
                <span className="karte-aktion-icon">👥</span>
                {phase.schueleraktion}
              </p>
            )}
          </div>

          {phase.material?.length > 0 && (
            <ul className="karte-material">
              {phase.material.map((m, j) => (
                <li key={j}>{m}</li>
              ))}
            </ul>
          )}

          {phase.transition && (
            <p className="karte-transition">→ {phase.transition}</p>
          )}
        </div>
      ))}

      {/* ── LETZTE KARTE: Differenzierung ─────────────────────────── */}
      {hasDiff && (
        <div className="karte karte-diff">
          {differenzierung.foerderung && (
            <div className="karte-diff-block">
              <div className="karte-diff-label">🔽 Förderung</div>
              <p>{differenzierung.foerderung}</p>
            </div>
          )}
          {differenzierung.foerderung && differenzierung.erweiterung && (
            <hr className="karte-diff-hr" />
          )}
          {differenzierung.erweiterung && (
            <div className="karte-diff-block">
              <div className="karte-diff-label">🔼 Erweiterung</div>
              <p>{differenzierung.erweiterung}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
