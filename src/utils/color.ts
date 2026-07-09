/**
 * Color parsing utilities for background colour handling.
 *
 * deepslate-mcp accepts the same background formats CSS does:
 *   - `transparent` (default) — alpha 0
 *   - `#RRGGBB`              — opaque hex
 *   - `#RRGGBBAA`            — hex with alpha
 *   - `rgb(r,g,b)` / `rgba(r,g,b,a)` — functional notation
 *
 * Named colours like `"red"` are intentionally NOT supported to keep the
 * parser trivial and unambiguous.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse a background colour string into a 0..1 RGBA quad.
 *
 * @param input  The raw user-supplied string.
 * @returns RGBA values in [0, 1] range.
 * @throws If the value is not a recognised format.
 */
export function parseBackground(input: string | undefined): RGBA {
  if (input === undefined || input === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const s = input.trim().toLowerCase();

  // Hex: #RRGGBB or #RRGGBBAA
  const hexMatch = /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hexMatch) {
    const hex = hexMatch[1]!;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  // rgb() / rgba() functional form
  const fnMatch = /^rgba?\(\s*([^)]+)\)$/.exec(s);
  if (fnMatch) {
    const parts = fnMatch[1]!.split(',').map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error(`Invalid background: ${input} — expected 3 or 4 comma-separated values`);
    }
    const nums = parts.map((p, i) => {
      if (i === 3) {
        // Last part of rgba() is alpha — must be a fraction 0..1
        const f = parseFloat(p);
        if (!Number.isFinite(f) || f < 0 || f > 1) {
          throw new Error(`Invalid background alpha: ${input} (expected 0..1)`);
        }
        return f;
      }
      const n = parseInt(p, 10);
      if (!Number.isFinite(n) || n < 0 || n > 255) {
        throw new Error(`Invalid background channel ${i}: ${input} (expected 0..255)`);
      }
      return n / 255;
    });
    return {
      r: nums[0]!,
      g: nums[1]!,
      b: nums[2]!,
      a: nums[3] ?? 1,
    };
  }

  throw new Error(
    `Unsupported background value: ${input}. ` +
    'Use "transparent", "#RRGGBB", "#RRGGBBAA", "rgb(r,g,b)", or "rgba(r,g,b,a)".',
  );
}
