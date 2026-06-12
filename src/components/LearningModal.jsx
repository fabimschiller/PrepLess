export default function LearningModal({ learningResources, isLoading, viewedResources, viewingResourceId, onMarkViewed, onClose }) {
  return (
    <div className="learning-modal-overlay" onClick={onClose}>
      <div className="learning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="learning-modal-header">
          <h2>🎓 Fortbildungsressourcen für Lehrkräfte</h2>
          <button
            className="learning-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="learning-modal-content">
          {isLoading ? (
            <div className="learning-loading">
              <span className="spinner" />
              <p>Ressourcen werden zusammengestellt…</p>
            </div>
          ) : !learningResources || learningResources.length === 0 ? (
            <div className="learning-error">
              <p>Keine Ressourcen geladen.</p>
            </div>
          ) : (
            <div className="learning-resources-list">
              {learningResources.map((resource, idx) => (
                <div
                  key={`resource-${idx}`}
                  className={`learning-resource-item ${viewedResources.has(resource.title) ? 'viewed' : ''}`}
                >
                  <div className="learning-resource-header">
                    <h3 className="learning-resource-title">{resource.title}</h3>
                    <span className="learning-resource-xp">+{resource.xp} XP</span>
                  </div>
                  <p className="learning-resource-description">{resource.beschreibung}</p>
                  <div className="learning-resource-meta">
                    <span className="learning-resource-type">{resource.typ}</span>
                    <span className="learning-resource-time">⏱ {resource.minuten} Min</span>
                  </div>
                  <div className="learning-resource-search">
                    <span className="learning-resource-search-term">{resource.suchbegriff}</span>
                    <button
                      type="button"
                      className="learning-search-btn"
                      onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(resource.suchbegriff)}`, '_blank')}
                    >
                      🔍 Suchen
                    </button>
                  </div>
                  {resource.plattform && (
                    <p className="learning-resource-plattform">📍 {resource.plattform}</p>
                  )}
                  <div className="learning-resource-action">
                    <button
                      type="button"
                      className="learning-mark-viewed-btn"
                      onClick={() => onMarkViewed(resource)}
                      disabled={viewedResources.has(resource.title) || viewingResourceId === resource.title}
                    >
                      {viewedResources.has(resource.title) ? '✓ Gesehen' : `+ ${resource.xp} XP · Gesehen`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
