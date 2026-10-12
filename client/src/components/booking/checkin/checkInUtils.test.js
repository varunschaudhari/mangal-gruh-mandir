import { describe, it, expect } from 'vitest';
import { arrivedPercent, batchState, cleanCode, isLetIn, overrideText, verdictOf } from './checkInUtils.js';

describe('verdictOf', () => {
  it('lets in only valid slips', () => {
    expect(verdictOf('ok').tone).toBe('green');
    expect(verdictOf('overridden').tone).toBe('green');
    expect(isLetIn('ok')).toBe(true);
    expect(isLetIn('already')).toBe(false);
  });

  it('asks staff to look again or refuses', () => {
    expect(verdictOf('already')).toMatchObject({ tone: 'amber', sound: 'warning' });
    expect(verdictOf('other-hall').tone).toBe('amber');
    expect(verdictOf('batch-over').tone).toBe('amber');
    for (const r of ['early', 'past', 'voided']) expect(verdictOf(r).tone).toBe('red');
    expect(verdictOf('no-visit').tone).toBe('gray');
    expect(verdictOf('something-new')).toMatchObject({ tone: 'red', title: 'Not a valid slip' });
  });
});

describe('cleanCode', () => {
  it('drops what handheld scanners add', () => {
    expect(cleanCode('  https://x.in/r/AbCdEfGh12345678\r\n')).toBe('https://x.in/r/AbCdEfGh12345678');
    expect(cleanCode('\t10 ')).toBe('10');
    expect(cleanCode(undefined)).toBe('');
  });
});

describe('overrideText', () => {
  it('explains why someone was let in anyway', () => {
    expect(overrideText('batch-over')).toBe('Let in anyway: batch was over');
    expect(overrideText('other-hall')).toBe('Let in anyway: came to another hall');
    expect(overrideText('')).toBe('');
  });
});

describe('batchState', () => {
  const at = (h, m) => new Date(2026, 9, 13, h, m);
  it('knows the running batch', () => {
    expect(batchState('7:00 AM – 8:15 AM', at(6, 50))).toBe('later');
    expect(batchState('7:00 AM – 8:15 AM', at(7, 30))).toBe('now');
    expect(batchState('7:00 AM – 8:15 AM', at(8, 15))).toBe('over');
    expect(batchState('12:10 PM – 1:25 PM', at(13, 0))).toBe('now');
    expect(batchState('Early morning – 7:00 AM', at(6, 0))).toBe('');
  });
});

describe('arrivedPercent', () => {
  it('stays between 0 and 100', () => {
    expect(arrivedPercent(3, 12)).toBe(25);
    expect(arrivedPercent(0, 0)).toBe(0);
    expect(arrivedPercent(5, 4)).toBe(100);
  });
});

describe('pickBoard (hall screen)', () => {
  const g = (label, hall = 'H1') => ({ label, hall, bookings: [] });
  const groups = [g('7:00 AM – 8:15 AM'), g('7:30 AM – 8:45 AM', 'H2'), g('8:30 AM – 9:45 AM'), g('8:30 AM – 9:45 AM', 'H2'), g('10:00 AM – 11:15 AM'), g('Early morning – 7:00 AM', '')];
  it('shows the running batches and the next to start', async () => {
    const { pickBoard } = await import('./checkInUtils.js');
    const b = pickBoard(groups, new Date(2026, 9, 13, 7, 40));
    expect(b.current.map((x) => x.label)).toEqual(['7:00 AM – 8:15 AM', '7:30 AM – 8:45 AM']);
    expect(b.next.map((x) => `${x.label} ${x.hall}`)).toEqual(['8:30 AM – 9:45 AM H1', '8:30 AM – 9:45 AM H2']);
    expect(b.untimed).toHaveLength(1);
  });
  it('knows when the day is done', async () => {
    const { pickBoard } = await import('./checkInUtils.js');
    const b = pickBoard(groups, new Date(2026, 9, 13, 12, 0));
    expect(b.current).toEqual([]);
    expect(b.next).toEqual([]);
    expect(b.over).toHaveLength(5);
  });
  it('shows one batch: running, else the next, else the last one of the day', async () => {
    const { pickShown } = await import('./checkInUtils.js');
    const h1 = [g('7:00 AM – 8:15 AM'), g('8:30 AM – 9:45 AM'), g('10:00 AM – 11:15 AM')];
    const at = (h, m) => pickShown(h1, new Date(2026, 9, 13, h, m));
    expect([at(6, 30).kind, at(6, 30).shown[0].label]).toEqual(['next', '7:00 AM – 8:15 AM']);
    expect([at(8, 14).kind, at(8, 14).shown[0].label]).toEqual(['now', '7:00 AM – 8:15 AM']);
    // At its end time the batch makes way for the next one
    expect([at(8, 15).kind, at(8, 15).shown[0].label]).toEqual(['next', '8:30 AM – 9:45 AM']);
    expect([at(14, 0).kind, at(14, 0).shown.map((x) => x.label)]).toEqual(['over', ['10:00 AM – 11:15 AM']]);
    expect(pickShown([g('Early morning – 7:00 AM', '')], new Date(2026, 9, 13, 9, 0)).kind).toBe('today');
    expect(pickShown([], new Date()).kind).toBe('');
  });
  it('fits a whole batch on the screen with the biggest tiles', async () => {
    const { fitGrid } = await import('./checkInUtils.js');
    // 150 serials on a TV board area: about 15 columns × 10 rows, tiles ~ 80 px
    const big = fitGrid(150, 1380, 760, 8);
    expect(big.cols * big.rows).toBeGreaterThanOrEqual(150);
    expect(big.cols).toBeGreaterThanOrEqual(13);
    expect(big.cols).toBeLessThanOrEqual(17);
    expect(big.h).toBeGreaterThan(70);
    expect(big.cols * big.w + (big.cols - 1) * 8).toBeLessThanOrEqual(1380);
    expect(big.rows * big.h + (big.rows - 1) * 8).toBeLessThanOrEqual(760);
    // A few serials get big tiles, but not wall-sized ones
    const few = fitGrid(3, 1380, 760, 8, 240);
    expect([few.cols, few.h]).toEqual([3, 240]);
    expect(fitGrid(0, 1000, 500)).toBe(null);
    expect(fitGrid(10, 0, 500)).toBe(null);
  });
  it('counts down and sizes tiles', async () => {
    const { minutesUntil, tileSize } = await import('./checkInUtils.js');
    expect(minutesUntil('8:30 AM – 9:45 AM', new Date(2026, 9, 13, 7, 40))).toBe(50);
    expect(minutesUntil('Early morning – 7:00 AM', new Date())).toBe(null);
    expect([tileSize(10), tileSize(40), tileSize(90)]).toEqual(['lg', 'md', 'sm']);
  });
});
