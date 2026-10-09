import toast from 'react-hot-toast';
import { isNative } from './platform.js';
import { saveFile } from './fileSaver.js';

const A4_WIDTH_PX = 794; // A4 at 96 dpi

// Print-only bits of our print templates that make no sense in a PDF.
const stripForPdf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<button[^>]*class="print-btn"[\s\S]*?<\/button>/gi, '');

const waitForAssets = async (doc) => {
  await Promise.all(
    [...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))),
  );
  await doc.fonts?.ready;
};

// Render an HTML document to an A4 PDF on the device (multi-page if needed).
async function htmlToPdf(html, width) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:100px;border:0;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(stripForPdf(html));
    doc.close();
    await waitForAssets(doc);
    iframe.style.height = `${doc.documentElement.scrollHeight}px`;

    const canvas = await html2canvas(doc.documentElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: width,
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.92);

    // Slide the full-height image up one page at a time.
    for (let y = 0; y < imgH; y += pageH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, -y, pageW, imgH);
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

/**
 * Print one of our HTML print templates.
 * - Browser / Electron: opens it in a print window, as before (`win` lets callers
 *   pass a window they opened synchronously to dodge pop-up blockers).
 * - Android / iOS app: there is no print window, so it becomes a PDF that opens in
 *   the share sheet (WhatsApp, email, Drive, or any installed printer service).
 */
export async function printHtml(html, { filename = 'document.pdf', width = A4_WIDTH_PX, win = null, features = 'width=680,height=800' } = {}) {
  if (isNative) {
    const toastId = toast.loading('Preparing PDF…');
    try {
      await saveFile(await htmlToPdf(html, width), filename);
      toast.dismiss(toastId);
    } catch {
      toast.error('Could not create the PDF', { id: toastId });
    }
    return;
  }

  const w = win || window.open('', '_blank', features);
  if (!w) {
    toast.error('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
