import type { Generation } from '@shared/types';
import { GenerationCard } from './GenerationCard';

interface GalleryGridProps {
  generations: Generation[];
  onRecreate?: (gen: Generation) => void;
  onToggleFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function groupByMonth(generations: Generation[]): Map<string, Generation[]> {
  const groups = new Map<string, Generation[]>();
  for (const gen of generations) {
    const date = new Date(gen.createdAt);
    const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const existing = groups.get(key) || [];
    existing.push(gen);
    groups.set(key, existing);
  }
  return groups;
}

export function GalleryGrid({ generations, onRecreate, onToggleFavorite, onDelete }: GalleryGridProps) {
  if (generations.length === 0) {
    return (
      <div className="gallery-empty">
        <div className="gallery-empty-icon">✦</div>
        <div className="gallery-empty-title">No creations yet</div>
        <div className="gallery-empty-sub">
          Write a prompt and click Generate to create your first image
        </div>
      </div>
    );
  }

  const groups = groupByMonth(generations);

  return (
    <div className="gallery-scroll">
      {Array.from(groups.entries()).map(([month, gens]) => (
        <div key={month} className="gallery-group">
          <div className="gallery-date">
            <span className="gallery-date-dot" />
            {month}
          </div>
          <div className="gallery-grid">
            {gens.map(gen => (
              <GenerationCard
                key={gen.id}
                generation={gen}
                onRecreate={onRecreate}
                onToggleFavorite={onToggleFavorite}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
