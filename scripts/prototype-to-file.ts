// Gjør «Kopier alt» fra prototypen om til en .tekstbok.json-fil som kan importeres i appen.
// Bruk: npx vite-node scripts/prototype-to-file.ts <inn.json> [ut.tekstbok.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { convertPrototype, makeBundle } from '../src/lib/io';
import { parseSong } from '../src/lib/parser';
import { DEFAULT_SINGERS, activeRoles } from '../src/lib/types';

const [inFile, outFile = 'bandets-laater.tekstbok.json'] = process.argv.slice(2);
if (!inFile) throw new Error('Mangler inn-fil');
const singers = DEFAULT_SINGERS.map((s) => ({ ...s, updatedAt: 0 }));
const { songs, newSingers } = convertPrototype(JSON.parse(readFileSync(inFile, 'utf8')), singers);
writeFileSync(outFile, JSON.stringify(makeBundle({ songs, setlists: [], singers: [...singers, ...newSingers] }), null, 1));

const all = [...singers, ...newSingers];
const name = (id?: string) => all.find((s) => s.id === id)?.name ?? '–';
console.log(`${songs.length} låter → ${outFile}. Nye vokalister: ${newSingers.map((s) => s.name).join(', ') || 'ingen'}`);
for (const s of songs) {
  const p = parseSong(s.text, activeRoles(s), all);
  const unknown = p.sections
    .flatMap((x) => [x.who, ...x.lines.map((l) => l.who)])
    .flatMap((w) => w?.people ?? [])
    .filter((x) => !x.id)
    .map((x) => x.name);
  const roles = (['hv', 'hv2', 'k1', 'k2'] as const).filter((r) => s[r]).map((r) => `${r.toUpperCase()}=${name(s[r])}`);
  console.log(
    [s.title, s.mode, ...roles, s.text.trim() ? `${p.sections.length} deler` : 'MANGLER TEKST', unknown.length ? `UKJENT: ${[...new Set(unknown)]}` : '']
      .filter(Boolean)
      .join(' | '),
  );
}
