import { describe, expect, it } from 'vitest';
import { autoSplit, clean, parseSong, resolveWho, whoStyle } from './parser';
import type { Singer } from './types';

const singers: Singer[] = [
  { id: 'a', name: 'Anna', color: '#ff0000' },
  { id: 'b', name: 'Bo', color: '#00ff00' },
  { id: 'c', name: 'Cecilie', color: '#0000ff' },
];
const roles = { hv: 'a', k1: 'b', k2: 'c' };

describe('clean', () => {
  it('fjerner kilde- og rettighetslinjer', () => {
    const t = 'Første linje\nSource: noe\nSongwriters: X\nAndre linje\nlyrics © 2020\nPowered by LyricFind\nMusixmatch';
    expect(clean(t)).toBe('Første linje\nAndre linje');
  });
  it('beholder vanlige linjer som nevner source midt i', () => {
    expect(clean('the source of light')).toBe('the source of light');
  });
});

describe('autoSplit', () => {
  it('setter inn skille der gjentatte linjer starter og slutter', () => {
    const t = ['vers en', 'vers to', 'hei hå', 'tra la', 'vers tre', 'hei hå', 'tra la'].join('\n');
    expect(autoSplit(t)).toBe(['vers en', 'vers to', '', 'hei hå', 'tra la', '', 'vers tre', '', 'hei hå', 'tra la'].join('\n'));
  });
  it('lar tekst med tomme linjer være i fred', () => {
    expect(autoSplit('a\n\nb')).toBe('a\n\nb');
  });
});

describe('parseSong', () => {
  it('deler opp på tomme linjer og leser delmerker', () => {
    const p = parseSong('[Vers 1]\nen\nto\n\n[Refreng]\ntre', roles, singers);
    expect(p.sections.map((s) => s.label)).toEqual(['Vers 1', 'Refreng']);
    expect(p.sections[0].lines.map((l) => l.text)).toEqual(['en', 'to']);
    expect(p.sections[1].chorus).toBe(true);
    expect(p.marked).toBe(true);
  });

  it('starter ny del ved delmerke også uten tom linje', () => {
    const p = parseSong('[Vers]\nen\n[Bro]\nto', roles, singers);
    expect(p.sections).toHaveLength(2);
  });

  it('delmerke etterfulgt av tom linje gjelder teksten under', () => {
    const p = parseSong('[Refreng | K1]\n\nen\nto\n\ntre', roles, singers);
    expect(p.sections).toHaveLength(2);
    expect(p.sections[0]).toMatchObject({ label: 'Refreng', lines: [{ text: 'en' }, { text: 'to' }] });
    expect(p.sections[0].who?.people.map((x) => x.id)).toEqual(['b']);
  });

  it('delmerke uten tekst (f.eks. [Instrumental]) vises fortsatt', () => {
    const p = parseSong('[Instrumental]\n\n[Outro]\nslutt', roles, singers);
    expect(p.sections.map((s) => s.label)).toEqual(['Instrumental', 'Outro']);
  });

  it('oversetter koder til personene valgt for låten', () => {
    const p = parseSong('[Vers | K1]\nen', roles, singers);
    expect(p.sections[0].who?.people.map((x) => x.name)).toEqual(['Bo']);
  });

  it('godtar navn uten skille på store og små bokstaver', () => {
    const w = resolveWho('anna & BO', roles, singers);
    expect(w?.people.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('Alle gir alle personer i rollene', () => {
    const w = resolveWho('Alle', roles, singers);
    expect(w?.all).toBe(true);
    expect(w?.people.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('linjemerking overstyrer delen', () => {
    const p = parseSong('[Vers | HV]\nen\n(K2) to', roles, singers);
    expect(p.sections[0].lines[1]).toMatchObject({ text: 'to', who: { people: [{ id: 'c' }] } });
    expect(p.sections[0].lines[0].who).toBeNull();
  });

  it('tolker ikke ad-lib i parentes som navn', () => {
    const p = parseSong('(ååå) ja ja', roles, singers);
    expect(p.sections[0].lines[0]).toMatchObject({ text: '(ååå) ja ja', who: null });
  });

  it('uthever gjentatte linjer bare når låten mangler merking', () => {
    const p = parseSong('en\nla la\n\nto\nla la', roles, singers);
    expect(p.marked).toBe(false);
    expect(p.sections[0].lines.map((l) => l.repeated)).toEqual([false, true]);
    const q = parseSong('[Vers]\nen\nla la\n\nla la', roles, singers);
    expect(q.sections.flatMap((s) => s.lines).some((l) => l.repeated)).toBe(false);
  });

  it('fjerner søppellinjer også ved visning', () => {
    const p = parseSong('en\nSource: x', roles, singers);
    expect(p.sections[0].lines).toHaveLength(1);
  });
});

describe('whoStyle', () => {
  it('én person gir farget tekst og strek', () => {
    const s = whoStyle({ people: [singers[0]], all: false }, false);
    expect(s.text).toBe('#ff0000');
    expect(s.bar).toContain('#ff0000');
  });
  it('flere personer gir nøytral tekst og fargeovergang', () => {
    const s = whoStyle({ people: [singers[0], singers[1]], all: false }, false);
    expect(s.text).toBeUndefined();
    expect(s.bar).toBe('linear-gradient(#ff0000,#00ff00)');
  });
  it('lys visning gjør fargen mørkere', () => {
    expect(whoStyle({ people: [singers[0]], all: false }, true).text).toBe('color-mix(in srgb, #ff0000 62%, black)');
  });
});
