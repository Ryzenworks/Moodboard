import { useRef, useCallback } from 'react';
import type { ComposerReference } from '@shared/types';
import { MAX_REFERENCE_IMAGES, SUPPORTED_IMAGE_TYPES, MAX_IMAGE_FILE_SIZE } from '@shared/types';

interface ReferencesPanelProps {
  references: ComposerReference[];
  onReferencesChange: (refs: ComposerReference[]) => void;
  onInsertRef?: (ref: ComposerReference) => void;
}

const DEFAULT_SLOTS = [
  { icon: '✦', label: 'Style' },
  { icon: '👤', label: 'Character' },
];

export function ReferencesPanel({ references, onReferencesChange, onInsertRef }: ReferencesPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newRefs: ComposerReference[] = [];
    for (const file of Array.from(files)) {
      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) continue;
      if (file.size > MAX_IMAGE_FILE_SIZE) continue;
      if (references.length + newRefs.length >= MAX_REFERENCE_IMAGES) break;

      const sortOrder = references.length + newRefs.length;
      newRefs.push({
        id: crypto.randomUUID(),
        label: `IMG ${sortOrder + 1}`,
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        sortOrder: sortOrder,
        previewUrl: URL.createObjectURL(file),
        file: file,
      });
    }

    if (newRefs.length > 0) {
      onReferencesChange([...references, ...newRefs]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [references, onReferencesChange]);

  const handleRemove = useCallback((id: string) => {
    const updated = references
      .filter((r) => r.id !== id)
      .map((r, i) => ({ ...r, label: `IMG ${i + 1}`, sortOrder: i }));
    onReferencesChange(updated);
  }, [references, onReferencesChange]);

  return (
    <div className="section-block">
      <div className="section-label">
        REFERENCES
        <span className="ref-counter">{references.length}/{MAX_REFERENCE_IMAGES}</span>
      </div>
      <div className="ref-tiles">
        {references.map((ref) => (
          <div
            key={ref.id}
            className="ref-tile has-image"
            title={`${ref.label}: ${ref.originalFilename} (drag to prompt or click to insert)`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/ref-id', ref.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onInsertRef?.(ref)}
          >
            <img src={ref.previewUrl} alt={ref.label} className="ref-tile-img" />
            <span className="ref-tile-label">{ref.label}</span>
            <button
              className="ref-tile-remove"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(ref.id);
              }}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {references.length < 2 &&
          DEFAULT_SLOTS.slice(references.length).map((slot) => (
            <button key={slot.label} className="ref-tile empty-slot" onClick={handleAddClick}>
              <span className="ref-tile-icon">{slot.icon}</span>
              <span className="ref-tile-slotname">{slot.label}</span>
            </button>
          ))}
        {references.length < MAX_REFERENCE_IMAGES && (
          <button className="ref-tile add-tile" onClick={handleAddClick} title="Add reference image">
            <span className="ref-tile-icon">+</span>
            <span className="ref-tile-slotname">Add</span>
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_IMAGE_TYPES.join(',')}
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
