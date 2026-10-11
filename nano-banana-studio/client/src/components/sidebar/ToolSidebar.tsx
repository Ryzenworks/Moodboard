import { useState, useEffect, useRef } from 'react';
import type { AspectRatio, ImageSize, ComposerReference, PromptNode } from '@shared/types';
import { ModelSelector } from './ModelSelector';
import { ReferencesPanel } from './ReferencesPanel';
import { RichPromptEditor, type RichPromptEditorHandle } from '../editor/RichPromptEditor';
import { GenerationControls } from './GenerationControls';

interface ToolSidebarProps {
  promptText: string;
  promptNodes: PromptNode[];
  onPromptChange: (nodes: PromptNode[], textLen: number, plainText: string) => void;
  references: ComposerReference[];
  onReferencesChange: (refs: ComposerReference[]) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (r: AspectRatio) => void;
  imageSize: ImageSize;
  onImageSizeChange: (s: ImageSize) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  generationError: string | null;
  onClearError?: () => void;
  onOpenSettings?: () => void;
}

export function ToolSidebar({
  promptText,
  promptNodes,
  onPromptChange,
  references,
  onReferencesChange,
  aspectRatio,
  onAspectRatioChange,
  imageSize,
  onImageSizeChange,
  onGenerate,
  isGenerating,
  generationError,
  onClearError,
  onOpenSettings,
}: ToolSidebarProps) {
  const [apiConnected, setApiConnected] = useState(false);
  const editorRef = useRef<RichPromptEditorHandle>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setApiConnected(d.apiKeyConfigured))
      .catch(() => setApiConnected(false));
  }, []);

  const canGenerate = (promptText.trim().length > 0 || promptNodes.length > 0) && !isGenerating;

  const handleInsertRef = (ref: ComposerReference) => {
    editorRef.current?.insertRef(ref);
  };

  return (
    <aside className="tool-sidebar">
      {/* Top header */}
      <div className="ts-header">
        <div className="ts-brand">
          <span className="ts-brand-icon">N</span>
          <span className="ts-brand-text">Nano Banana</span>
          <span className="ts-brand-badge">Studio</span>
          {onOpenSettings && (
            <button
              className="ts-settings-btn"
              onClick={onOpenSettings}
              title="Settings & API Status"
            >
              ⚙
            </button>
          )}
        </div>
        <div className="ts-categories">
          <button className="ts-cat active">Image</button>
          <button className="ts-cat" disabled>Video</button>
          <button className="ts-cat" disabled>Audio</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="ts-body">
        {/* Tool title row */}
        <div className="ts-tool-title">
          <div>
            <span className="ts-tools-back">‹ Tools</span>
            <h2 className="ts-title">
              Image Generator{' '}
              <span
                className="ts-info"
                onClick={onOpenSettings}
                title="View Model Info & Status"
              >
                ⓘ
              </span>
            </h2>
          </div>
          <button className="ts-templates-btn" title="Templates">
            <span>📋</span>
            <span>Templates</span>
          </button>
        </div>

        <ModelSelector />

        <ReferencesPanel
          references={references}
          onReferencesChange={onReferencesChange}
          onInsertRef={handleInsertRef}
        />

        <div className="section-block">
          <div className="section-label">PROMPT</div>
          <RichPromptEditor
            ref={editorRef}
            references={references}
            onContentChange={(nodes, len) => {
              const plain = editorRef.current?.getPlainText() || '';
              onPromptChange(nodes, len, plain);
            }}
            onSubmit={onGenerate}
          />
        </div>
      </div>

      {/* Footer controls */}
      <div className="ts-footer">
        <GenerationControls
          aspectRatio={aspectRatio}
          onAspectRatioChange={onAspectRatioChange}
          imageSize={imageSize}
          onImageSizeChange={onImageSizeChange}
        />

        <button
          className="generate-btn"
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
          <span className="generate-sparkle">✦</span>
        </button>

        {generationError && (
          <div className="ts-error-box">
            <div className="ts-error-header">
              <span className="ts-error-badge">Generation Error</span>
              {onClearError && (
                <button
                  className="ts-error-dismiss"
                  onClick={onClearError}
                  title="Dismiss error"
                >
                  ×
                </button>
              )}
            </div>
            <div className="ts-error-text">{generationError}</div>
            {onOpenSettings && (
              <button className="ts-error-action" onClick={onOpenSettings}>
                Check Billing & Quota in Settings →
              </button>
            )}
          </div>
        )}

        {!apiConnected && (
          <div className="ts-api-hint" onClick={onOpenSettings} style={{ cursor: 'pointer' }}>
            <span className="ts-api-dot" />
            API key not configured — click to configure
          </div>
        )}
      </div>
    </aside>
  );
}
