import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { isNative, platform } from './platform.js';

// ── Back button ───────────────────────────────────────────────────────────────
// Open overlays (sheets, modals) register a close handler here so the Android
// back button closes the top-most overlay before navigating back.
const backHandlers = [];

export function pushBackHandler(fn) {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.lastIndexOf(fn);
    if (i !== -1) backHandlers.splice(i, 1);
  };
}

// Screens where back leaves the app instead of navigating further back.
const EXIT_PATHS = ['/', '/dashboard', '/login'];

// ── Keyboard ──────────────────────────────────────────────────────────────────
// Adds `keyboard-open` to <html> while the on-screen keyboard is up so CSS can
// hide the bottom tab bar instead of letting it ride on top of the keyboard.
function trackKeyboard() {
  const root = document.documentElement;
  if (isNative) {
    Keyboard.addListener('keyboardWillShow', () => root.classList.add('keyboard-open'));
    Keyboard.addListener('keyboardWillHide', () => root.classList.remove('keyboard-open'));
    return;
  }
  // Browser/PWA: approximate with focus on text-entry fields.
  const isTextField = (el) =>
    el?.matches?.('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file])');
  document.addEventListener('focusin', (e) => { if (isTextField(e.target)) root.classList.add('keyboard-open'); });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!isTextField(document.activeElement)) root.classList.remove('keyboard-open'); }, 50);
  });
}

export function initNativeShell() {
  trackKeyboard();
  if (!isNative) return;

  document.documentElement.classList.add('native', `platform-${platform}`);
  // Dark status-bar icons on our white app bar.
  SystemBars.setStyle({ style: SystemBarsStyle.Light }).catch(() => {});

  App.addListener('backButton', ({ canGoBack }) => {
    const top = backHandlers[backHandlers.length - 1];
    if (top) { top(); return; }
    if (!canGoBack || EXIT_PATHS.includes(window.location.pathname)) { App.minimizeApp(); return; }
    window.history.back();
  });
}

let splashHidden = false;
// Called once the first screen has rendered so users never see a blank WebView.
export function hideSplash() {
  if (!isNative || splashHidden) return;
  splashHidden = true;
  SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
}
