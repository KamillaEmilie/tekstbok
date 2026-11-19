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

  it('merker bare enkeltord som koring med {K1: ord}', () => {
    const p = parseSong("I'm still standing {K1+K2: (yeah, yeah, yeah)}", roles, singers);
    const ln = p.sections[0].lines[0];
    expect(ln.who).toBeNull();
    expect(ln.text).toBe("I'm still standing (yeah, yeah, yeah)");
    expect(ln.parts.map((x) => [x.text, x.who?.people.map((q) => q.id) ?? null])).toEqual([
      ["I'm still standing ", null],
      ['(yeah, yeah, yeah)', ['b', 'c']],
    ]);
    expect(p.marked).toBe(true);
  });

  it('flere koringsbiter i samme linje, også med navn', () => {
    const p = parseSong('{Anna: hei} og {K2: hå} igjen', roles, singers);
    expect(p.sections[0].lines[0].parts.map((x) => x.who?.people[0]?.id ?? null)).toEqual(['a', null, 'c', null]);
  });

  it('lar krøllparentes med ukjent navn stå urørt', () => {
    const p = parseSong('noe {Ukjent: tekst} her', roles, singers);
    expect(p.sections[0].lines[0].parts).toEqual([{ text: 'noe {Ukjent: tekst} her', who: null }]);
  });

  it('linjemerke og koringsbit kan kombineres', () => {
    const p = parseSong('(HV) jeg synger {K1: du korer}', roles, singers);
    const ln = p.sections[0].lines[0];
    expect(ln.who?.people[0].id).toBe('a');
    expect(ln.parts[1].who?.people[0].id).toBe('b');
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

describe('annenstemme, kort koring og standardfarger', () => {
  it('«/» skiller melodi og annenstemme', () => {
    const w = resolveWho('HV / K1', roles, singers)!;
    expect(w.people.map((p) => p.id)).toEqual(['a']);
    expect(w.harmony.map((p) => p.id)).toEqual(['b']);
    const st = whoStyle(w, false);
    expect(st.text).toBe('#ff0000');
    expect(st.bar2).toContain('#00ff00');
  });

  it('annenstemme på enkeltord med {/K1: ord}', () => {
    const p = parseSong('og tenkte {/K1: på deg}', roles, singers);
    const part = p.sections[0].lines[0].parts[1];
    expect(part.text).toBe('på deg');
    expect(part.who?.people).toEqual([]);
    expect(part.who?.harmony.map((x) => x.id)).toEqual(['b']);
    expect(part.margin).toBeFalsy();
  });

  it('{ord} uten navn er koring for K1+K2, og havner i margen når den står sist', () => {
    const p = parseSong('vi står her ennå {ja, ja, ja}', roles, singers);
    const part = p.sections[0].lines[0].parts[1];
    expect(part.who?.people.map((x) => x.id)).toEqual(['b', 'c']);
    expect(part.margin).toBe(true);
  });

  it('koring midt i linjen blir stående på plass', () => {
    const p = parseSong('vi {K1: oh} står her', roles, singers);
    expect(p.sections[0].lines[0].parts[1].margin).toBeFalsy();
  });

  it('hovedstemmen er hvit (ingen farge) med koring, men annenstemmen beholdes', () => {
    const p = parseSong('[Vers | HV]\nen\n(HV) to\n\n[Refreng | HV / K1]\ntre\n\n[Bro | K2]\nfire', roles, singers, 'koring');
    expect(p.sections[0].who).toBeNull();
    expect(p.sections[0].lines[1].who).toBeNull();
    expect(p.sections[1].who?.people).toEqual([]);
    expect(p.sections[1].who?.harmony.map((x) => x.id)).toEqual(['b']);
    expect(p.sections[2].who?.people.map((x) => x.id)).toEqual(['c']);
  });

  it('duett: bare solodelene får farge, sammen er uten merking', () => {
    const r = { hv: 'b', hv2: 'a' };
    const p = parseSong('[Vers 1 | Bo]\nen\n\n[Vers 2]\nto\n\n[Vers 3 | HV2]\ntre', r, singers, 'duett');
    expect(p.sections.map((s) => s.who?.people.map((x) => x.id) ?? null)).toEqual([['b'], null, ['a']]);
  });
});

describe('whoStyle', () => {
  it('én person gir farget tekst og strek', () => {
    const s = whoStyle({ people: [singers[0]], all: false, harmony: [] }, false);
    expect(s.text).toBe('#ff0000');
    expect(s.bar).toContain('#ff0000');
  });
  it('flere personer gir nøytral tekst og fargeovergang', () => {
    const s = whoStyle({ people: [singers[0], singers[1]], all: false, harmony: [] }, false);
    expect(s.text).toBeUndefined();
    expect(s.bar).toBe('linear-gradient(#ff0000,#00ff00)');
  });
  it('lys visning gjør fargen mørkere', () => {
    expect(whoStyle({ people: [singers[0]], all: false, harmony: [] }, true).text).toBe('color-mix(in srgb, #ff0000 62%, black)');
  });
});
