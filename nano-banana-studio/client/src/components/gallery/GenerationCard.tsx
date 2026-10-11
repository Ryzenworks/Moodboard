import { useState } from 'react';
import type { Generation } from '@shared/types';

interface GenerationCardProps {
  generation: Generation;
  onRecreate?: (gen: Generation) => void;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function GenerationCard({ generation, onRecreate, onToggleFavorite, onDelete }: GenerationCardProps) {
  const [hovered, setHovered] = useState(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/data/${generation.outputPath}`;
    a.download = `nano-banana-${generation.id.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <div
      className="gen-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="gen-card-img-wrap">
        <img
          src={`/data/${generation.outputPath}`}
          alt={generation.prompt.slice(0, 60)}
          className="gen-card-img"
          loading="lazy"
        />

        {/* Bottom badges — always visible */}
        <div className="gen-card-badges">
          <span className="gen-badge model">G</span>
          <span className="gen-badge res">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" stroke="white" strokeWidth="1.2"/><circle cx="6" cy="6" r="1.5" fill="white"/></svg>
            {generation.imageSize}
          </span>
        </div>

        {/* Hover overlay */}
        {hovered && (
          <div className="gen-card-overlay">
            <div className="gen-card-actions">
              {onRecreate && (
                <button className="gen-card-act" onClick={() => onRecreate(generation)} title="Recreate">
                  ↻
                </button>
              )}
              <button className="gen-card-act" onClick={handleDownload} title="Download">
                ↓
              </button>
              {onToggleFavorite && (
                <button
                  className={`gen-card-act ${generation.favorite ? 'is-fav' : ''}`}
                  onClick={() => onToggleFavorite(generation.id)}
                  title="Favorite"
                >
                  {generation.favorite ? '★' : '☆'}
                </button>
              )}
              {onDelete && (
                <button className="gen-card-act danger" onClick={() => onDelete(generation.id)} title="Delete">
                  🗑
                </button>
              )}
            </div>
            <div className="gen-card-prompt-preview">
              {generation.prompt.slice(0, 100)}{generation.prompt.length > 100 ? '...' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
