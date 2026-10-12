import Asset from '../models/Asset.js';
import { nextNumber } from './sequence.service.js';

/** MGM-AST-NNN, one running number for all assets. */
export function generateAssetCode() {
  return nextNumber({ prefix: 'MGM-AST-', sources: [{ model: Asset, field: 'assetCode' }] });
}
