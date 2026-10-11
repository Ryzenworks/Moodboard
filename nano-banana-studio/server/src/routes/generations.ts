import { Router } from 'express';
import { db } from '../db.js';

export const generationsRouter = Router();

// GET /api/generations — list all generations
generationsRouter.get('/generations', (_req, res) => {
  const all = db.getAll();
  res.json({ generations: all });
});

// PATCH /api/generations/:id/favorite — toggle favorite
generationsRouter.patch('/generations/:id/favorite', (req, res) => {
  const { id } = req.params;
  const updated = db.toggleFavorite(id);
  if (!updated) {
    res.status(404).json({ error: 'Generation not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ generation: updated });
});

// DELETE /api/generations/:id — delete generation
generationsRouter.delete('/generations/:id', (req, res) => {
  const { id } = req.params;
  const deleted = db.delete(id);
  if (!deleted) {
    res.status(404).json({ error: 'Generation not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true, id });
});
