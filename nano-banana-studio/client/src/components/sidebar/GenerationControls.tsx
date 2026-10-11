import { useState, useRef, useEffect, useCallback } from 'react';
import type { AspectRatio, ImageSize } from '@shared/types';
import { SUPPORTED_ASPECT_RATIOS, SUPPORTED_IMAGE_SIZES } from '@shared/types';

interface GenerationControlsProps {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (r: AspectRatio) => void;
  imageSize: ImageSize;
  onImageSizeChange: (s: ImageSize) => void;
}

export function GenerationControls({
  aspectRatio, onAspectRatioChange,
  imageSize, onImageSizeChange,
}: GenerationControlsProps) {
  const [openPicker, setOpenPicker] = useState<'aspect' | 'size' | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpenPicker(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const togglePicker = useCallback((picker: 'aspect' | 'size') => {
    setOpenPicker(prev => prev === picker ? null : picker);
  }, []);

  return (
    <div className="gen-controls" ref={wrapperRef}>
      {/* Aspect Ratio */}
      <div className="ctrl-wrapper">
        <button className="ctrl-chip" onClick={() => togglePicker('aspect')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
          {aspectRatio}
        </button>
        {openPicker === 'aspect' && (
          <div className="ctrl-picker">
            {SUPPORTED_ASPECT_RATIOS.map(r => (
              <button
                key={r}
                className={`ctrl-picker-opt ${r === aspectRatio ? 'active' : ''}`}
                onClick={() => { onAspectRatioChange(r); setOpenPicker(null); }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resolution */}
      <div className="ctrl-wrapper">
        <button className="ctrl-chip" onClick={() => togglePicker('size')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          {imageSize}
        </button>
        {openPicker === 'size' && (
          <div className="ctrl-picker">
            {SUPPORTED_IMAGE_SIZES.map(s => (
              <button
                key={s}
                className={`ctrl-picker-opt ${s === imageSize ? 'active' : ''}`}
                onClick={() => { onImageSizeChange(s); setOpenPicker(null); }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
