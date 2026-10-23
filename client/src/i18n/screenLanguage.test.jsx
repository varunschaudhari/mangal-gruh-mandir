// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEVOTEE_LANGUAGES, LanguageProvider, LanguageSwitch, useT } from './index.jsx';

function Save({ id }) {
  const t = useT();
  return <p data-testid={id}>{t('Save')}</p>;
}

// The app, with a TV display inside it that keeps its own language
const AppWithTv = () => (
  <LanguageProvider>
    <Save id="app" />
    <LanguageProvider storageKey="mgm-lang-test-screen">
      <Save id="tv" />
      <LanguageSwitch />
    </LanguageProvider>
  </LanguageProvider>
);

describe('a TV screen with its own language', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('starts in the app language', () => {
    localStorage.setItem('mgm-lang', 'mr');
    render(<AppWithTv />);
    expect(screen.getByTestId('tv')).toHaveTextContent('जतन करा');
  });

  it('switching the TV leaves the app language alone', async () => {
    render(<AppWithTv />);
    await userEvent.click(screen.getByRole('radio', { name: 'मराठी' }));
    expect(screen.getByTestId('tv')).toHaveTextContent('जतन करा');
    expect(screen.getByTestId('app')).toHaveTextContent('Save');
    expect(localStorage.getItem('mgm-lang')).toBe(null);
    expect(localStorage.getItem('mgm-lang-test-screen')).toBe('mr');
  });

  it('remembers the TV language on its own', () => {
    localStorage.setItem('mgm-lang', 'en');
    localStorage.setItem('mgm-lang-test-screen', 'mr');
    render(<AppWithTv />);
    expect(screen.getByTestId('tv')).toHaveTextContent('जतन करा');
    expect(screen.getByTestId('app')).toHaveTextContent('Save');
  });
});

function CouponTitle() {
  const t = useT();
  return <p data-testid="page">{t('Shri Mangal Mahaprasad coupon')}</p>;
}

describe('Hindi only on the devotee screens', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); delete navigator.languages; });
  const choices = () => screen.getAllByRole('radio').map((r) => r.textContent);

  it('the staff app offers English and Marathi only', () => {
    localStorage.setItem('mgm-lang', 'hi');   // not one of its languages: ignored
    render(<LanguageProvider><LanguageSwitch /></LanguageProvider>);
    expect(choices()).toEqual(['English', 'मराठी']);
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a devotee page also offers Hindi, and opens in Hindi on a Hindi phone', () => {
    Object.defineProperty(navigator, 'languages', { value: ['hi-IN', 'en-GB'], configurable: true });
    render(<LanguageProvider storageKey="mgm-lang-test-devotee" languages={DEVOTEE_LANGUAGES} fromBrowser><CouponTitle /><LanguageSwitch /></LanguageProvider>);
    expect(choices()).toEqual(['English', 'मराठी', 'हिंदी']);
    expect(screen.getByTestId('page')).toHaveTextContent('श्री मंगल महाप्रसाद कूपन');
  });

  it('the devotee\'s own choice wins over the phone\'s language', async () => {
    Object.defineProperty(navigator, 'languages', { value: ['hi-IN'], configurable: true });
    render(<LanguageProvider storageKey="mgm-lang-test-devotee" languages={DEVOTEE_LANGUAGES} fromBrowser><CouponTitle /><LanguageSwitch /></LanguageProvider>);
    await userEvent.click(screen.getByRole('radio', { name: 'मराठी' }));
    expect(screen.getByTestId('page')).toHaveTextContent('श्री मंगल महाप्रसाद कूपन');   // the same in Marathi
    expect(localStorage.getItem('mgm-lang-test-devotee')).toBe('mr');
    expect(localStorage.getItem('mgm-lang')).toBe(null);
  });
});
