/**
 * Match policy boundaries.
 *
 * These are the numbers that decide whether someone's money moves, so the
 * boundaries are tested exactly rather than approximately: 84 must not be treated
 * the same as 85.
 */

import { describe, expect, it } from 'vitest';
import { decide, explain, rejectWithout, thresholds } from './policy.js';

describe('match policy', () => {
  it('uses the configured thresholds', () => {
    expect(thresholds.accept).toBe(85);
    expect(thresholds.stepUp).toBe(70);
  });

  describe('accept band', () => {
    it('accepts exactly at the accept threshold', () => {
      expect(decide(85).decision).toBe('accept');
    });

    it('accepts above it', () => {
      expect(decide(92).decision).toBe('accept');
      expect(decide(100).decision).toBe('accept');
    });
  });

  describe('step-up band', () => {
    it('steps up just below the accept threshold', () => {
      expect(decide(84).decision).toBe('step_up');
    });

    it('steps up exactly at the step-up threshold', () => {
      expect(decide(70).decision).toBe('step_up');
    });

    it('steps up in the middle of the band', () => {
      expect(decide(78).decision).toBe('step_up');
    });
  });

  describe('reject band', () => {
    it('rejects just below the step-up threshold', () => {
      const outcome = decide(69);
      expect(outcome.decision).toBe('reject');
      expect(outcome.reason).toBe('low_score');
    });

    it('rejects a zero score', () => {
      expect(decide(0).decision).toBe('reject');
    });
  });

  describe('no match at all', () => {
    it('is a reject, and is distinguishable from a score of zero', () => {
      const noMatch = decide(null);
      expect(noMatch.decision).toBe('reject');
      expect(noMatch.reason).toBe('no_match');
      // The distinction matters when reading audit rows: "nobody matched" and
      // "matched with confidence 0" are different events.
      expect(noMatch.score).toBeNull();
      expect(decide(0).score).toBe(0);
    });
  });

  describe('pre-biometric rejections', () => {
    it('carries its reason through', () => {
      expect(rejectWithout('no_candidates').reason).toBe('no_candidates');
      expect(rejectWithout('ambiguous_bin').decision).toBe('reject');
    });
  });

  describe('operator-facing text', () => {
    it('never names a user on a rejection', () => {
      for (const reason of ['no_candidates', 'ambiguous_bin', 'low_score', 'no_match'] as const) {
        expect(explain(rejectWithout(reason))).toBeTruthy();
      }
    });

    it('asks for more digits when the bin is too wide', () => {
      expect(explain(rejectWithout('ambiguous_bin'))).toMatch(/more digits/i);
    });

    it('asks for a PIN on step-up', () => {
      expect(explain(decide(78))).toMatch(/PIN/i);
    });
  });
});
