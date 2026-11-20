import { describe, expect, it } from 'vitest';
import { flattenSectionWho, lineToTokens, paintWord, readLabel, setWordPen, tokensToLine, wordHasPen, writeLabel } from './paint';
import { parseSong, vocalKind } from './parser';
import type { Singer } from './types';

const singers: Singer[] = [
  { id: 's', name: 'Siri', color: '#f0f' },
  { id: 'k', name: 'Kamilla', color: '#ff0' },
  { id: 'l', name: 'Leif', color: '#0f0' },
];
const roles = { hv: 's', k1: 'k', k2: 'l' };

describe('maling av ord', () => {
  it('maler tre ord som 2. stemme og slår dem sammen', () => {
    let line = "You'll wind up like the wreck you hide behind that mask you use";
    const pen = { code: 'K1', harm: true };
    for (const i of [10, 11, 12]) line = paintWord(line, i, pen, roles, singers, 'koring');
    expect(line).toBe("You'll wind up like the wreck you hide behind that {/K1: mask you use}");
  });

  it('samme pensel en gang til visker ut', () => {
    const line = paintWord('a {/K1: b c} d', 1, { code: 'K1', harm: true }, roles, singers, 'koring');
    expect(line).toBe('a b {/K1: c} d');
  });

  it('linjemerke (K1) gjøres om til maling på hvert ord', () => {
    const toks = lineToTokens('(K1) hei på deg', roles, singers, 'koring');
    expect(toks.map((t) => t.paint?.code)).toEqual(['K1', 'K1', 'K1']);
  });

  it('2. stemme på en linje merket (K1) fjerner hel-linje-merket', () => {
    let line = '(K1) that mask you use';
    for (const i of [1, 2, 3]) line = paintWord(line, i, { code: 'K1', harm: true }, roles, singers, 'koring');
    expect(line).toBe('that {/K1: mask you use}');
  });

  it('viskelær på en linje merket (K1) fjerner hele merket', () => {
    expect(paintWord('(K1) hei på deg', 1, null, roles, singers, 'koring')).toBe('hei på deg');
  });

  it('(HV) med koring er hovedstemmen og får ingen maling', () => {
    expect(lineToTokens('(HV) hei', roles, singers, 'koring')[0].paint).toBeNull();
  });

  it('kort koring {ord} og ukjente klammer bevares', () => {
    expect(tokensToLine(lineToTokens('vi står {ja, ja}', roles, singers, 'koring'))).toBe('vi står {ja, ja}');
    expect(tokensToLine(lineToTokens('noe {Ukjent: x} her', roles, singers, 'koring'))).toBe('noe {Ukjent: x} her');
  });

  it('ad-lib i parentes er vanlig tekst', () => {
    expect(tokensToLine(lineToTokens('(ooh) baby', roles, singers, 'koring'))).toBe('(ooh) baby');
  });
});

describe('delmerker', () => {
  it('leser og skriver', () => {
    expect(readLabel('[Vers 1 | Siri]')).toEqual({ label: 'Vers 1', who: 'Siri' });
    expect(readLabel('[Refreng]')).toEqual({ label: 'Refreng', who: '' });
    expect(writeLabel('Vers 1', 'HV2')).toBe('[Vers 1 | HV2]');
    expect(writeLabel('Vers 1', '')).toBe('[Vers 1]');
    expect(writeLabel('', 'K1')).toBe('[ | K1]');
    expect(writeLabel('', '')).toBeNull();
  });
});

describe('gammel del-merking blir maling', () => {
  it('duett: «[Vers 3 | HV2]» blir maling på ordene, delnavnet beholdes', () => {
    const r = { hv: 'k', hv2: 's' };
    const t = flattenSectionWho('[Vers 3 | HV2]\nen to\ntre\n\n[Vers 4]\nfire', r, singers, 'duett');
    expect(t).toBe('[Vers 3]\n{HV2: en to}\n{HV2: tre}\n\n[Vers 4]\nfire');
  });
  it('etikett uten navn fjernes helt', () => {
    expect(flattenSectionWho('[ | HV2]\nen', { hv: 'k', hv2: 's' }, singers, 'duett')).toBe('{HV2: en}');
  });
  it('koring: «[Refreng | HV / K1]» blir 2. stemme', () => {
    expect(flattenSectionWho('[Refreng | HV / K1]\nen to', roles, singers, 'koring')).toBe('[Refreng]\n{/K1: en to}');
  });
  it('ingenting å gjøre gir null', () => {
    expect(flattenSectionWho('[Vers]\nen', roles, singers, 'koring')).toBeNull();
  });
});

describe('solo med 2. stemme på samme ord', () => {
  const r = { hv: 'k', hv2: 's' };
  it('2. stemme på et solo-ord kombineres, og samme pensel fjerner den igjen', () => {
    let line = '{HV2: jeg holdt fast}';
    line = paintWord(line, 1, { code: 'HV', harm: true }, r, singers, 'duett');
    expect(line).toBe('{HV2: jeg} {HV2/HV: holdt} {HV2: fast}');
    line = paintWord(line, 1, { code: 'HV', harm: true }, r, singers, 'duett');
    expect(line).toBe('{HV2: jeg holdt fast}');
  });
  it('gammel del «Siri» med 2. stemme-linje beholder Siri', () => {
    expect(flattenSectionWho('[ | HV2]\nmin linje\n{/HV: vi holder}', r, singers, 'duett')).toBe('{HV2: min linje}\n{HV2/HV: vi holder}');
  });
  it('del «HV2 / HV» blir kombinert maling', () => {
    expect(flattenSectionWho('[Bro | HV2 / HV]\nen', r, singers, 'duett')).toBe('[Bro]\n{HV2/HV: en}');
  });
});

describe('flere på 2. stemme', () => {
  it('Kamilla og så Leif på samme ord gir begge; samme pensel fjerner bare den ene', () => {
    let line = 'jeg står her';
    line = paintWord(line, 1, { code: 'K1', harm: true }, roles, singers, 'koring');
    line = paintWord(line, 1, { code: 'K2', harm: true }, roles, singers, 'koring');
    expect(line).toBe('jeg {/K1+K2: står} her');
    line = paintWord(line, 1, { code: 'K1', harm: true }, roles, singers, 'koring');
    expect(line).toBe('jeg {/K2: står} her');
    line = paintWord(line, 1, { code: 'K2', harm: true }, roles, singers, 'koring');
    expect(line).toBe('jeg står her');
  });
  it('solo med to på 2. stemme', () => {
    let line = '{HV2: ord}';
    line = paintWord(line, 0, { code: 'HV', harm: true }, { hv: 'k', hv2: 's', k1: 'l' }, singers, 'duett');
    line = paintWord(line, 0, { code: 'K1', harm: true }, { hv: 'k', hv2: 's', k1: 'l' }, singers, 'duett');
    expect(line).toBe('{HV2/HV+K1: ord}');
  });
});

describe('koring: hovedstemmen er hvit, 2. stemme erstatter gammel merking', () => {
  const r = { hv: 'l', k1: 'k', k2: 's' };
  it('2. stemme på ord merket «alle» gir bare strekene', () => {
    let line = '{HV+K1+K2: for jeg er}';
    line = paintWord(line, 0, { code: 'K1', harm: true }, r, singers, 'koring');
    line = paintWord(line, 0, { code: 'K2', harm: true }, r, singers, 'koring');
    expect(line).toBe('{/K1+K2: for} {HV+K1+K2: jeg er}');
  });
  it('gammel blanding som «HV+K1+K2/K1+K2» vises som 2. stemme, ikke grønn Leif', () => {
    const p = parseSong('{HV+K1+K2/K1+K2: ord}', r, singers, 'koring');
    const part = p.sections[0].lines[0].parts[0];
    expect(vocalKind(part.who, 'koring', r)).toBe('harm');
  });
  it('dra over flere ord: setter uten å veksle', () => {
    const pen = { code: 'K1', harm: true };
    let line = 'a {/K1: b} c';
    for (const i of [0, 1, 2]) line = setWordPen(line, i, pen, true, r, singers, 'koring');
    expect(line).toBe('{/K1: a b c}');
    expect(wordHasPen(line, 1, pen, r, singers, 'koring')).toBe(true);
    for (const i of [0, 1]) line = setWordPen(line, i, pen, false, r, singers, 'koring');
    expect(line).toBe('a b {/K1: c}');
  });
});
