import { describe, expect, test } from 'bun:test';
import { escapeRegExp } from './utils';

/** Mirrors ConductAnalyzer.escapeHtml exactly. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Mirrors ConductAnalyzer.renderHighlightedMessage's inner loop. */
function highlight(message: string, phrase: string): string {
  const haystack = escapeHtml(message);
  const needle = escapeRegExp(escapeHtml(phrase.trim()));
  return haystack.replace(new RegExp(`(${needle})`, 'gi'), '<mark>$1</mark>');
}

describe('highlighting phrases written by the collector', () => {
  test('highlights an ordinary phrase', () => {
    expect(highlight('Bayar sekarang juga', 'bayar sekarang')).toBe('<mark>Bayar sekarang</mark> juga');
  });

  // Each of these threw "Invalid regular expression" before escapeRegExp,
  // inside render — and there is no error boundary, so it took the screen down.
  test.each([
    ['unbalanced paren', 'bayar (sekarang'],
    ['unbalanced bracket', 'utang [KTP'],
    ['trailing backslash', 'bayar sekarang\\'],
    ['leading quantifier', '*bayar'],
    ['alternation + anchors', 'bayar|utang^$'],
    ['truncated mid character class', 'a'.repeat(290) + ' [KTP dan nomor'],
  ])('does not throw on %s', (_label, phrase) => {
    expect(() => highlight('Bayar utang lu sekarang', phrase)).not.toThrow();
  });

  test('a dot is matched literally, not as a wildcard', () => {
    // Previously "5.000" matched "50000" and highlighted the wrong characters.
    expect(highlight('Bayar 50000 sekarang', '5.000')).toBe('Bayar 50000 sekarang');
    expect(highlight('Bayar 5.000 sekarang', '5.000')).toBe('Bayar <mark>5.000</mark> sekarang');
  });

  test('HTML escaping still applies, so markup in the message cannot break out', () => {
    const out = highlight('<img src=x onerror=alert(1)> bayar', 'bayar');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('<mark>bayar</mark>');
  });

  test('a phrase containing markup matches its escaped form', () => {
    expect(highlight('kirim <script> ke kontak', '<script>')).toContain('<mark>&lt;script&gt;</mark>');
  });
});

describe('escapeRegExp', () => {
  test('escapes every regex metacharacter', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  test('leaves ordinary text untouched', () => {
    expect(escapeRegExp('bayar utang sekarang')).toBe('bayar utang sekarang');
  });
});
