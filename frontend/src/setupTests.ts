import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toastStore } from './components/Toast';

beforeEach(() => {
  localStorage.clear();
  toastStore.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
