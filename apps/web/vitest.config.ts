import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolves the "@/..." alias declared in tsconfig.json (built into Vite 8).
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
