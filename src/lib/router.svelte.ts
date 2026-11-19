export type Route =
  | { name: 'library' }
  | { name: 'song'; id: string }
  | { name: 'setlists' }
  | { name: 'setlist'; id: string }
  | { name: 'stage'; setlistId: string | null; songId: string | null; index: number }
  | { name: 'singers' }
  | { name: 'share' };

function parse(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (p[0]) {
    case 'song':
      return p[1] ? { name: 'song', id: p[1] } : { name: 'library' };
    case 'setlists':
      return { name: 'setlists' };
    case 'setlist':
      return p[1] ? { name: 'setlist', id: p[1] } : { name: 'setlists' };
    case 'stage':
      return { name: 'stage', setlistId: p[1] || null, songId: null, index: Math.max(0, Number(p[2]) || 0) };
    case 'play':
      return { name: 'stage', setlistId: null, songId: p[1] || null, index: 0 };
    case 'singers':
      return { name: 'singers' };
    case 'share':
      return { name: 'share' };
    default:
      return { name: 'library' };
  }
}

export const router = $state({ route: parse(location.hash) });

window.addEventListener('hashchange', () => {
  router.route = parse(location.hash);
});

export function go(path: string) {
  location.hash = '/' + path;
}

/** Oppdaterer adressen uten ny historikk-oppføring (brukes ved låtbytte på scenen). */
export function replace(path: string) {
  history.replaceState(null, '', '#/' + path);
  router.route = parse(location.hash);
}
