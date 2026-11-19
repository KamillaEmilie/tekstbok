import { describe, expect, it } from 'vitest';
import { formatMs, fromPastedText, pickTrack } from './importText';

describe('ny låt fra innlimt tekst', () => {
  it('fjerner søppel fra tekstsider og deler opp', () => {
    const r = fromPastedText('la la\nhei hå\nla la\nhei hå\nSource: Musixmatch\nSongwriters: Noen\nLyrics provided by X');
    expect(r.title).toBe('');
    expect(r.text).not.toMatch(/Source|Songwriters|provided/);
    expect(r.text).toContain('la la');
  });

  it('gjetter tittel fra «… Lyrics» og fjerner Genius-støy', () => {
    const r = fromPastedText('12 ContributorsTranslationsEnglishMin sang Lyrics\n[Vers 1]\nen linje\nto linjer\nYou might also like\nsiste linje42Embed');
    expect(r.title).toBe('Min sang');
    expect(r.text).toBe('[Vers 1]\nen linje\nto linjer\nsiste linje');
  });

  it('«Artist – Tittel lyrics» og «Tittel by Artist»', () => {
    expect(fromPastedText('Bandet – Sangen lyrics\na\nb')).toMatchObject({ artist: 'Bandet', title: 'Sangen' });
    expect(fromPastedText('Sangen by Bandet\na\nb\nc')).toMatchObject({ artist: 'Bandet', title: 'Sangen' });
  });

  it('lar vanlige første linjer være tekst', () => {
    expect(fromPastedText('Jeg gikk hjem i regnet\nog tenkte på deg').title).toBe('');
  });
});

describe('varighet', () => {
  it('velger treff med riktig tittel og artist', () => {
    const r = pickTrack(
      [
        { trackName: 'Footloose (Live)', artistName: 'Noen andre', trackTimeMillis: 100000 },
        { trackName: 'Footloose', artistName: 'Kenny Loggins', trackTimeMillis: 227000 },
        { trackName: 'Annen sang', artistName: 'Kenny Loggins', trackTimeMillis: 1 },
      ],
      'Footloose',
      'Kenny Loggins',
    );
    expect(r?.trackTimeMillis).toBe(227000);
    expect(formatMs(227000)).toBe('3:47');
  });

  it('gir null når tittelen ikke finnes', () => {
    expect(pickTrack([{ trackName: 'Noe helt annet', artistName: 'X', trackTimeMillis: 1 }], 'Footloose', '')).toBeNull();
  });
});
