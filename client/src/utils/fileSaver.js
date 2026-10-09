import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import toast from 'react-hot-toast';
import { isNative } from './platform.js';

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const safeName = (name) => name.replace(/[\\/:*?"<>|]+/g, '-');

// Native apps: write to the app cache and open the system share sheet
// (WhatsApp, email, Drive, "Save to Files", printers…). The WebView can't do <a download>.
async function shareNative(blob, filename) {
  const path = safeName(filename);
  const { uri } = await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: path, files: [uri] });
  } catch (err) {
    // Closing the share sheet without picking a target rejects — that's not an error.
    if (!/cancel/i.test(err?.message || '')) throw err;
  }
}

// Download a file (browser/Electron) or share it (Android/iOS app).
export async function saveFile(blob, filename) {
  if (isNative) {
    try {
      await shareNative(blob, filename);
    } catch {
      toast.error('Could not share the file');
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a file for viewing (e.g. a PDF in a new tab). In the apps there are no tabs,
// so it goes to the share sheet, which offers the device's PDF viewers and printers.
export async function openFile(blob, filename) {
  if (isNative) return saveFile(blob, filename);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Share a text message (reports, alerts). Browsers open WhatsApp Web/app via wa.me;
// the mobile apps use the system share sheet, which lists WhatsApp and everything else.
export async function shareText(text) {
  if (!isNative) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    return;
  }
  try {
    await Share.share({ text });
  } catch (err) {
    if (!/cancel/i.test(err?.message || '')) toast.error('Could not open share');
  }
}
