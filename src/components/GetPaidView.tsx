import React, { useState } from 'react';
import { TwitchIcon, TwitchBitsIcon } from './Icons';
import { Gift, CheckCircle } from 'lucide-react';
import { CreatorProfile, PaymentReceipt } from '../types';
import { useWallet } from '../context/WalletContext';
import { claimPonsV2CreatorFees, getPonsV2CreatorFees, getPonsV2TokensLaunchedBy } from '../utils/ponsV2';
import { NATIVE_FEE_ASSET, recordCreatorFeeClaim } from '../utils/creatorFees';

interface GetPaidViewProps {
  creators: CreatorProfile[];
  receipts: PaymentReceipt[];
}

export const GetPaidView: React.FC<GetPaidViewProps> = ({ creators }) => {
  const { walletAddress } = useWallet();
  const [handleQuery, setHandleQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [creatorFees, setCreatorFees] = useState<bigint | null>(null);
  const [launchedTokens, setLaunchedTokens] = useState<Array<{ token?: string; curve?: string }>>([]);
  const [claiming, setClaiming] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [claimHash, setClaimHash] = useState<string | null>(null);

  const refreshWalletData = async () => {
    if (!walletAddress) return;
    setWalletError(null);
    try {
      const [fees, tokens] = await Promise.all([
        getPonsV2CreatorFees(walletAddress as `0x${string}`),
        getPonsV2TokensLaunchedBy(walletAddress as `0x${string}`),
      ]);
      setCreatorFees(fees.balance);
      setLaunchedTokens(tokens);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Unable to load Pons V2 wallet data.');
    }
  };

  const handleClaim = async () => {
    if (!walletAddress) return;
    setClaiming(true);
    setWalletError(null);
    try {
      const claimedAmount = (await getPonsV2CreatorFees(walletAddress as `0x${string}`)).balance;
      const hashes = await claimPonsV2CreatorFees(walletAddress as `0x${string}`);
      const googleSheetsWarning = await recordCreatorFeeClaim(
        walletAddress,
        claimedAmount > 0n ? [{ asset: NATIVE_FEE_ASSET, amountRaw: claimedAmount }] : [],
        hashes,
      );
      setClaimHash(hashes.join(', '));
      await refreshWalletData();
      if (googleSheetsWarning) setWalletError(`Claim succeeded and was recorded, but Google Sheets could not be updated: ${googleSheetsWarning}`);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Creator fee claim failed.');
    } finally {
      setClaiming(false);
    }
  };

  const matchedCreator = creators.find(
    (c) => c.handle.toLowerCase().replace('@', '') === handleQuery.toLowerCase().replace('@', '')
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (handleQuery.trim()) {
      setSearched(true);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-8 max-w-4xl mx-auto w-full space-y-8">
      <div className="text-center max-w-xl mx-auto space-y-3">
        <div className="text-xs font-semibold text-[#a970ff] uppercase tracking-wider">
          For Twitch Streamers
        </div>

        <section className="rounded-xl border border-[#2d2442] bg-[#111218] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Pons V2 creator wallet</h2>
              <p className="text-xs text-zinc-400">Read creator fees and launches directly from Robinhood Chain.</p>
            </div>
            <button type="button" onClick={refreshWalletData} disabled={!walletAddress} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-white disabled:opacity-40">
              {walletAddress ? 'Load wallet data' : 'Connect wallet'}
            </button>
          </div>
          {walletAddress && creatorFees !== null && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-[#0d0e14] p-3">
                <div className="text-[10px] uppercase text-zinc-500">Claimable fees</div>
                <div className="mt-1 font-mono text-lg font-bold text-emerald-400">{(Number(creatorFees) / 1e18).toFixed(6)} ETH</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-[#0d0e14] p-3">
                <div className="text-[10px] uppercase text-zinc-500">Your V2 launches</div>
                <div className="mt-1 font-mono text-lg font-bold text-white">{launchedTokens.length}</div>
              </div>
              <button type="button" onClick={handleClaim} disabled={claiming || creatorFees === 0n} className="rounded-lg bg-[#9146FF] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                {claiming ? 'Claiming...' : 'Claim creator fees'}
              </button>
            </div>
          )}
          {claimHash && <p className="text-xs text-emerald-300">Claim submitted: {claimHash}</p>}
          {walletError && <p className="text-xs text-red-300">{walletError}</p>}
        </section>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
          Are you a Twitch streamer?
        </h1>
        <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
          No crypto wallet needed. When someone launches a coin for your Twitch channel on Robinhood Chain via Tpaid, trading fees are tracked from live Pons V2 activity.
        </p>
      </div>

      {/* Handle Lookup Box */}
      <div className="bg-[#111218] border border-zinc-850 rounded-xl p-6 sm:p-8 shadow-xl">
        <form onSubmit={handleSearch} className="space-y-4">
          <label className="block text-xs font-medium text-zinc-300 text-center">
            Check fees and Twitch Bits for your Twitch @channel
          </label>
          <div className="flex gap-2 max-w-md mx-auto">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500 text-sm">
                @
              </span>
              <input
                type="text"
                value={handleQuery}
                onChange={(e) => {
                  setHandleQuery(e.target.value);
                  setSearched(false);
                }}
                placeholder="kaicenat, xqc, tarik, etc."
                className="w-full bg-[#0d0e14] border border-zinc-800 focus:border-[#9146FF] rounded-lg pl-8 pr-4 py-2 text-xs text-white focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              className="bg-[#772ce8] hover:bg-[#6423c4] text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
            >
              Lookup
            </button>
          </div>
        </form>

        {searched && (
          <div className="mt-8 pt-6 border-t border-zinc-850">
            {matchedCreator ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-[#0d0e14] rounded-lg border border-zinc-850 gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={matchedCreator.avatar || undefined}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg object-cover bg-zinc-900 border border-zinc-800 shrink-0"
                    />
                    <div>
                      <div className="text-base font-bold text-white flex items-center gap-1.5">
                        {matchedCreator.name}
                        {matchedCreator.isVerified && <span className="text-[#a970ff]">✓</span>}
                      </div>
                      <div className="text-xs text-zinc-400 font-mono">{matchedCreator.handle}</div>
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums">
                    <div className="text-[11px] uppercase font-sans text-zinc-500">Total Creator Fees Delivered</div>
                    <div className="text-2xl font-bold text-emerald-400">
                      ${matchedCreator.creatorFeesPaid.toFixed(2)}
                    </div>
                    <div className="text-xs text-zinc-400 flex items-center justify-end gap-1 font-sans">
                      <TwitchBitsIcon className="w-3.5 h-3.5 text-[#a970ff]" />
                      <span className="font-mono">{matchedCreator.diamonds.toLocaleString()} Bits credited</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <div className="leading-relaxed">
                    <strong>Bits and Subs are delivered directly to your Twitch channel.</strong> Open your Twitch Creator Dashboard → Revenue → Payout History to withdraw cash straight to your bank account or PayPal.
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-zinc-400 text-xs">
                No active coins currently found for @{handleQuery}. Anyone can launch a coin for your Twitch channel on Robinhood Chain via Tpaid.
              </div>
            )}
          </div>
        )}
      </div>

      {/* How It Works Explainer for Streamers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-5 space-y-2">
          <div className="w-7 h-7 rounded bg-zinc-800 text-[#a970ff] flex items-center justify-center font-mono font-bold text-xs">
            1
          </div>
          <h3 className="font-bold text-white text-sm">Zero Wallet Setup</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            You don't need a Web3 wallet, seed phrases, or crypto accounts. You never touch cryptocurrency directly.
          </p>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-5 space-y-2">
          <div className="w-7 h-7 rounded bg-zinc-800 text-purple-400 flex items-center justify-center font-mono font-bold text-xs">
            2
          </div>
          <h3 className="font-bold text-white text-sm">Automated Twitch Bits</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Whenever traders buy or sell your coin on Robinhood Chain, 85% of creator rewards convert to Twitch Bits and gift subs on your stream.
          </p>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-5 space-y-2">
          <div className="w-7 h-7 rounded bg-zinc-800 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">
            3
          </div>
          <h3 className="font-bold text-white text-sm">Direct Payouts</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Withdraw your Twitch Bits & Sub revenue as real cash straight through Twitch's official monthly payout to your bank or PayPal.
          </p>
        </div>
      </div>
    </main>
  );
};
