import { useRef, useCallback } from 'react';
import { MAX_PROMPT_LENGTH } from '@shared/types';

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function PromptEditor({ value, onChange, onSubmit }: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= MAX_PROMPT_LENGTH) {
      onChange(e.target.value);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  }, [onSubmit]);

  return (
    <div className="section-block">
      <div className="section-label">PROMPT</div>
      <div className="prompt-box">
        <textarea
          ref={textareaRef}
          className="prompt-textarea"
          placeholder="Describe your image—try @ to add references"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={4}
          spellCheck={false}
        />
        <div className="prompt-bar">
          <div className="prompt-bar-left">
            {/* Placeholder for future AI prompt toggle */}
          </div>
          <div className="prompt-bar-right">
            {value.length > 0 && (
              <button className="prompt-icon-btn" onClick={() => onChange('')} title="Clear prompt">
                ✕
              </button>
            )}
            <span className="prompt-count">
              {value.length > 0 ? `${value.length.toLocaleString()} / ${MAX_PROMPT_LENGTH.toLocaleString()}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
