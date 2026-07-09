/**
 * Unit tests for color parsing utilities.
 */
import { describe, it, expect } from 'vitest';
import { parseBackground } from './color.js';

describe('parseBackground', () => {
  it('returns transparent (zero alpha) when input is undefined', () => {
    expect(parseBackground(undefined)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('returns transparent for "transparent"', () => {
    expect(parseBackground('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('parses 6-digit hex (#RRGGBB)', () => {
    const result = parseBackground('#ff8800');
    expect(result.r).toBeCloseTo(1, 3);
    expect(result.g).toBeCloseTo(0.533, 2);
    expect(result.b).toBeCloseTo(0, 1);
    expect(result.a).toBe(1);
  });

  it('parses 8-digit hex (#RRGGBBAA)', () => {
    const result = parseBackground('#ff000080');
    expect(result.r).toBe(1);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBeCloseTo(0.5, 2);
  });

  it('parses rgb(r,g,b)', () => {
    const result = parseBackground('rgb(255, 128, 0)');
    expect(result.r).toBe(1);
    expect(result.g).toBeCloseTo(0.502, 2);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  it('parses rgba(r,g,b,a)', () => {
    const result = parseBackground('rgba(100, 200, 50, 0.75)');
    expect(result.r).toBeCloseTo(0.392, 2);
    expect(result.g).toBeCloseTo(0.784, 2);
    expect(result.b).toBeCloseTo(0.196, 2);
    expect(result.a).toBe(0.75);
  });

  it('throws for unsupported format', () => {
    expect(() => parseBackground('red')).toThrow('Unsupported background');
  });

  it('throws for invalid hex length', () => {
    expect(() => parseBackground('#fff')).toThrow('Unsupported background');
  });

  it('throws for out-of-range RGB value', () => {
    expect(() => parseBackground('rgb(300, 0, 0)')).toThrow('Invalid background channel');
  });

  it('throws for out-of-range alpha', () => {
    expect(() => parseBackground('rgba(255, 0, 0, 2.0)')).toThrow('Invalid background alpha');
  });

  it('throws for wrong number of components', () => {
    expect(() => parseBackground('rgb(1, 2)')).toThrow('Invalid background');
  });

  it('is case-insensitive for hex values', () => {
    const upper = parseBackground('#FF8800');
    const lower = parseBackground('#ff8800');
    expect(upper).toEqual(lower);
  });

  it('trims whitespace from hex', () => {
    expect(parseBackground('  #ff0000  ')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });
});
