import { describe, expect, it } from 'vitest';
import { convertPrototype, makeBundle, mergeBundle, summarize, validateBundle } from './io';
import { durationSec, formatTotal, type Singer, type Song } from './types';

const song = (id: string, updatedAt: number, title = id): Song => ({ id, title, mode: 'solo', layout: 'scroll', text: 'la la', updatedAt });
const singers: Singer[] = [{ id: 'a', name: 'Anna', color: '#f00' }];

describe('mergeBundle', () => {
  it('legger til nye og beholder nyeste updatedAt', () => {
    const existing = { songs: [song('1', 100), song('2', 500)], setlists: [], singers };
    const incoming = validateBundle({ format: 'tekstbok', songs: [song('1', 200, 'ny'), song('2', 100), song('3', 1)], setlists: [], singers: [] });
    const r = mergeBundle(existing, incoming);
    expect(r.counts.songs).toEqual({ new: 1, updated: 1, unchanged: 1 });
    expect(r.put.songs.map((s) => s.id).sort()).toEqual(['1', '3']);
    expect(summarize(r.counts)).toBe('Låter: 1 nye, 1 oppdatert');
  });
});

describe('fylle inn tomme felt', () => {
  it('legger til varighet uten å overskrive en nyere låt', () => {
    const mine = { ...song('1', 500), text: 'min nye tekst', key: 'G' };
    const theirs = { ...song('1', 100), text: 'gammel tekst', key: 'A', duration: '3:45' };
    const r = mergeBundle({ songs: [mine], setlists: [], singers }, validateBundle({ format: 'tekstbok', songs: [theirs] }));
    expect(r.counts.songs).toEqual({ new: 0, updated: 1, unchanged: 0 });
    expect(r.put.songs[0]).toMatchObject({ text: 'min nye tekst', key: 'G', duration: '3:45', updatedAt: 500 });
  });
  it('lar låten være når ingenting mangler', () => {
    const mine = { ...song('1', 500), duration: '3:00' };
    const r = mergeBundle({ songs: [mine], setlists: [], singers }, validateBundle({ format: 'tekstbok', songs: [{ ...song('1', 100), duration: '9:99' }] }));
    expect(r.counts.songs.unchanged).toBe(1);
  });
});

describe('makeBundle', () => {
  it('eksporterer bare låtene i settlisten', () => {
    const b = makeBundle({ songs: [song('1', 1), song('2', 1)], setlists: [{ id: 'l', name: 'Jobb', songIds: ['2'] }], singers }, 'l');
    expect(b.songs.map((s) => s.id)).toEqual(['2']);
    expect(b.setlists).toHaveLength(1);
  });
});

describe('skiller i settlisten', () => {
  it('pause og prat blir med ved eksport og import', () => {
    const list = { id: 'l', name: 'Jobb', songIds: ['1', 'm:a', '2', 'm:b'], markers: { 'm:a': { kind: 'pause' as const, text: '15 min' }, 'm:b': { kind: 'prat' as const, text: 'Takk!' } } };
    const b = makeBundle({ songs: [song('1', 1), song('2', 1)], setlists: [list], singers }, 'l');
    expect(b.songs.map((s) => s.id)).toEqual(['1', '2']);
    const back = validateBundle(JSON.parse(JSON.stringify(b)));
    expect(back.setlists[0].songIds).toEqual(['1', 'm:a', '2', 'm:b']);
    expect(back.setlists[0].markers).toEqual({ 'm:a': { kind: 'pause', text: '15 min' }, 'm:b': { kind: 'prat', text: 'Takk!' } });
  });
});

describe('validateBundle', () => {
  it('avviser filer som ikke er tekstbok-filer', () => {
    expect(() => validateBundle({ foo: 1 })).toThrow();
  });
});

describe('convertPrototype', () => {
  it('oversetter navn til vokalist-id og lager nye vokalister ved behov', () => {
    const r = convertPrototype([{ title: 'Test', hv: 'anna', k1: 'Ny Person', text: 'a' }, { title: '', text: '' }], singers);
    expect(r.songs).toHaveLength(1);
    expect(r.songs[0].hv).toBe('a');
    expect(r.songs[0].mode).toBe('koring');
    expect(r.newSingers.map((s) => s.name)).toEqual(['Ny Person']);
    expect(r.songs[0].k1).toBe(r.newSingers[0].id);
  });
});

describe('varighet', () => {
  it('leser m:ss og summerer', () => {
    expect(durationSec('3:45')).toBe(225);
    expect(durationSec('3.05')).toBe(185);
    expect(durationSec('')).toBeNull();
    expect(durationSec('tja')).toBeNull();
    expect(formatTotal(3125)).toBe('52 min');
    expect(formatTotal(4000)).toBe('1 t 7 min');
  });
});
