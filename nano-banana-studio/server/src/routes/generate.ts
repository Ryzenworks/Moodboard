import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { Generation, ReferenceImage, PromptNode, ModelId, AspectRatio, ImageSize } from '@shared/types';
import { db } from '../db.js';

export const generateRouter = Router();

// Store uploads in memory so we only write to disk if generation succeeds
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const GENERATIONS_DIR = path.join(DATA_DIR, 'generations');

// Ensure generations directory exists
fs.mkdirSync(GENERATIONS_DIR, { recursive: true });

// Track model quota status across requests
export interface QuotaStatusInfo {
  model: string;
  hasQuota: boolean | null; // null = not tested yet
  tier: 'free' | 'paid' | 'unknown';
  message: string;
  lastChecked: string | null;
}

export let quotaStatus: QuotaStatusInfo = {
  model: 'gemini-3-pro-image',
  hasQuota: null,
  tier: 'unknown',
  message: 'Model quota has not been verified yet.',
  lastChecked: null,
};

/**
 * Classify Gemini / Google API errors into predictable status codes and actionable messages
 */
function classifyGeminiError(err: any): {
  status: number;
  code: string;
  message: string;
  details?: string;
} {
  const rawMsg = String(err?.message || err || '');
  let innerMsg = rawMsg;
  let detectedCode: number | null = null;
  let detectedStatusStr = '';

  // Extract embedded JSON from Google SDK error message
  try {
    const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error) {
        detectedCode = parsed.error.code;
        detectedStatusStr = parsed.error.status || '';
        innerMsg = parsed.error.message || rawMsg;
      }
    }
  } catch {
    // Keep raw message if JSON parse fails
  }

  const status = detectedCode || (typeof err?.status === 'number' ? err.status : 500);

  // 1. Quota / Billing / 429 (Resource Exhausted)
  if (
    status === 429 ||
    detectedStatusStr === 'RESOURCE_EXHAUSTED' ||
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('429') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('limit: 0')
  ) {
    quotaStatus = {
      model: 'gemini-3-pro-image',
      hasQuota: false,
      tier: 'free',
      message: 'Free Tier project detected (quota limit is 0 for gemini-3-pro-image). Requires billing in Google AI Studio.',
      lastChecked: new Date().toISOString(),
    };

    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message:
        'Generation failed: your Gemini API project does not currently have access to Nano Banana Pro (gemini-3-pro-image). The Free Tier has 0 quota for image models. Please enable billing on your project in Google AI Studio to unlock image generation.',
      details: innerMsg,
    };
  }

  // 2. Authentication / Permission (401, 403)
  if (
    status === 401 ||
    status === 403 ||
    detectedStatusStr === 'UNAUTHENTICATED' ||
    detectedStatusStr === 'PERMISSION_DENIED' ||
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('UNAUTHENTICATED') ||
    rawMsg.includes('PERMISSION_DENIED')
  ) {
    return {
      status: status === 401 ? 401 : 403,
      code: status === 401 ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED',
      message:
        'Authentication or permission problem: please verify your Gemini API key in server/.env and ensure it has permissions for Gemini API.',
      details: innerMsg,
    };
  }

  // 3. Google Service / Server Error (500, 503)
  if (
    status === 500 ||
    status === 503 ||
    detectedStatusStr === 'UNAVAILABLE' ||
    detectedStatusStr === 'INTERNAL' ||
    rawMsg.includes('UNAVAILABLE') ||
    rawMsg.includes('overloaded')
  ) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Google service error: Gemini service is temporarily overloaded or unavailable. Please try again in a few moments.',
      details: innerMsg,
    };
  }

  // 4. Network / Connection Error
  if (
    rawMsg.includes('ENOTFOUND') ||
    rawMsg.includes('ECONNREFUSED') ||
    rawMsg.includes('fetch failed') ||
    rawMsg.includes('ETIMEDOUT')
  ) {
    return {
      status: 502,
      code: 'NETWORK_ERROR',
      message:
        'Network error: unable to connect to Google Gemini API servers. Please check your internet connection.',
      details: innerMsg,
    };
  }

  // 5. Default API Error
  return {
    status: 500,
    code: 'API_ERROR',
    message: `Gemini API error: ${innerMsg.slice(0, 300)}`,
    details: innerMsg,
  };
}

generateRouter.post('/generate', upload.array('references', 14), async (req, res) => {
  const prompt = (req.body.prompt || '').trim();
  const model = (req.body.model || 'gemini-3-pro-image') as ModelId;
  const aspectRatio = (req.body.aspectRatio || '16:9') as AspectRatio;
  const imageSize = (req.body.imageSize || '2K') as ImageSize;

  let promptNodes: PromptNode[] = [];
  try {
    if (req.body.promptNodes) {
      promptNodes = JSON.parse(req.body.promptNodes);
    }
  } catch {
    promptNodes = [{ type: 'text', text: prompt }];
  }

  let referencesMeta: Array<{
    id: string;
    label: string;
    sortOrder: number;
    originalFilename: string;
    mimeType: string;
  }> = [];
  try {
    if (req.body.referencesMeta) {
      referencesMeta = JSON.parse(req.body.referencesMeta);
    }
  } catch {
    referencesMeta = [];
  }

  const files = (req.files as Express.Multer.File[]) || [];

  // Check API key configuration before making calls
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here' || apiKey.trim() === '') {
    res.status(401).json({
      success: false,
      error: {
        code: 'NO_API_KEY',
        message: 'Gemini API key is not configured. Please add your GEMINI_API_KEY in server/.env.',
      },
    });
    return;
  }

  // Reconstruct the request prompt for Gemini
  const requestPrompt =
    promptNodes.length > 0
      ? promptNodes
          .map((n) => {
            if (n.type === 'text') return n.text;
            const refIndex = referencesMeta.findIndex((r) => r.id === n.refId);
            return refIndex >= 0 ? `@img${refIndex + 1}` : '[IMG ?]';
          })
          .join('')
      : prompt;

  if (!requestPrompt.trim() && files.length === 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'EMPTY_PROMPT',
        message: 'Prompt cannot be empty.',
      },
    });
    return;
  }

  // Build multimodal contents for Gemini: reference images first, then text prompt
  const contents: any[] = [];
  for (const file of files) {
    contents.push({
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString('base64'),
      },
    });
  }
  contents.push({ text: requestPrompt });

  console.log(`[Generate] Calling Gemini API (${model})...`);
  console.log(`[Generate] Prompt: "${requestPrompt.slice(0, 120)}..."`);
  console.log(`[Generate] References count: ${files.length}`);
  console.log(`[Generate] Settings: aspect=${aspectRatio}, size=${imageSize}`);

  let outputImageBuffer: Buffer | null = null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: imageSize,
        },
      },
    });

    // Parse image from response candidates
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        outputImageBuffer = Buffer.from(part.inlineData.data, 'base64');
        break;
      }
    }

    if (!outputImageBuffer) {
      // Gemini answered without an image
      console.warn('[Generate] Gemini returned response without image data');
      res.status(502).json({
        success: false,
        error: {
          code: 'UNEXPECTED_RESPONSE',
          message: 'Gemini returned an unsupported or empty response without image data.',
        },
      });
      return;
    }

    // Success! Update quota status tracker
    quotaStatus = {
      model: model,
      hasQuota: true,
      tier: 'paid',
      message: 'Active (Pay-as-you-go / Paid Tier)',
      lastChecked: new Date().toISOString(),
    };
  } catch (err: any) {
    // CLASSIFY ERROR AND FAIL CLEANLY. NO FALLBACK PREVIEWS. NO FAKE GENERATIONS.
    const classified = classifyGeminiError(err);
    console.error(`[Generate] FAILED [${classified.code}] ${classified.message}`);
    res.status(classified.status).json({
      success: false,
      error: {
        code: classified.code,
        message: classified.message,
        details: classified.details,
      },
    });
    return;
  }

  // ── ONLY REACHED ON GENUINE SUCCESS ──
  // Now, and only now, persist the generation and its reference files to disk.
  try {
    const genId = crypto.randomUUID();
    const genDir = path.join(GENERATIONS_DIR, genId);
    const refsDir = path.join(genDir, 'references');

    fs.mkdirSync(refsDir, { recursive: true });

    // Save reference files
    const savedReferences: ReferenceImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = referencesMeta[i] || {
        id: crypto.randomUUID(),
        label: `IMG ${i + 1}`,
        sortOrder: i,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
      };

      const ext = path.extname(file.originalname) || '.png';
      const safeFilename = `ref-${i + 1}-${meta.id.slice(0, 8)}${ext}`;
      const destPath = path.join(refsDir, safeFilename);

      fs.writeFileSync(destPath, file.buffer);

      savedReferences.push({
        id: meta.id,
        generationId: genId,
        label: meta.label || `IMG ${i + 1}`,
        originalFilename: file.originalname,
        storedPath: `generations/${genId}/references/${safeFilename}`,
        mimeType: file.mimetype,
        fileSize: file.size,
        sortOrder: i,
      });
    }

    // Save generated image
    const outputPath = `generations/${genId}/output.png`;
    const fullOutputPath = path.join(DATA_DIR, outputPath);
    fs.writeFileSync(fullOutputPath, outputImageBuffer);

    // Save to database
    const generation: Generation = {
      id: genId,
      createdAt: new Date().toISOString(),
      model: model,
      prompt: prompt,
      requestPrompt: requestPrompt,
      aspectRatio: aspectRatio,
      imageSize: imageSize,
      outputPath: outputPath,
      thumbnailPath: outputPath,
      favorite: false,
      references: savedReferences,
    };

    db.save(generation);
    console.log(`[Generate] Success: saved generation ${genId}`);

    res.json({
      success: true,
      generation,
    });
  } catch (saveError: any) {
    console.error('[Generate] Failed to save generation to disk:', saveError);
    res.status(500).json({
      success: false,
      error: {
        code: 'STORAGE_ERROR',
        message: 'Image generated but failed to save to local disk.',
        details: saveError?.message,
      },
    });
  }
});
