import { getAddress, isAddress } from 'viem';
import { base, mainnet } from 'viem/chains';

/** Network selection is explicit: an EVM address alone does not identify its chain. */
export const PAYOUT_NETWORKS = [
  { chainId: mainnet.id, name: 'Ethereum Mainnet', shortName: 'Ethereum' },
  { chainId: base.id, name: 'Base Mainnet', shortName: 'Base' },
] as const;

export type PayoutNetwork = (typeof PAYOUT_NETWORKS)[number];
export type PayoutAddressValidation =
  | { ok: true; address: `0x${string}`; chainId: PayoutNetwork['chainId']; network: PayoutNetwork }
  | { ok: false; reason: string };

/**
 * Validate a recipient address and selected chain without contacting a wallet or RPC.
 * This checks format and EIP-55 mixed-case checksum, not address ownership or USDC support.
 * expectedChainId can enforce a bounty network once its owner has selected one.
 */
export function validatePayoutAddress(
  address: string,
  chainId: number,
  expectedChainId?: number,
): PayoutAddressValidation {
  const network = PAYOUT_NETWORKS.find((candidate) => candidate.chainId === chainId);
  if (!network) return { ok: false, reason: 'Choose a supported payout network.' };
  if (expectedChainId !== undefined && chainId !== expectedChainId) {
    return { ok: false, reason: 'The selected network does not match this bounty.' };
  }

  const trimmed = address.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed) || !isAddress(trimmed, { strict: true })) {
    return { ok: false, reason: 'Enter a valid 0x Ethereum address. Mixed-case addresses must pass the EIP-55 checksum.' };
  }
  if (/^0x0{40}$/i.test(trimmed)) {
    return { ok: false, reason: 'The zero address cannot receive a payout.' };
  }

  return { ok: true, address: getAddress(trimmed), chainId: network.chainId, network };
}

/** Use in cards and review screens so a saved payout address is masked by default. */
export function maskPayoutAddress(address: string | null | undefined): string {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return 'Not set';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
