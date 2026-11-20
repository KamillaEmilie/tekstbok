// Malerverktøyet: gjør en tekstlinje om til ord med «maling» (kor eller 2. stemme), og tilbake.
// Brukeren ser aldri kodene; de skrives som {K1: …} og {/K1: …} i teksten i bakgrunnen.
import { INLINE, LABEL, LINE_WHO, resolveWho, withoutLead } from './parser';
import type { RoleCode, Singer, VocalMode } from './types';

/** code = hvem (f.eks. «K1», «K1+K2», «HV2»; '' = standard koring). harm = 2. stemme (strek under). */
export type Paint = { code: string; harm: boolean };
/** fromTag = malingen kommer fra et linjemerke som «(K1)» foran hele linjen. */
export type Token = { w: string; paint: Paint | null; fromTag?: boolean };
type Roles = Partial<Record<RoleCode, string>>;

export const samePaint = (a: Paint | null, b: Paint | null) =>
  a === b || (!!a && !!b && a.code === b.code && a.harm === b.harm);

/** «(K1)» / «(HV/K1)» / «(/K1)» først på linjen → maling for hele linjen. Hovedstemmen alene gir ingen maling. */
function tagToPaint(tag: string, roles: Roles, singers: Singer[], mode?: VocalMode): Paint | null {
  const [mel, harm] = tag.split('/');
  if (harm !== undefined && harm.trim()) return { code: harm.trim(), harm: true };
  const who = withoutLead(resolveWho(mel, roles, singers, true), mode, roles);
  return who && who.people.length ? { code: mel.trim(), harm: false } : null;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Tekstlinje → ord med maling. */
export function lineToTokens(line: string, roles: Roles, singers: Singer[], mode?: VocalMode): Token[] {
  let body = line.trim();
  let base: Paint | null = null;
  const lm = body.match(LINE_WHO);
  if (lm && resolveWho(lm[1], roles, singers, true)) {
    body = lm[2];
    base = tagToPaint(lm[1], roles, singers, mode);
  }
  const hasKoring = !!(roles.k1 || roles.k2);
  const toks: Token[] = [];
  let last = 0;
  for (const m of body.matchAll(INLINE)) {
    const code = m[1];
    const valid = code !== undefined ? !!resolveWho(code, roles, singers, true) : hasKoring;
    if (!valid || !m[2].trim()) continue;
    for (const w of words(body.slice(last, m.index))) toks.push({ w, paint: base, fromTag: !!base });
    const paint: Paint =
      code === undefined ? { code: '', harm: false } : { code: code.trim().replace(/^\//, '').trim(), harm: code.trim().startsWith('/') };
    for (const w of words(m[2])) toks.push({ w, paint });
    last = m.index! + m[0].length;
  }
  for (const w of words(body.slice(last))) toks.push({ w, paint: base, fromTag: !!base });
  return toks;
}

/** Ord med maling → tekstlinje. Ord med samme maling slås sammen til én {…}. */
export function tokensToLine(toks: Token[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const p = toks[i].paint;
    let j = i;
    while (j < toks.length && samePaint(toks[j].paint, p)) j++;
    const text = toks
      .slice(i, j)
      .map((t) => t.w)
      .join(' ');
    if (!p) out.push(text);
    else if (!p.code && !p.harm) out.push(`{${text}}`);
    else out.push(`{${p.harm ? '/' : ''}${p.code}: ${text}}`);
    i = j;
  }
  return out.join(' ');
}

/** «Siri alene» + «Kamilla 2. stemme» → «Siri med Kamilla på 2. stemme» ({HV2/HV: …}). */
const combine = (base: Paint, harm: Paint): Paint => ({ code: `${base.code}/${harm.code}`, harm: false });
const splitCombined = (p: Paint) => (p.harm || !p.code.includes('/') ? null : p.code.split('/').map((x) => x.trim()));

const ORDER = ['HV', 'HV1', 'HV2', 'K1', 'K2'];
const sortCodes = (c: string[]) =>
  [...new Set(c)].sort((a, b) => (ORDER.indexOf(a.toUpperCase()) + 1 || 99) - (ORDER.indexOf(b.toUpperCase()) + 1 || 99));
/** Legger til eller fjerner personene i «add» fra «K1+K2»-lista. Tom liste → ''. */
function toggleCodes(have: string, add: string): string {
  const cur = have.split('+').map((x) => x.trim()).filter(Boolean);
  const adds = add.split('+').map((x) => x.trim()).filter(Boolean);
  const allThere = adds.every((a) => cur.some((c) => c.toUpperCase() === a.toUpperCase()));
  const next = allThere ? cur.filter((c) => !adds.some((a) => a.toUpperCase() === c.toUpperCase())) : [...cur, ...adds];
  return sortCodes(next).join('+');
}

/** Maler ett ord: samme pensel en gang til (eller viskelær) fjerner malingen. */
export function paintWord(line: string, index: number, pen: Paint | null, roles: Roles, singers: Singer[], mode?: VocalMode): string {
  const toks = lineToTokens(line, roles, singers, mode);
  if (!toks[index]) return line;
  // Et gammelt linjemerke («(K1)» foran hele linjen) behandles som én enhet: 2. stemme betyr at
  // hovedstemmen synger linjen, og viskelær fjerner hele merket.
  if (toks[index].fromTag && (!pen || pen.harm)) {
    for (const t of toks) if (t.fromTag) t.paint = null;
    if (!pen) return tokensToLine(toks);
  }
  const cur = toks[index].paint;
  const parts = cur && splitCombined(cur);
  let next: Paint | null;
  if (pen?.harm && mode !== 'duett') {
    // Med koring betyr 2. stemme at hovedstemmen synger melodien: bare strekene beholdes.
    const have = cur?.harm ? cur.code : parts ? parts[1] : '';
    const set = have ? toggleCodes(have, pen.code) : pen.code;
    next = set ? { code: set, harm: true } : null;
  } else if (pen?.harm && cur?.harm) {
    // Flere på 2. stemme: legg til eller fjern denne personen
    const set = toggleCodes(cur.code, pen.code);
    next = set ? { code: set, harm: true } : null;
  } else if (pen?.harm && parts) {
    const set = toggleCodes(parts[1], pen.code);
    next = set ? { code: `${parts[0]}/${set}`, harm: false } : { code: parts[0], harm: false };
  } else if (pen?.harm && cur && !cur.harm && cur.code) next = combine(cur, pen); // legg 2. stemme på en solo
  else next = pen && !samePaint(cur, pen) ? pen : null;
  toks[index] = { ...toks[index], paint: next };
  return tokensToLine(toks);
}

/** «[Vers 1 | Siri]» → { label, who }. */
export function readLabel(line: string): { label: string; who: string } | null {
  const m = line.match(LABEL);
  if (!m) return null;
  const [label, who = ''] = m[1].split('|');
  return { label: label.trim(), who: who.trim() };
}

/** Lager delmerke-linjen. Tom etikett og ingen «hvem» gir null (linjen kan fjernes). */
export function writeLabel(label: string, who: string): string | null {
  if (!label && !who) return null;
  return who ? `[${label} | ${who}]` : `[${label}]`;
}

/**
 * Gjør gammel merking av hele deler («[Vers 3 | Siri]») om til maling på ordene, så alt kan
 * endres med penslene. Delnavnet beholdes. Returnerer null hvis ingenting ble endret.
 */
export function flattenSectionWho(text: string, roles: Roles, singers: Singer[], mode?: VocalMode): string | null {
  const lines = text.split('\n');
  let changed = false;
  let paint: Paint | null | undefined; // undefined = ingen aktiv del-merking
  let afterLabel = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      if (!afterLabel) paint = undefined;
      continue;
    }
    const lab = LABEL.test(line) ? readLabel(line) : null;
    if (lab) {
      afterLabel = true;
      paint = undefined;
      if (!lab.who) continue;
      const who = resolveWho(lab.who, roles, singers);
      if (!who) continue;
      const [mel, harm] = lab.who.split('/');
      const melWho = withoutLead(resolveWho(mel, roles, singers), mode, roles);
      const together = mode === 'duett' && melWho && melWho.people.length > 1;
      const melPaint = melWho?.people.length && !together ? { code: mel.trim(), harm: false } : null;
      const harmPaint = harm?.trim() ? { code: harm.trim(), harm: true } : null;
      paint = melPaint && harmPaint ? combine(melPaint, harmPaint) : (melPaint ?? harmPaint);
      const nl = writeLabel(lab.label, '');
      if (nl === null) {
        lines.splice(i, 1);
        i--;
      } else lines[i] = nl;
      changed = true;
      continue;
    }
    afterLabel = false;
    const p = paint;
    if (!p) continue;
    const toks = lineToTokens(line, roles, singers, mode).map((t) =>
      !t.paint ? { ...t, paint: p } : t.paint.harm && !p.harm && !splitCombined(p) ? { ...t, paint: combine(p, t.paint) } : t,
    );
    lines[i] = tokensToLine(toks);
  }
  return changed ? lines.join('\n') : null;
}

/** Har ordet allerede det pensen gir? (brukes når man drar over flere ord) */
export function wordHasPen(line: string, index: number, pen: Paint | null, roles: Roles, singers: Singer[], mode?: VocalMode): boolean {
  const t = lineToTokens(line, roles, singers, mode)[index];
  if (!t) return false;
  if (!pen) return !t.paint;
  const cur = t.paint;
  if (!cur) return false;
  if (pen.harm) {
    const have = cur.harm ? cur.code : (splitCombined(cur)?.[1] ?? '');
    const codes = have.split('+').map((x) => x.trim().toUpperCase());
    return pen.code.split('+').every((c) => codes.includes(c.trim().toUpperCase()));
  }
  return samePaint(cur, pen);
}

/** Setter (on) eller fjerner (!on) pensen på ett ord, uten å veksle. */
export function setWordPen(line: string, index: number, pen: Paint | null, on: boolean, roles: Roles, singers: Singer[], mode?: VocalMode): string {
  if (!pen) return paintWord(line, index, null, roles, singers, mode); // viskelær
  return wordHasPen(line, index, pen, roles, singers, mode) === on ? line : paintWord(line, index, pen, roles, singers, mode);
}

// ---- Ren tekst i tekstfeltet, maling bevares ----

type Entry = { kind: 'raw'; line: string } | { kind: 'words'; toks: Token[] };

function entries(text: string, roles: Roles, singers: Singer[], mode?: VocalMode): Entry[] {
  return text.split('\n').map((line) =>
    !line.trim() || LABEL.test(line) ? { kind: 'raw', line } : { kind: 'words', toks: lineToTokens(line, roles, singers, mode) },
  );
}

/** Teksten uten koder: det du ser og skriver i tekstfeltet. Delnavn-linjer står som de er. */
export function toPlain(text: string, roles: Roles, singers: Singer[], mode?: VocalMode): string {
  return entries(text, roles, singers, mode)
    .map((e) => (e.kind === 'raw' ? e.line : e.toks.map((t) => t.w).join(' ')))
    .join('\n');
}

const wnorm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/**
 * Lager ny tekst fra det som er skrevet i tekstfeltet, og flytter malingen over til ordene som
 * fortsatt finnes (ordene matches i rekkefølge, så endringer et sted ikke forskyver resten).
 */
export function reconcile(oldText: string, plain: string, roles: Roles, singers: Singer[], mode?: VocalMode): string {
  const oldWords: Token[] = [];
  for (const e of entries(oldText, roles, singers, mode)) if (e.kind === 'words') oldWords.push(...e.toks);
  const newLines = plain.split('\n');
  const newWords: { li: number; w: string }[] = [];
  newLines.forEach((line, li) => {
    if (!line.trim() || LABEL.test(line)) return;
    for (const w of line.split(/\s+/).filter(Boolean)) newWords.push({ li, w });
  });
  // Lengste felles delsekvens på ordnivå
  const n = oldWords.length;
  const m = newWords.length;
  const a = oldWords.map((t) => wnorm(t.w));
  const b = newWords.map((t) => wnorm(t.w));
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const paintFor: (Paint | null)[] = new Array(m).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      paintFor[j] = oldWords[i].paint;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  // Bygg linjene på nytt
  const perLine = new Map<number, Token[]>();
  newWords.forEach((nw, k) => {
    const arr = perLine.get(nw.li) ?? [];
    arr.push({ w: nw.w, paint: paintFor[k] });
    perLine.set(nw.li, arr);
  });
  return newLines.map((line, li) => (perLine.has(li) ? tokensToLine(perLine.get(li)!) : line)).join('\n');
}
