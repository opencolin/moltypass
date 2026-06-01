// Global setup loaded by vitest.config.ts before every test file.

import { beforeEach } from 'vitest';
import './fake-chrome';
import { resetFakeChrome } from './fake-chrome';
import { resetFakeIdb } from './fake-idb';

beforeEach(() => {
  resetFakeChrome();
  resetFakeIdb();
});

export { resetFakeChrome, resetFakeIdb };
export { fakeChrome } from './fake-chrome';
