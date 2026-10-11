import { useState, useCallback, useEffect } from 'react';
import type { AspectRatio, ImageSize, ComposerReference, Generation, PromptNode } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/types';
import { ToolSidebar } from './components/sidebar/ToolSidebar';
import { CreationsWorkspace } from './components/gallery/CreationsWorkspace';
import { SettingsModal } from './components/modals/SettingsModal';

export function App() {
  // ── Composer state (never reset on error) ──
  const [promptText, setPromptText] = useState('');
  const [promptNodes, setPromptNodes] = useState<PromptNode[]>([]);
  const [references, setReferences] = useState<ComposerReference[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_SETTINGS.aspectRatio);
  const [imageSize, setImageSize] = useState<ImageSize>(DEFAULT_SETTINGS.imageSize);

  // ── Generation execution state ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // ── Gallery state ──
  const [generations, setGenerations] = useState<Generation[]>([]);

  // ── Settings modal state ──
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // ── Load generations on mount ──
  useEffect(() => {
    fetch('/api/generations')
      .then((r) => r.json())
      .then((data) => {
        if (data.generations) {
          setGenerations(data.generations);
        }
      })
      .catch((err) => console.warn('[App] Failed to load existing generations:', err));
  }, []);

  // ── Generate handler ──
  const handleGenerate = useCallback(async () => {
    if ((!promptText.trim() && promptNodes.length === 0) || isGenerating) return;

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const formData = new FormData();
      formData.append('prompt', promptText);
      formData.append('promptNodes', JSON.stringify(promptNodes));
      formData.append('model', 'gemini-3-pro-image');
      formData.append('aspectRatio', aspectRatio);
      formData.append('imageSize', imageSize);

      const referencesMeta = references.map((r) => ({
        id: r.id,
        label: r.label,
        sortOrder: r.sortOrder,
        originalFilename: r.originalFilename,
        mimeType: r.mimeType,
      }));
      formData.append('referencesMeta', JSON.stringify(referencesMeta));

      // Attach actual uploaded reference files
      for (const ref of references) {
        if (ref.file) {
          formData.append('references', ref.file, ref.originalFilename);
        }
      }

      console.log('[App] Sending generation request to /api/generate...');
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success || !data?.generation) {
        // Extract clean, actionable error message
        const errMsg =
          data?.error?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          data?.message ||
          data?.details ||
          `Generation request failed with HTTP ${response.status}`;

        throw new Error(errMsg);
      }

      // ONLY on success: add to gallery
      console.log('[App] Generation complete:', data.generation.id);
      setGenerations((prev) => [data.generation, ...prev.filter((g) => g.id !== data.generation.id)]);
      setGenerationError(null);
    } catch (err: any) {
      console.warn('[App] Handled generation error:', err.message);
      // PRESERVE ALL COMPOSER STATE: promptText, promptNodes, references, aspectRatio, imageSize remain untouched!
      setGenerationError(err?.message || 'Generation failed');
    } finally {
      // Always reset loading state
      setIsGenerating(false);
    }
  }, [promptText, promptNodes, references, aspectRatio, imageSize, isGenerating]);

  // ── Recreate: load previous generation back into composer ──
  const handleRecreate = useCallback((gen: Generation) => {
    setPromptText(gen.prompt);
    setPromptNodes([{ type: 'text', text: gen.prompt }]);
    setAspectRatio(gen.aspectRatio);
    setImageSize(gen.imageSize);

    // Reconstruct composer references from historical references
    if (gen.references && gen.references.length > 0) {
      const reconstructedRefs: ComposerReference[] = gen.references.map((r) => ({
        id: r.id,
        label: r.label,
        originalFilename: r.originalFilename,
        mimeType: r.mimeType,
        fileSize: r.fileSize,
        sortOrder: r.sortOrder,
        previewUrl: `/data/${r.storedPath}`,
        sourceGenerationId: gen.id,
        sourceReferenceId: r.id,
      }));
      setReferences(reconstructedRefs);
    } else {
      setReferences([]);
    }
  }, []);

  // ── Toggle favorite ──
  const handleToggleFavorite = useCallback(async (id: string) => {
    // Optimistic UI update
    setGenerations((prev) =>
      prev.map((g) => (g.id === id ? { ...g, favorite: !g.favorite } : g))
    );
    try {
      const res = await fetch(`/api/generations/${id}/favorite`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to toggle favorite');
      const data = await res.json();
      setGenerations((prev) =>
        prev.map((g) => (g.id === id ? data.generation : g))
      );
    } catch (err) {
      console.error('[App] Favorite toggle error:', err);
    }
  }, []);

  // ── Delete ──
  const handleDelete = useCallback(async (id: string) => {
    setGenerations((prev) => prev.filter((g) => g.id !== id));
    try {
      await fetch(`/api/generations/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('[App] Delete error:', err);
    }
  }, []);

  const handlePromptChange = useCallback(
    (nodes: PromptNode[], _textLen: number, plainText: string) => {
      setPromptNodes(nodes);
      setPromptText(plainText);
    },
    []
  );

  return (
    <div className="app-layout">
      <ToolSidebar
        promptText={promptText}
        promptNodes={promptNodes}
        onPromptChange={handlePromptChange}
        references={references}
        onReferencesChange={setReferences}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        imageSize={imageSize}
        onImageSizeChange={setImageSize}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        generationError={generationError}
        onClearError={() => setGenerationError(null)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <CreationsWorkspace
        generations={generations}
        onRecreate={handleRecreate}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDelete}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
