import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { healthRouter } from './routes/health.js';
import { generateRouter } from './routes/generate.js';
import { generationsRouter } from './routes/generations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001', 10);
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const GENERATIONS_DIR = path.join(DATA_DIR, 'generations');

// Ensure data directories exist
fs.mkdirSync(GENERATIONS_DIR, { recursive: true });

const app = express();

// Middleware
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Serve generated images statically
app.use('/data', express.static(DATA_DIR));

// Routes
app.use('/api', healthRouter);
app.use('/api', generateRouter);
app.use('/api', generationsRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err.message);
  // Never expose internal details
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
});

app.listen(PORT, () => {
  const apiKeyConfigured = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-api-key-here';
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║        Nano Banana Studio — Server       ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Data: ${DATA_DIR}`);
  console.log(`  → API Key: ${apiKeyConfigured ? '✓ Configured' : '✗ Not configured — see server/.env.example'}`);
  console.log('');
});

export { DATA_DIR, GENERATIONS_DIR };
