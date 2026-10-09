import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
    // Same clock the app runs on: India. Date tests depend on it.
    env: { TZ: 'Asia/Kolkata' },
  },
});
