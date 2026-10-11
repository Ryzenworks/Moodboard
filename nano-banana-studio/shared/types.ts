// ============================================================
// Shared types between client and server
// These types define the contract for the entire application.
// ============================================================

// --------------- Model & Settings ---------------

/** GA model — do NOT use the deprecated preview model */
export type ModelId = 'gemini-3-pro-image';

/** Aspect ratios supported by gemini-3-pro-image */
export type AspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

/** Image sizes supported by gemini-3-pro-image */
export type ImageSize = '1K' | '2K' | '4K';

export interface GenerationSettings {
  model: ModelId;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

export const DEFAULT_SETTINGS: GenerationSettings = {
  model: 'gemini-3-pro-image',
  aspectRatio: '16:9',
  imageSize: '2K',
};

export const SUPPORTED_ASPECT_RATIOS: AspectRatio[] = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
];

export const SUPPORTED_IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K'];

export const MAX_PROMPT_LENGTH = 10_000;

export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_REFERENCE_IMAGES = 14;
export const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// --------------- Reference Image ---------------

/** A reference image permanently stored with a generation (immutable) */
export interface ReferenceImage {
  id: string;
  generationId: string;
  label: string;           // "@img1", "@img2", etc.
  originalFilename: string;
  storedPath: string;      // Relative path within data/generations/<id>/references/
  mimeType: string;
  fileSize: number;
  sortOrder: number;
}

// --------------- Generation ---------------

/** A completed, immutable generation record */
export interface Generation {
  id: string;
  createdAt: string;       // ISO 8601
  model: ModelId;
  prompt: string;          // Exact original user-entered prompt
  requestPrompt: string;   // Internal prompt actually sent to Gemini
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  outputPath: string;      // Relative path to generated image
  thumbnailPath: string;   // Relative path to thumbnail
  favorite: boolean;
  references: ReferenceImage[];
}

/** Summary for history list (lighter than full Generation) */
export interface GenerationSummary {
  id: string;
  createdAt: string;
  model: ModelId;
  promptPreview: string;   // First ~200 chars of prompt
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  thumbnailPath: string;
  favorite: boolean;
  referenceCount: number;
}

// --------------- Structured Prompt (rich editor) ---------------

/** A text segment in the prompt */
export interface PromptTextNode {
  type: 'text';
  text: string;
}

/** An inline reference placeholder in the prompt */
export interface PromptRefNode {
  type: 'ref';
  refId: string;           // Links to ComposerReference.id
}

/** A single node in the structured prompt */
export type PromptNode = PromptTextNode | PromptRefNode;

// --------------- Composer State (client-side only) ---------------

/** Mutable state of the composer — separate from immutable history */
export interface ComposerReference {
  id: string;              // Temporary client-side ID (crypto.randomUUID)
  label: string;           // "@img1", "@img2", etc.
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  previewUrl: string;      // Blob URL (new upload) or server URL (recreated)
  file?: File;             // Actual File object for generation upload
  /** Present when this reference was loaded from a historical generation */
  sourceGenerationId?: string;
  sourceReferenceId?: string;
}

// --------------- API Request/Response ---------------

/** POST /api/generate — sent as multipart/form-data */
export interface GenerateRequestMeta {
  promptNodes: PromptNode[];
  prompt: string;          // Plain-text version of the prompt (for storage)
  model: ModelId;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

export interface GenerateResponse {
  generation: Generation;
}

export interface ApiHealthResponse {
  status: 'ok';
  apiKeyConfigured: boolean;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: string;
}

// --------------- Navigation ---------------

export type SidebarView = 'composer' | 'history' | 'favorites' | 'settings';
