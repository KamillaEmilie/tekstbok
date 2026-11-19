import { registerSW } from 'virtual:pwa-register';

export const pwa = $state({ updateReady: false, offlineReady: false });

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pwa.updateReady = true;
    },
    onOfflineReady() {
      pwa.offlineReady = true;
    },
    onRegisteredSW(_url, reg) {
      // Se etter ny versjon når appen åpnes igjen og det er nett.
      if (!reg) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void reg.update().catch(() => {});
      });
    },
  });
}

/** Tar i bruk ny versjon nå (kun fra knapp utenfor scenemodus). */
export function applyUpdate() {
  void updateSW?.(true);
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
