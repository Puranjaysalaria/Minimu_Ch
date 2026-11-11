import { Router, Request, Response } from 'express';
import { MemoryRepository } from '../database/repositories/memoryRepo.js';
import { getDatabase } from '../database/connection.js';

export const memoryRouter = Router();

function getRepo(): MemoryRepository {
  return new MemoryRepository(getDatabase());
}

// GET /api/memories/search?q=...
memoryRouter.get('/search', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  if (!query) {
    res.status(400).json({ error: 'Query parameter q is required' });
    return;
  }

  const repo = getRepo();
  const memories = repo.searchFTS(query, 50);
  res.json({ query, results: memories });
});

// GET /api/memories/:id
memoryRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = getRepo();
  const memory = repo.getById(id);
  if (!memory) {
    res.status(404).json({ error: 'Memory record not found' });
    return;
  }

  const auditHistory = repo.getAuditHistory(id);
  res.json({
    memory,
    auditHistory,
  });
});

// GET /api/memories
memoryRouter.get('/', (req: Request, res: Response) => {
  const onlyActive = req.query.onlyActive === 'true';
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const repo = getRepo();
  const memories = repo.getAll({ onlyActive, limit });
  res.json({ memories, total: memories.length });
});
