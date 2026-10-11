import { useState } from 'react';
import type { Generation } from '@shared/types';
import { CreationsHeader } from './CreationsHeader';
import { GalleryGrid } from './GalleryGrid';

interface CreationsWorkspaceProps {
  generations: Generation[];
  onRecreate?: (gen: Generation) => void;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenSettings?: () => void;
}

export function CreationsWorkspace({
  generations,
  onRecreate,
  onToggleFavorite,
  onDelete,
  onOpenSettings,
}: CreationsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'creations' | 'templates' | 'academy'>('creations');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filtered = generations.filter((g) => {
    if (showFavoritesOnly && !g.favorite) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return g.prompt.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="creations-workspace">
      <CreationsHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavorites={() => setShowFavoritesOnly((p) => !p)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={showSearch}
        onToggleSearch={() => {
          setShowSearch((p) => !p);
          setSearchQuery('');
        }}
        onOpenSettings={onOpenSettings}
      />
      <div className="creations-body">
        {activeTab === 'creations' && (
          <GalleryGrid
            generations={filtered}
            onRecreate={onRecreate}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
          />
        )}
        {activeTab === 'templates' && (
          <div className="gallery-empty">
            <div className="gallery-empty-icon">📋</div>
            <div className="gallery-empty-title">No templates yet</div>
            <div className="gallery-empty-sub">Save generation settings as reusable templates</div>
          </div>
        )}
        {activeTab === 'academy' && (
          <div className="gallery-empty">
            <div className="gallery-empty-icon">🎓</div>
            <div className="gallery-empty-title">Academy</div>
            <div className="gallery-empty-sub">Prompting guides and tutorials coming soon</div>
          </div>
        )}
      </div>
    </div>
  );
}
