export const NATIVE_FEE_ASSET = '0x0000000000000000000000000000000000000000';

export interface CreatorFeeClaimAmount {
  asset: string;
  amountRaw: bigint;
}

export async function recordCreatorFeeClaim(
  creatorAddress: string,
  amounts: CreatorFeeClaimAmount[],
  txHashes: string[],
  tokenAddress?: string,
): Promise<string | null> {
  const response = await fetch('/api/creator-fee-claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creatorAddress,
      amounts: amounts.map(({ asset, amountRaw }) => ({ asset, amountRaw: amountRaw.toString() })),
      txHashes,
      tokenAddress,
    }),
  });
  const payload = await response.json().catch(() => null) as {
    error?: string;
    googleSheetsSync?: { synced?: boolean; error?: string };
    feeSnapshotWarning?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to save creator fee claim.');
  }
  const warnings = [
    payload?.googleSheetsSync?.synced === false
      ? payload.googleSheetsSync.error || 'Google Sheets sync failed.'
      : null,
    payload?.feeSnapshotWarning
      ? `Live token fee snapshot could not be refreshed: ${payload.feeSnapshotWarning}`
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  return warnings.length ? warnings.join(' ') : null;
}

export async function getCreatorFeeClaimTotals(creatorAddress: string): Promise<Record<string, bigint>> {
  const response = await fetch(`/api/creator-fee-claims?creatorAddress=${encodeURIComponent(creatorAddress)}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'Unable to load creator fee history.');
  }
  const payload = await response.json() as { claimedByAsset?: Record<string, string> };
  return Object.fromEntries(Object.entries(payload.claimedByAsset || {}).map(
    ([asset, amount]) => [asset.toLowerCase(), BigInt(amount)],
  ));
}
