// Public web address of the app, for links sent to devotees (booking receipts, Mahaprasad
// coupons). PUBLIC_APP_URL if set, else the first CLIENT_URL.
export const appUrl = () => (process.env.PUBLIC_APP_URL || (process.env.CLIENT_URL || 'https://mandir.aumora.io').split(',')[0])
  .trim().replace(/\/$/, '');

/** The page with a sale's Mahaprasad coupon QRs (client: pages/mahaprasad/PublicCoupons.jsx). */
export const couponPageUrl = (shareToken) => `${appUrl()}/m/${shareToken}`;
