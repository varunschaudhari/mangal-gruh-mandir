// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider, LanguageSwitch, useT } from './index.jsx';

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
