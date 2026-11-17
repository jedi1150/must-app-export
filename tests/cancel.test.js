import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAbortError, sleep } from '../js/utils.js';

describe('sleep abort', () => {
  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(sleep(1000, controller.signal), (error) => isAbortError(error));
  });

  it('rejects a pending wait when aborted', async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort();
    await assert.rejects(pending, (error) => isAbortError(error));
  });

  it('resolves when nothing aborts it', async () => {
    await sleep(1);
  });
});
