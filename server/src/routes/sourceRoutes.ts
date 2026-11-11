import { Router, Request, Response } from 'express';
import { SourceRepository } from '../database/repositories/sourceRepo.js';
import { getDatabase } from '../database/connection.js';

export const sourceRouter = Router();

sourceRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const repo = new SourceRepository(getDatabase());
  const source = repo.getById(id);
  if (!source) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  res.json({ source });
});
