import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenItem, CreatorProfile, PaymentReceipt } from '../types';
import { TwitchIcon } from './Icons';
import { ArrowRight, ChevronLeft, ChevronRight, Compass, Sparkles, Activity } from 'lucide-react';

interface HomeViewProps {
  tokens: TokenItem[];
  receipts: PaymentReceipt[];
  tokensLoading?: boolean;
  tokensError?: string | null;
  onNavigate?: (tab: 'explore' | 'launch' | 'docs' | 'leaderboard') => void;
  onSelectToken?: (token: TokenItem) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  tokens,
  receipts,
  tokensLoading = false,
  tokensError,
  onNavigate,
  onSelectToken,
}) => {
  const navigate = useNavigate();

  const handleNav = (tab: 'explore' | 'launch' | 'docs' | 'leaderboard') => {
    if (onNavigate) onNavigate(tab);
    navigate(`/${tab}`);
  };

  const handleSelectToken = (token: TokenItem) => {
    if (onSelectToken) onSelectToken(token);
    navigate(`/token/${token.id}`);
  };
  // Rotating live ticker in hero
  const [currentReceiptIndex, setCurrentReceiptIndex] = useState(0);

  useEffect(() => {
    if (receipts.length < 2) return;
    const timer = setInterval(() => {
      setCurrentReceiptIndex((prev) => (prev + 1) % receipts.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [receipts.length]);

  const activeTickerReceipt = receipts[currentReceiptIndex] || receipts[0];

  const realExploreTokens = tokens
    .filter((token) => /^0x[a-fA-F0-9]{40}$/.test(token.id))
    .slice()
    .sort((left, right) => {
      const marketCapDifference = right.marketCap - left.marketCap;
      return marketCapDifference || (right.createdAt || 0) - (left.createdAt || 0);
    });
  const creatorsByKey = new Map<string, CreatorProfile>();
  realExploreTokens.forEach((token) => {
    const key = (token.creatorAddress || token.creatorHandle || token.id).toLowerCase();
    const existing = creatorsByKey.get(key);
    creatorsByKey.set(key, {
      id: key,
      handle: token.creatorHandle || 'Unknown creator',
      name: token.creatorName || token.creatorHandle || 'Token creator',
      avatar: token.creatorAvatar || '',
      tokensCount: (existing?.tokensCount || 0) + 1,
      creatorFeesPaid: 0,
      diamonds: 0,
      isVerified: false,
    });
  });
  const realCreators = [...creatorsByKey.values()];

  // Top Tokens pagination (4 per page)
  const [tokenPage, setTokenPage] = useState(1);
  const tokensPerPage = 4;
  const totalTokenPages = Math.ceil(realExploreTokens.length / tokensPerPage);
  const currentTokens = realExploreTokens.slice((tokenPage - 1) * tokensPerPage, tokenPage * tokensPerPage);
  useEffect(() => {
    setTokenPage((page) => Math.min(page, Math.max(1, totalTokenPages)));
  }, [totalTokenPages]);

  // Top Profiles pagination (2 per page)
  const [profilePage, setProfilePage] = useState(1);
  const profilesPerPage = 2;
  const totalProfilePages = Math.ceil(realCreators.length / profilesPerPage);
  const currentProfiles = realCreators.slice((profilePage - 1) * profilesPerPage, profilePage * profilesPerPage);
  useEffect(() => {
    setProfilePage((page) => Math.min(page, Math.max(1, totalProfilePages)));
  }, [totalProfilePages]);

  return (
    <main className="home-live-hero flex-1 flex flex-col items-center justify-start pt-10 pb-28 sm:pt-12 sm:pb-16 px-4 max-w-6xl mx-auto w-full" data-purpose="hero-section">
      {/* Top Dynamic Fee Pill */}
     

      <h1 className="home-heading mt-8 mb-4 max-w-3xl select-none text-center text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-white sm:mt-10 sm:text-6xl md:text-7xl">
        Tokens with<br className="sm:hidden" /> <span className="home-heading-accent">real on-chain</span> fees.
      </h1>

      <p className="home-intro mb-6 max-w-xl text-center text-sm font-normal leading-6 text-zinc-400 sm:text-base">
        Explore tokens launched on Pons V2, follow live market data, and see creator fees straight from Robinhood Chain.
      </p>

      <button
        type="button"
        onClick={() => handleNav('docs')}
        className="home-chain-badge mb-8 inline-flex items-center gap-2 rounded-full border border-[#30283a] bg-[#131116] px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-[#a78bfa]/50 hover:text-zinc-200"
      >
        <Activity className="h-3.5 w-3.5 text-[#c4b5fd]" />
        <span>On-chain data <span className="text-zinc-600">·</span> Robinhood Chain</span>
        <ArrowRight className="h-3 w-3 text-zinc-600" />
      </button>

      {/* Action Buttons */}
      <div className="home-actions mb-12 flex items-center gap-3 sm:mb-14">
        <button
          onClick={() => handleNav('launch')}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-[#ff2d55] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(255,45,85,0.16)] transition-all hover:scale-[1.02] hover:bg-[#ff456a] active:scale-95 sm:px-6"
        >
          <Sparkles className="hidden sm:block w-4 h-4" />
          <span>Launch a token</span>
        </button>
        <button
          onClick={() => handleNav('docs')}
          className="cursor-pointer rounded-full border border-zinc-800 bg-[#101010] px-5 py-2.5 text-sm font-medium text-zinc-300 transition-all hover:border-[#a78bfa]/50 hover:text-white sm:px-6"
        >
          How it works
        </button>
      </div>

      {/* Hero Showcase Cards */}
      <div className="hero-preview-cards w-full max-w-5xl flex md:grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 px-[-2px] md:px-2 overflow-x-auto md:overflow-visible snap-x snap-mandatory [scrollbar-width:none]" data-purpose="hero-preview-cards">
        {/* Card 1: Explore Carousel Card */}
        <div
          onClick={() => handleNav('explore')}
          className="home-panel relative min-w-[calc(100%-24px)] flex-shrink-0 snap-center overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0d0d0f] p-4 transition-all hover:border-[#a78bfa]/40 md:min-w-0 group cursor-pointer"
        >
          <div className="home-explore-preview relative h-48 overflow-hidden rounded-xl">
            {currentTokens.length > 0 ? (
              <div className={`home-explore-track ${currentTokens.length > 1 ? 'home-explore-track-moving' : ''}`}>
                {[0, 1].map((copy) => (
                  <div className="home-explore-group" key={copy} aria-hidden={copy === 1}>
                    {currentTokens.map((token) => (
                      <div
                        key={`${copy}-${token.id}`}
                        className="home-explore-token-card"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectToken(token);
                        }}
                      >
                        <div className="home-explore-token-art">
                          {token.imageUrl ? (
                            <img src={token.imageUrl} alt="" loading="lazy" />
                          ) : (
                            <span>{token.ticker.replace(/^\$/, '').slice(0, 2) || '$'}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{token.name}</p>
                          <p className="truncate text-[10px] text-zinc-400">
                            {token.ticker} · {token.marketCap > 0 ? `$${token.marketCap.toLocaleString()} MC` : 'Market data loading'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Compass className="h-7 w-7 text-zinc-500" />
                <p className="text-xs font-semibold text-zinc-200">
                  {tokensLoading ? 'Loading real launches…' : tokensError ? 'Explore is unavailable' : 'No launched tokens yet'}
                </p>
                <p className="max-w-[220px] text-[10px] text-zinc-500">
                  {tokensLoading ? 'Fetching tokens from Explore.' : tokensError || 'Tokens launched through Explore will appear here.'}
                </p>
              </div>
            )}
          </div>

          {/* Bottom Card Footer (Explore) */}
          <div className="relative z-10 -mx-4 -mb-4 mt-3 flex items-center justify-between border-t border-zinc-800/60 bg-[#0d0d12]/80 px-4 py-3 pt-3 backdrop-blur-sm">
            <span className="text-sm font-semibold tracking-wide text-white">Explore tokens</span>
            <span className="text-sm text-zinc-400 group-hover:text-white flex items-center gap-1 transition-colors">
              Open <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>

        {/* Card 2: Payments Live Table Card */}
        <div
          onClick={() => navigate('/leaderboard')}
          className="home-panel relative min-w-[calc(100%-24px)] flex-shrink-0 snap-center rounded-2xl border border-zinc-800/80 bg-[#0d0d0f] p-4 transition-all hover:border-[#a78bfa]/40 md:min-w-0 group cursor-pointer"
        >
          <div className="home-fee-flow relative flex h-48 flex-col justify-center gap-3 overflow-hidden rounded-xl border border-[#332b3e] bg-[radial-gradient(ellipse_at_top,rgba(167,139,250,0.09),transparent_58%),#0b0b0d] p-4">
            <div className="absolute inset-x-8 top-1/2 hidden -translate-y-1/2 sm:block">
              <div className="home-fee-flow-line" />
              <span className="home-fee-flow-pulse" />
            </div>
            {[
              { title: 'Pons V2 trade', detail: 'Fee event recorded', tone: 'text-[#c4b5fd]' },
              { title: 'Fee escrow', detail: 'Balance becomes claimable', tone: 'text-[#c4b5fd]' },
              { title: 'Fee wallet', detail: 'Recipient claims on-chain', tone: 'text-[#c4b5fd]' },
            ].map((step, index) => (
              <div className={`home-fee-flow-step home-fee-flow-step-${index + 1}`} key={step.title}>
                <span className={`home-fee-flow-dot ${step.tone}`}>{index + 1}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{step.title}</p>
                  <p className="text-[10px] text-zinc-500">{step.detail}</p>
                </div>
                <span className={`ml-auto text-[9px] font-medium ${step.tone}`}>
                  {index === 0 ? 'recorded' : index === 1 ? 'escrowed' : 'claim'}
                </span>
              </div>
            ))}
            <p className="relative z-10 mt-1 text-center text-[9px] text-zinc-500">Fee flow preview · no sample payout values</p>
          </div>

          {/* Bottom Card Footer (Payments) */}
          <div className="flex items-center justify-between pt-3 border-t border-[#1c1c27] -mx-4 -mb-4 px-4 py-3 bg-[#0d0d12]/90 rounded-b-2xl">
            <span className="text-sm font-semibold text-white tracking-wide">Fee flow</span>
            <span className="text-sm text-[#c4b5fd] group-hover:underline flex items-center gap-1">
              View leaderboard <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>
      </div>

      {/* Secondary 3 Cards Bar (Analytics / Launch / Docs) */}
      <div className="home-quick-links w-full max-w-5xl mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 px-2">
        <div
          onClick={() => handleNav('leaderboard')}
          className="home-quick-link bg-[#0e0e0f] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between hover:border-[#a78bfa]/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-semibold text-white">Analytics</span>
          <span className="text-sm text-zinc-400 group-hover:text-white transition-colors flex items-center gap-1">
            Open <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </span>
        </div>

        <div
          onClick={() => handleNav('launch')}
          className="home-quick-link bg-[#0e0e0f] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between hover:border-[#a78bfa]/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-semibold text-white">Launch</span>
          <span className="text-sm text-zinc-400 group-hover:text-white transition-colors flex items-center gap-1">
            Open <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </span>
        </div>

        <div
          onClick={() => handleNav('docs')}
          className="home-quick-link bg-[#0e0e0f] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between hover:border-[#a78bfa]/40 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-semibold text-white">Docs</span>
          <span className="text-sm text-zinc-400 group-hover:text-white transition-colors flex items-center gap-1">
            Open <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </span>
        </div>
      </div>

      {/* Top Tokens & Top Streamers Section */}
      <div className="home-content-section w-full max-w-5xl mt-14 px-2" data-purpose="tokens-and-profiles-section">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Top Tokens (lg:col-span-8) */}
          <div className="lg:col-span-8 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">Top tokens</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#342c40] bg-[#17141b] px-2 py-0.5 text-[10px] font-medium text-[#c4b5fd]">
                  <span className="h-1 w-1 rounded-full bg-[#c4b5fd]"></span> Pons V2
                </span>
              </div>
              {/* Pagination controls */}
              <div className="flex items-center gap-1.5 text-zinc-500 text-sm">
                <button
                  onClick={() => setTokenPage((p) => Math.max(1, p - 1))}
                  disabled={tokenPage <= 1}
                  className="hover:text-zinc-300 disabled:opacity-30 px-1 py-0.5 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-sm text-zinc-400">
                  {tokenPage} / {totalTokenPages || 1}
                </span>
                <button
                  onClick={() => setTokenPage((p) => Math.min(totalTokenPages, p + 1))}
                  disabled={tokenPage >= totalTokenPages}
                  className="hover:text-zinc-300 disabled:opacity-30 px-1 py-0.5 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Token Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {currentTokens.map((token) => (
                <div
                  key={token.id}
                  onClick={() => handleSelectToken(token)}
                  className="home-token-card bg-[#0e0e0f] border border-zinc-800/80 hover:border-[#a78bfa]/40 transition-all rounded-xl p-2.5 flex flex-col justify-between group cursor-pointer"
                >
                  <div className="relative w-full aspect-square rounded-xl bg-zinc-900 overflow-hidden mb-2.5 flex items-center justify-center">
                    {token.imageUrl ? (
                      <img
                        src={token.imageUrl}
                        alt={token.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl text-zinc-500">$</div>
                    )}
                    <span className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-md text-sm font-mono text-zinc-300 px-1.5 py-0.5 rounded-md border border-white/10">
                      {token.age}
                    </span>
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded-full text-sm text-zinc-200 border border-white/10 max-w-full">
                        <span className="truncate">{token.creatorHandle}</span>
                        <TwitchIcon className="w-2.5 h-2.5 text-[#c4b5fd] shrink-0" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white truncate">{token.name}</div>
                    <div className="flex items-center justify-between text-sm mt-0.5 font-mono">
                      <span className="text-zinc-400">
                        {token.marketCap > 0 ? `$${(token.marketCap / 1000).toFixed(1)}K` : '—'} <span className="text-sm text-zinc-500 font-sans">MC</span>
                      </span>
                      <span
                        className={`text-sm font-semibold ${
                          token.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-500'
                        }`}
                      >
                        {token.priceChange24h === 0
                          ? '—'
                          : token.priceChange24h > 0
                            ? `+${token.priceChange24h}%`
                            : `${token.priceChange24h}%`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {!tokensLoading && currentTokens.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-zinc-800 bg-[#0e0e13] px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-zinc-300">{tokensError ? 'Explore tokens are unavailable' : 'No real token launches yet'}</p>
                  <p className="mt-1 text-xs text-zinc-500">{tokensError || 'Launched tokens from Explore will appear here.'}</p>
                  <button type="button" onClick={() => handleNav('explore')} className="mt-3 text-xs font-semibold text-[#c4b5fd] hover:text-white">
                    Open Explore
                  </button>
                </div>
              )}
              {tokensLoading && currentTokens.length === 0 && (
                <div className="col-span-full rounded-2xl border border-zinc-800 bg-[#0e0e13] px-4 py-8 text-center text-xs text-zinc-500">
                  Loading real Explore launches…
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Top Twitch Streamers (lg:col-span-4) */}
          <div className="lg:col-span-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                Token creators
              </h2>
              <div className="flex items-center gap-1.5 text-zinc-500 text-sm">
                <button
                  onClick={() => setProfilePage((p) => Math.max(1, p - 1))}
                  disabled={profilePage <= 1}
                  className="hover:text-zinc-300 disabled:opacity-30 px-1 py-0.5 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-sm text-zinc-400">
                  {profilePage} / {totalProfilePages || 1}
                </span>
                <button
                  onClick={() => setProfilePage((p) => Math.min(totalProfilePages, p + 1))}
                  disabled={profilePage >= totalProfilePages}
                  className="hover:text-zinc-300 disabled:opacity-30 px-1 py-0.5 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Profiles Cards Grid */}
            <div className="grid grid-cols-2 gap-3 h-full">
              {currentProfiles.map((profile) => (
                <div
                  key={profile.id}
                  onClick={() => handleNav('leaderboard')}
                  className="home-creator-card bg-[#0e0e0f] border border-zinc-800/80 hover:border-[#a78bfa]/40 transition-all rounded-xl p-3 flex flex-col justify-between cursor-pointer group"
                >
                  <div className="flex flex-col items-center text-center pt-2">
                    <div className="relative">
                      {profile.avatar ? (
                        <div className="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden mb-2.5 border border-zinc-700 group-hover:scale-105 transition-transform">
                          <img src={profile.avatar || undefined} alt={profile.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-[#17141b] border border-[#342c40] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                          <TwitchIcon className="w-7 h-7 text-[#c4b5fd]" />
                        </div>
                      )}
                      {profile.isLive && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black px-1.5 rounded-full uppercase tracking-wider">
                          LIVE
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white truncate max-w-full">{profile.name}</div>
                    <div className="text-sm text-[#c4b5fd] truncate max-w-full font-mono">{profile.handle}</div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[#1a1a24] pt-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">Tokens launched</span>
                    <span className="font-mono text-sm font-bold text-white">{profile.tokensCount}</span>
                  </div>
                </div>
              ))}
              {!tokensLoading && currentProfiles.length === 0 && (
                <div className="col-span-2 flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-zinc-800 px-4 text-center text-xs text-zinc-500">
                  Token creators will appear after the first real launch.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Receipts & Most Paid Section */}
      <div className="home-content-section w-full max-w-5xl mt-10 px-2" data-purpose="receipts-and-most-paid-section">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Panel 1: Recent Receipts */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-base font-bold text-white tracking-tight">Recent verified payouts</h2>
              <button
                onClick={() => navigate('/leaderboard')}
                className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                View all →
              </button>
            </div>
            <div className="home-list-panel bg-[#0e0e0f] border border-zinc-800/80 rounded-xl p-4 divide-y divide-zinc-800/70">
              {receipts.slice(0, 5).map((rec, i) => (
                <div
                  key={rec.id}
                  className={`flex items-center justify-between py-2.5 ${i === 0 ? 'pt-0' : ''} ${
                    i === 4 ? 'pb-0' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700 flex items-center justify-center">
                      {rec.recipientAvatar ? (
                        <img src={rec.recipientAvatar || undefined} alt={rec.recipientName} className="w-full h-full object-cover" />
                      ) : (
                        <TwitchIcon className="w-4 h-4 text-[#c4b5fd]" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-white">{rec.recipientName}</span>
                        {rec.isVerified && <span className="text-[#c4b5fd] text-sm font-bold">✓</span>}
                      </div>
                      <div className="text-sm text-zinc-400">
                        {rec.giftType} · ${rec.lifetimeAmount.toFixed(2)} lifetime
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white flex items-center justify-end gap-1 font-mono">
                      <span className="text-sm">💎</span> ${rec.amount.toFixed(2)}
                    </div>
                    <div className="text-sm text-zinc-500 font-mono">{rec.timeAgo}</div>
                  </div>
                </div>
              ))}
              {receipts.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-xs font-medium text-zinc-300">No verified payouts recorded yet</p>
                  <p className="mt-1 text-[10px] text-zinc-500">This feed only shows confirmed payout records.</p>
                </div>
              )}
            </div>
          </div>

          {/* Panel 2: Most launched */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-base font-bold text-white tracking-tight">Most launched creators</h2>
              <button
                onClick={() => handleNav('leaderboard')}
                className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                View all →
              </button>
            </div>
            <div className="home-list-panel bg-[#0e0e0f] border border-zinc-800/80 rounded-xl p-4 divide-y divide-zinc-800/70">
              {realCreators.slice(0, 5).map((cr, idx) => (
                <div
                  key={cr.id}
                  className={`flex items-center justify-between py-2.5 ${idx === 0 ? 'pt-0' : ''} ${
                    idx === 4 ? 'pb-0' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-zinc-500 w-3 text-center">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700 flex items-center justify-center">
                      {cr.avatar ? (
                        <img src={cr.avatar || undefined} alt={cr.name} className="w-full h-full object-cover" />
                      ) : (
                        <TwitchIcon className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{cr.handle}</div>
                      <div className="text-xs text-zinc-400">
                        {cr.tokensCount} token{cr.tokensCount > 1 ? 's' : ''} launched
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-semibold text-zinc-200">{cr.tokensCount}</span>
                </div>
              ))}
              {realCreators.length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-500">No real token creators to rank yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
