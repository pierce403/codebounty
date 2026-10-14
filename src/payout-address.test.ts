import { describe, expect, it } from 'vitest';
import { maskPayoutAddress, PAYOUT_NETWORKS, validatePayoutAddress } from './payout-address';

const checksummed = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'; // ERC-55 test vector

describe('payout address settings', () => {
  it('offers explicit mainnet choices with stable chain IDs', () => {
    expect(PAYOUT_NETWORKS.map((network) => network.chainId)).toEqual([1, 8453]);
  });

  it('accepts the ERC-55 checksum vector and normalizes lowercase input', () => {
    expect(validatePayoutAddress(checksummed, 1)).toMatchObject({ ok: true, address: checksummed, chainId: 1 });
    expect(validatePayoutAddress(checksummed.toLowerCase(), 8453)).toMatchObject({ ok: true, address: checksummed, chainId: 8453 });
  });

  it('rejects a corrupted mixed-case checksum, malformed values, and the zero address', () => {
    expect(validatePayoutAddress('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 1)).toMatchObject({ ok: false });
    expect(validatePayoutAddress('0x1234', 1)).toMatchObject({ ok: false });
    expect(validatePayoutAddress('0x0000000000000000000000000000000000000000', 1)).toMatchObject({ ok: false });
    expect(validatePayoutAddress('0X5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 1)).toMatchObject({ ok: false });
  });

  it('requires a supported selected chain and rejects a bounty chain mismatch', () => {
    expect(validatePayoutAddress(checksummed, 999999)).toMatchObject({ ok: false });
    expect(validatePayoutAddress(checksummed, 8453, 1)).toMatchObject({ ok: false });
    expect(validatePayoutAddress(checksummed, 8453, 8453)).toMatchObject({ ok: true });
  });

  it('only exposes a short, masked preview', () => {
    expect(maskPayoutAddress(checksummed)).toBe('0x5aAe…eAed');
    expect(maskPayoutAddress('bad')).toBe('Not set');
    expect(maskPayoutAddress(null)).toBe('Not set');
  });
});
