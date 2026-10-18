import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

vi.mock('./platform.js', () => ({ isNative: false }));
vi.mock('./fileSaver.js', () => ({ saveFile: vi.fn() }));
vi.mock('./printTemplate.js', () => ({ withLogo: (h) => h }));
const { H2C_MEASURE_IMG } = await import('./printHtml.js');

describe('PDFs made on the phone (html2canvas)', () => {
  it('targets the exact image html2canvas measures text with — or the PDF text is drawn too low again', () => {
    // If an html2canvas update changes this image, the CSS fix in printHtml.js no longer applies
    const lib = readFileSync(createRequire(import.meta.url).resolve('html2canvas'), 'utf8');
    expect(lib).toContain(`SMALL_IMAGE = '${H2C_MEASURE_IMG}'`);
  });
});
