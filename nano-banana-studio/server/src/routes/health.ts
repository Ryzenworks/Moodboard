import { Router } from 'express';
import { quotaStatus } from './generate.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const apiKeyConfigured =
    !!process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your-api-key-here' &&
    process.env.GEMINI_API_KEY.trim() !== '';

  res.json({
    status: 'ok',
    apiKeyConfigured,
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/model-status', (_req, res) => {
  const apiKeyConfigured =
    !!process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your-api-key-here' &&
    process.env.GEMINI_API_KEY.trim() !== '';

  res.json({
    apiKeyConfigured,
    model: 'gemini-3-pro-image',
    modelDisplayName: 'Google Nano Banana Pro',
    quota: quotaStatus,
  });
});
