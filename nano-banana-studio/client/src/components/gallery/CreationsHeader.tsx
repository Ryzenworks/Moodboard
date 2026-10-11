interface CreationsHeaderProps {
  activeTab: 'creations' | 'templates' | 'academy';
  onTabChange: (tab: 'creations' | 'templates' | 'academy') => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  onOpenSettings?: () => void;
}

export function CreationsHeader({
  activeTab,
  onTabChange,
  showFavoritesOnly,
  onToggleFavorites,
  searchQuery,
  onSearchChange,
  showSearch,
  onToggleSearch,
  onOpenSettings,
}: CreationsHeaderProps) {
  return (
    <div className="cr-header">
      <div className="cr-tabs">
        {(['creations', 'templates', 'academy'] as const).map((tab) => (
          <button
            key={tab}
            className={`cr-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab === 'creations' && '◉ '}
            {tab === 'templates' && '📋 '}
            {tab === 'academy' && '🎓 '}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div className="cr-actions">
        <button
          className={`cr-action-btn ${showFavoritesOnly ? 'active' : ''}`}
          onClick={onToggleFavorites}
          title="Favorites"
        >
          ♥
        </button>
        <button className="cr-action-btn has-label" title="Layout">
          <span>⊞</span> Layout
        </button>
        <button className="cr-action-btn has-label" title="Filters">
          <span>≡</span> Filters
        </button>
        <button
          className={`cr-action-btn ${showSearch ? 'active' : ''}`}
          onClick={onToggleSearch}
          title="Search"
        >
          🔍
        </button>
        {onOpenSettings && (
          <button
            className="cr-action-btn"
            onClick={onOpenSettings}
            title="Settings & API Status"
          >
            ⚙
          </button>
        )}
      </div>
      {showSearch && (
        <div className="cr-search-bar">
          <input
            type="text"
            className="cr-search-input"
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="cr-search-clear" onClick={() => onSearchChange('')}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
