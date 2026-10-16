import { registerPlugin } from '@capacitor/core';
import toast from 'react-hot-toast';
import { couponWhatsAppText, couponWhatsAppUrl } from './mahaprasadShare.js';
import { isNative, platform, serverUrl } from './platform.js';
import { tNow } from '../i18n/index.jsx';

// The counter's "Send on WhatsApp" for Mahaprasad coupons: the message *and* the QR picture, so
// the devotee has the QR in the chat even with no internet at the hall.
//   Android app — straight into the devotee's chat, picture attached with the message as caption
//                 (WhatsAppSharePlugin.java: the share menu can't open an unsaved number's chat).
//   Desktop app, browsers — a link can't carry a picture: the picture is copied, WhatsApp opens
//                 with the message, and the counter pastes it (Ctrl+V).
//   Otherwise, or a sale with no picture (sold offline) — the message alone.
// `batch`: { mobile, numbers, date, persons, link, image } (image = the server's QR picture address).

const WhatsAppShare = registerPlugin('WhatsAppShare');

// Same as tapping a link: the apps and the desktop app hand it to WhatsApp / the browser
function openLink(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.click();
}

async function fetchPicture(image) {
  const res = await fetch(serverUrl(new URL(image).pathname));
  if (!res.ok) throw new Error(`picture ${res.status}`);
  return res.blob();
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** Returns how it went: 'chat' (Android, with picture), 'copied' (picture to paste) or 'text'. */
export async function shareCouponsOnWhatsApp(batch) {
  const url = couponWhatsAppUrl(batch);
  if (batch.image) {
    try {
      if (isNative && platform === 'android') {
        const image = await toBase64(await fetchPicture(batch.image));
        await WhatsAppShare.share({ phone: `91${batch.mobile}`, text: couponWhatsAppText(batch), image });
        return 'chat';
      }
      if (!isNative && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        // Copy before opening WhatsApp: the page must still have focus to write to the clipboard
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': fetchPicture(batch.image) })]);
        toast(tNow('QR picture copied — paste it into the WhatsApp chat (Ctrl+V)'), { icon: '📋', duration: 8000 });
        openLink(url);
        return 'copied';
      }
    } catch {
      // No WhatsApp, no picture, clipboard refused… the message alone still has the link
    }
  }
  openLink(url);
  return 'text';
}
