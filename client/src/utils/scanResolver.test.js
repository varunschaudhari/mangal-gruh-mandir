import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupProduct = vi.fn();
const lookupAssetUnit = vi.fn();
vi.mock('../api/product.api.js', () => ({ lookupProduct: (...a) => lookupProduct(...a) }));
vi.mock('../api/assetUnit.api.js', () => ({ lookupAssetUnit: (...a) => lookupAssetUnit(...a) }));

const { resolveScan } = await import('./scanResolver.js');
const httpError = (status) => Object.assign(new Error('x'), { response: { status } });

describe('resolveScan', () => {
  beforeEach(() => { lookupProduct.mockReset(); lookupAssetUnit.mockReset(); });

  it('sends coupons to the Redeem screen', async () => {
    expect(await resolveScan('mp-20261009-042')).toEqual({ to: '/mahaprasad/redeem?code=MP-20261009-042' });
  });

  it('opens asset labels from any origin (labels printed in the app, desktop or web)', async () => {
    const id = 'a'.repeat(24);
    expect(await resolveScan(`https://mandir.aumora.io/assets/${id}/history`)).toEqual({ to: `/assets/${id}/history` });
    expect(await resolveScan(`https://localhost/assets/${id}/history`)).toEqual({ to: `/assets/${id}/history` });
  });

  it('rejects other links', async () => {
    expect((await resolveScan('https://example.com/promo')).error).toMatch(/not from Mangal Grah Mandir/);
  });

  it('looks up asset unit stickers', async () => {
    lookupAssetUnit.mockResolvedValue({ data: { data: { asset: { _id: 'asset1' } } } });
    expect(await resolveScan('MGM-AST-007-01')).toEqual({ to: '/assets/asset1/units' });
    expect(lookupProduct).not.toHaveBeenCalled();
  });

  it('looks up products by code or barcode', async () => {
    lookupProduct.mockResolvedValue({ data: { data: { _id: 'p1' } } });
    expect(await resolveScan('8901234567890')).toEqual({ to: '/masters/products/p1' });
  });

  it('explains what went wrong', async () => {
    lookupProduct.mockRejectedValue(httpError(404));
    expect((await resolveScan('XYZ')).error).toBe('Nothing found for "XYZ"');
    lookupProduct.mockRejectedValue(httpError(403));
    expect((await resolveScan('XYZ')).error).toMatch(/access to products/);
    lookupProduct.mockRejectedValue(new Error('Network Error'));
    expect((await resolveScan('XYZ')).error).toMatch(/connection/);
  });
});
