import { describe, expect, it } from 'vitest';
import { Sha256, sha256Blob, sha256Text } from './sha256';

const randomBytes = (n: number) => {
  const out = new Uint8Array(n);
  for (let at = 0; at < n; at += 65536) crypto.getRandomValues(out.subarray(at, Math.min(n, at + 65536)));
  return out;
};
const ref = async (b: Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map((x) => x.toString(16).padStart(2, '0')).join('');
};

describe('sha256', () => {
  it('matches the known vectors', () => {
    expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('matches WebCrypto for lengths around the block boundaries, fed in uneven pieces', async () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 10007]) {
      const data = randomBytes(n);
      const h = new Sha256();
      let at = 0;
      let step = 1;
      while (at < n) {
        h.update(data.subarray(at, Math.min(n, at + step)));
        at += step;
        step = (step * 3) % 97 || 1;
      }
      expect(h.digest()).toBe(await ref(data));
    }
  });
  it('hashes text as UTF-8', async () => {
    expect(sha256Text('café ☕ 𝄞')).toBe(await ref('café ☕ 𝄞'));
  });
  it('hashes a Blob in chunks', async () => {
    const data = randomBytes(5_000_000);
    expect(await sha256Blob(new Blob([data as BlobPart]))).toBe(await ref(data));
  });
});
