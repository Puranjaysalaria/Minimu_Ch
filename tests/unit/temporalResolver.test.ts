import { describe, it, expect } from 'vitest';
import { TemporalResolver } from '../../server/src/memory/temporalResolver.js';

describe('TemporalResolver', () => {
  const resolver = new TemporalResolver('Asia/Kolkata');
  // Anchor date: Wednesday, 2026-11-11 14:00:00 Asia/Kolkata
  const anchor = '2026-11-11T14:00:00+05:30';

  it('resolves "yesterday" relative to reference anchor date', () => {
    const res = resolver.resolve('What did we discuss yesterday?', anchor);
    expect(res.isTemporal).toBe(true);
    expect(res.term).toBe('yesterday');
    expect(res.startDate).toBeDefined();
    expect(res.endDate).toBeDefined();
    // Yesterday should be 2026-11-10
    expect(res.startDate).toContain('2026-11-10');
  });

  it('resolves "last week" relative to reference date', () => {
    const res = resolver.resolve('What was my budget from last week?', anchor);
    expect(res.isTemporal).toBe(true);
    expect(res.term).toBe('last week');
    expect(res.startDate).toBeDefined();
    expect(res.endDate).toBeDefined();
  });

  it('resolves "last month" relative to reference date', () => {
    const res = resolver.resolve('What price did we discuss last month?', anchor);
    expect(res.isTemporal).toBe(true);
    expect(res.term).toBe('last month');
    expect(res.startDate).toContain('2026-10-01');
  });

  it('resolves "previously" as a historical temporal constraint', () => {
    const res = resolver.resolve('Which brand did I previously prefer?', anchor);
    expect(res.isTemporal).toBe(true);
    expect(res.term).toBe('previously');
  });

  it('resolves "currently" as current time constraint', () => {
    const res = resolver.resolve('What is currently active?', anchor);
    expect(res.isTemporal).toBe(true);
    expect(res.term).toBe('currently');
    expect(res.startDate).toContain('2026-11-11');
  });

  it('returns isTemporal false for non-temporal queries', () => {
    const res = resolver.resolve('What brand did I prefer for my laptop?', anchor);
    expect(res.isTemporal).toBe(false);
  });
});
