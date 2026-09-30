import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Copy, ExternalLink, RefreshCw, Share2, UserRound, LogOut, Check,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import {
  getPonsV2TokenDetails,
  getPonsV2TokensLaunchedBy,
  type PonsV2Launch,
} from '../utils/ponsV2';

type LaunchCard = PonsV2Launch & {
  name?: string;
  symbol?: string;
  logo?: string;
  description?: string;
};

const shortAddress = (value: string) => `${value.slice(0, 10)}...${value.slice(-8)}`;

export const ProfileView: React.FC = () => {
  const { address } = useParams<{ address?: string }>();
  const { walletAddress, balance, isRobinhoodChain, disconnect } = useWallet();
  const navigate = useNavigate();
  const isOwnProfile = !address;
  const profileAddress = isOwnProfile ? walletAddress : address;
  const [launches, setLaunches] = useState<LaunchCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'positions' | 'history' | 'activity' | 'launches'>('launches');
  const [copied, setCopied] = useState(false);

  const load = async (signal?: { cancelled: boolean }) => {
    if (!profileAddress || !/^0x[a-fA-F0-9]{40}$/.test(profileAddress)) {
      setError('Connect a wallet to view your launches.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ownAddress = profileAddress.toLowerCase();
      const results = (await getPonsV2TokensLaunchedBy(profileAddress as `0x${string}`))
        .filter((launch) => launch.deployer?.toLowerCase() === ownAddress);
      const detailed: typeof results = [];
      // Avoid opening one RPC request bundle per launch at once.
      for (let index = 0; index < results.length; index += 3) {
        if (signal?.cancelled) return;
        const batch = results.slice(index, index + 3);
        const enriched = await Promise.all(batch.map(async (launch) => {
          if (!launch.token) return launch;
          let apiDetails: {
            name?: string | null;
            symbol?: string | null;
            image?: string | null;
            description?: string | null;
          } | null = null;
          try {
            const response = await fetch(`/api/pons/token-details/${launch.token}`);
            if (response.ok) apiDetails = await response.json();
          } catch {
            // Use on-chain metadata when the Pons API is unavailable.
          }
          try {
            const details = await getPonsV2TokenDetails(launch.token);
            return {
              ...launch,
              name: apiDetails?.name || details.name,
              symbol: apiDetails?.symbol || details.symbol,
              logo: apiDetails?.image || details.logo,
              description: apiDetails?.description || details.description,
            };
          } catch {
            return apiDetails ? {
              ...launch,
              name: apiDetails.name || undefined,
              symbol: apiDetails.symbol || undefined,
              logo: apiDetails.image || undefined,
              description: apiDetails.description || undefined,
            } : launch;
          }
        }));
        detailed.push(...enriched);
      }
      if (!signal?.cancelled) setLaunches(detailed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load launches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [profileAddress]);

  const nativeBalance = useMemo(() => {
    if (!balance) return '0.00 ETH';
    const number = Number.parseFloat(balance.replace(/[^\d.]/g, ''));
    return Number.isFinite(number) ? `${number.toFixed(4)} ETH` : balance;
  }, [balance]);

  const copyAddress = async () => {
    if (!profileAddress) return;
    await navigator.clipboard.writeText(profileAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const shareProfile = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: 'Ponsfamily profile', url });
    else await navigator.clipboard.writeText(url);
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#0b0b0d] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-3xl border border-zinc-800 bg-[#151517] p-5 sm:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#242428] text-zinc-300">
              <UserRound className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="break-all text-lg font-semibold text-white">{profileAddress ? shortAddress(profileAddress) : 'Wallet profile'}</h1>
              <p className="mt-1 text-xs text-zinc-500">Your Pons profile</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOwnProfile && <button type="button" onClick={copyAddress} className="rounded-full border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800">{copied ? <Check className="inline h-3 w-3 text-emerald-400" /> : <Copy className="inline h-3 w-3" />} {copied ? 'Copied' : 'Copy address'}</button>}
              {isOwnProfile && <button type="button" onClick={disconnect} className="rounded-full border border-red-500/40 px-3 py-2 text-xs text-red-300 hover:bg-red-950/30"><LogOut className="mr-1 inline h-3 w-3" />Disconnect</button>}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-zinc-700 bg-[#1d1d1f] p-5">
            <p className="text-xs text-zinc-500">Portfolio balance</p>
            <p className="mt-1 text-4xl font-light tracking-tight text-white">{nativeBalance}</p>
            <p className="mt-1 text-xs text-zinc-500">Connected Robinhood Chain wallet balance</p>
            <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
              <span>ETH balance</span><span>{isRobinhoodChain ? 'Live wallet balance' : 'Switch to Robinhood Chain'}</span>
            </div>
            <div className="relative mt-2 h-36 overflow-hidden rounded-xl bg-[#222224]">
              <div className="absolute inset-x-0 top-1/4 border-t border-dashed border-zinc-700" />
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-zinc-700" />
              <div className="absolute inset-x-0 top-3/4 border-t border-dashed border-zinc-700" />
              <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <path d="M0 105 L120 105 L240 105 L360 105 L480 105 L600 105" fill="none" stroke="#b7ed43" strokeWidth="2" />
                <circle cx="600" cy="105" r="4" fill="#b7ed43" />
              </svg>
              <div className="absolute right-2 top-2 text-[11px] text-zinc-500">{nativeBalance}</div>
              <div className="absolute bottom-2 left-2 text-[11px] text-zinc-500">Now</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-[#151517] p-5 sm:p-6">
          <nav className="flex gap-5 overflow-x-auto border-b border-zinc-800 text-xs font-medium [scrollbar-width:none]">
            {(['positions', 'history', 'activity', 'launches'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`-mb-px shrink-0 border-b-2 pb-3 capitalize ${tab === item ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{item}</button>
            ))}
          </nav>

          {tab !== 'launches' ? (
            <div className="py-14 text-center text-sm text-zinc-500">No {tab} data is available yet.</div>
          ) : (
            <div className="pt-5">
              <div className="flex items-center justify-between">
                <div><h2 className="text-lg font-semibold text-white">Launches</h2><p className="mt-1 text-xs text-zinc-500">Tokens launched by this wallet on Ponsfamily V2.</p></div>
                <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50" title="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
              </div>
              {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">{error}</div>}
              {!error && !loading && launches.length === 0 && <div className="py-12 text-center text-sm text-zinc-500">No launches found for this wallet.</div>}
              <div className="mt-4 space-y-2">
                {launches.map((launch) => (
                  <button key={launch.token} type="button" onClick={() => launch.token && navigate(`/token/${launch.token}`)} className="flex w-full items-center gap-3 rounded-2xl border border-zinc-700 bg-[#1d1d1f] p-3 text-left hover:border-zinc-500">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-zinc-800">{launch.logo ? <img src={launch.logo} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-500">$</div>}</div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-200">{launch.name || 'Pons token'}</p><p className="text-xs text-zinc-500">${launch.symbol || 'TOKEN'}</p></div>
                    <span className="rounded-full bg-zinc-800 px-3 py-1 text-[11px] text-zinc-400">Open <ExternalLink className="ml-1 inline h-3 w-3" /></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
