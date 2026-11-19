// Holder skjermen våken i scenemodus.
// Screen Wake Lock finnes i Safari 16.4+, men virker ikke i Hjem-skjerm-apper før iOS 18.4.
// På eldre iPadOS (f.eks. 16.6) spiller vi derfor i tillegg en dempet, skjult video i løkke.
import { mp4, webm } from './wake-media';

let sentinel: { release(): Promise<void> } | null = null;
let video: HTMLVideoElement | null = null;
let wanted = false;

function iosVersion(): number | null {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!isIOS) return null;
  const m = ua.match(/OS (\d+)_(\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : 0;
}

function needsVideo(): boolean {
  if (!('wakeLock' in navigator)) return true;
  const v = iosVersion();
  return v !== null && v < 18.04;
}

async function requestNative() {
  if (sentinel || !('wakeLock' in navigator)) return;
  try {
    const s = await (navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<WakeLockSentinel> } }).wakeLock.request('screen');
    sentinel = s;
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    /* f.eks. ikke synlig, eller ikke tillatt */
  }
}

function startVideo() {
  if (!video) {
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('title', 'Holder skjermen våken');
    video.muted = true;
    video.loop = true;
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
    const add = (type: string, src: string) => {
      const s = document.createElement('source');
      s.type = type;
      s.src = src;
      video!.appendChild(s);
    };
    add('video/webm', webm);
    add('video/mp4', mp4);
    // Hopp litt i videoen så iOS ikke anser den som ferdig.
    video.addEventListener('timeupdate', () => {
      if (video && video.currentTime > 0.5) video.currentTime = Math.random() * 0.4;
    });
    document.body.appendChild(video);
  }
  void video.play().catch(() => {});
}

/** Kall fra en trykk-handler (krav for at videoen får spille). */
export function keepAwake() {
  wanted = true;
  void requestNative();
  if (needsVideo()) startVideo();
}

/** Kall ved hvert trykk i scenemodus: gjenoppretter låsen hvis iOS har sluppet den. */
export function rearm() {
  if (!wanted) return;
  void requestNative();
  if (needsVideo() && video?.paused) void video.play().catch(() => {});
}

export function releaseAwake() {
  wanted = false;
  void sentinel?.release().catch(() => {});
  sentinel = null;
  video?.pause();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') rearm();
});
