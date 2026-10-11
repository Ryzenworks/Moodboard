import type { ComposerReference } from '@shared/types';

interface Props {
  references: ComposerReference[];
  position: { top: number; left: number };
  onSelect: (ref: ComposerReference) => void;
  onClose: () => void;
  activeRefId?: string;
}

export function RefSuggestionPopup({ references, position, onSelect, onClose, activeRefId }: Props) {
  if (references.length === 0) return null;

  return (
    <div
      className="ref-popup"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault() /* keep editor focus */}
    >
      <div className="ref-popup-title">Insert reference</div>
      {references.map((ref) => (
        <button
          key={ref.id}
          className={`ref-popup-item ${ref.id === activeRefId ? 'active' : ''}`}
          onClick={() => onSelect(ref)}
        >
          <img src={ref.previewUrl} className="ref-popup-thumb" alt="" />
          <span className="ref-popup-label">IMG {ref.sortOrder + 1}</span>
          <span className="ref-popup-filename">{ref.originalFilename}</span>
        </button>
      ))}
    </div>
  );
}
