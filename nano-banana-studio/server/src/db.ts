import fs from 'node:fs';
import path from 'node:path';
import type { Generation } from '@shared/types';

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const DB_FILE = path.join(DATA_DIR, 'generations.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let generations: Generation[] = [];

// Load existing generations from disk
try {
  if (fs.existsSync(DB_FILE)) {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    generations = JSON.parse(data);
  }
} catch (err) {
  console.warn('[DB] Could not load generations.json, starting with empty store');
  generations = [];
}

function persist() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(generations, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Failed to save generations.json:', err);
  }
}

export const db = {
  getAll(): Generation[] {
    return [...generations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getById(id: string): Generation | undefined {
    return generations.find((g) => g.id === id);
  },

  save(generation: Generation): Generation {
    // If already exists, update
    const index = generations.findIndex((g) => g.id === generation.id);
    if (index >= 0) {
      generations[index] = generation;
    } else {
      generations.unshift(generation);
    }
    persist();
    return generation;
  },

  toggleFavorite(id: string): Generation | null {
    const generation = generations.find((g) => g.id === id);
    if (!generation) return null;
    generation.favorite = !generation.favorite;
    persist();
    return generation;
  },

  delete(id: string): boolean {
    const prevLen = generations.length;
    generations = generations.filter((g) => g.id !== id);
    if (generations.length !== prevLen) {
      persist();
      return true;
    }
    return false;
  },
};
