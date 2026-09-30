import React, { useEffect, useState } from 'react';
import { CreatorProfile, TokenItem } from '../types';
import { Trophy } from 'lucide-react';
import { TwitchIcon } from './Icons';

interface LeaderboardViewProps {
  creators: CreatorProfile[];
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ creators: _creators }) => {
  const [liveCreators, setLiveCreators] = useState<CreatorProfile[]>([]);
  const [topTokens, setTopTokens] = useState<TokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadCurrentMarketCaps = async (tokens: TokenItem[]) => {
      const enriched = await Promise.all(tokens.map(async (token) => {
        if (!/^0x[a-fA-F0-9]{40}$/.test(token.id)) return token;
        try {
          const response = await fetch(`/api/pons/token-details/${token.id}`);
          if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return token;
          const data = await response.json() as { marketCap?: number };
          const marketCap = data.marketCap;
          return typeof marketCap === 'number' && Number.isFinite(marketCap) && marketCap > 0
            ? { ...token, marketCap }
            : token;
        } catch {
          return token;
        }
      }));
      return enriched.sort((a, b) => b.marketCap - a.marketCap);
    };
    const load = async () => {
      try {
        setLoadError(null);
        const response = await fetch('/api/leaderboard');
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
          const exploreResponse = await fetch('/api/explore/tokens?page=1&limit=100');
          if (!exploreResponse.ok || !(exploreResponse.headers.get('content-type') || '').includes('application/json')) {
            throw new Error('Leaderboard API is not available. Restart the application server.');
          }
          const exploreData = await exploreResponse.json() as { tokens?: TokenItem[] };
          const byStreamer = new Map<string, CreatorProfile>();
          (exploreData.tokens || []).forEach((token) => {
            const key = token.creatorHandle.toLowerCase();
            const existing = byStreamer.get(key);
            byStreamer.set(key, {
              id: existing?.id || key,
              handle: existing?.handle || token.creatorHandle,
              name: existing?.name || token.creatorName,
              avatar: existing?.avatar || token.creatorAvatar,
              tokensCount: (existing?.tokensCount || 0) + 1,
              creatorFeesPaid: existing?.creatorFeesPaid || 0,
              diamonds: existing?.diamonds || 0,
              isVerified: true,
            });
          });
          if (!cancelled) {
            setLiveCreators([...byStreamer.values()]);
            setTopTokens(await loadCurrentMarketCaps(exploreData.tokens || []));
          }
          return;
        }
        const data = await response.json() as {
          streamers?: Array<CreatorProfile & { highestMarketCap?: number; totalMarketCap?: number }>;
          tokens?: TokenItem[];
        };
        if (!cancelled) {
          setLiveCreators(data.streamers || []);
          setTopTokens(await loadCurrentMarketCaps(data.tokens || []));
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Leaderboard unavailable.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/explore`);
    socket.onmessage = () => { void load(); };
    return () => {
      cancelled = true;
      socket.close();
    };
  }, []);

  const rankedCreators = liveCreators.slice(0, 10);
  return (
    <main className="flex-1 p-4 sm:p-8 max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Trophy className="w-6 h-6 text-amber-400" />
          <span>Streamer Earnings Leaderboard</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          The top 10 Twitch streamers and highest-value coins launched through Tpaid.
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-300">
          {loadError}
        </div>
      )}

      {/* Top 3 Featured Creators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rankedCreators.slice(0, 3).map((c, i) => (
          <div
            key={c.id}
            className="bg-[#202020] rounded-xl p-5 flex flex-col justify-between transition-colors"
          >
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-3 font-mono">
                <span className="font-semibold text-zinc-300">Rank #{i + 1}</span>
                {c.isLive && (
                  <span className="text-red-500 font-bold uppercase tracking-wider text-[10px]">
                    Live on Twitch
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <img
                  src={c.avatar || undefined}
                  alt={c.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover bg-zinc-900 border border-zinc-800"
                />
                <div className="truncate">
                  <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                    <span>{c.name}</span>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono flex items-center gap-1 mt-0.5">
                    <TwitchIcon className="w-3 h-3 text-[#a970ff]" />
                    <span>{c.handle}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-850 text-xs font-mono tabular-nums">
              <div>
                <span className="text-[10px] text-zinc-500 block font-sans uppercase">Claimed Fees</span>
                <span className="text-white font-bold text-sm">
                  {c.creatorFeesPaid.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-500 block font-sans uppercase">Twitch Bits</span>
                <span className="text-[#a970ff] font-bold text-sm">
                  {c.diamonds.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full Streamer Ledger Table */}
      {isLoading && <div className="rounded-xl  bg-[#202020] p-6 text-center text-sm text-zinc-400">Loading Tpaid leaderboard...</div>}

      {!isLoading && rankedCreators.length === 0 && (
        <div className="rounded-xl  bg-[#202020] p-6 text-center text-sm text-zinc-400">
          No Tpaid streamers have launched a token yet.
        </div>
      )}

      <div className="bg-[#202020]  rounded-xl overflow-hidden border border-zinc-700">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black  border-b border-zinc-700 text-zinc-400 uppercase text-[11px] font-medium tracking-wider">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Streamer</th>
                <th className="py-3 px-4">Launched Tokens</th>
                <th className="py-3 px-4">Claimed Fees</th>
                <th className="py-3 px-4 text-right">Twitch Bits Cheered</th>
              </tr>
            </thead>
            <tbody className=" font-mono tabular-nums text-zinc-300">
              {rankedCreators.map((c, idx) => (
                <tr key={c.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="py-3 px-4 text-center text-zinc-500 font-medium">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={c.avatar || undefined}
                        alt={c.name}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded object-cover bg-zinc-900 "
                      />
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1">
                          {c.name}
                          {c.isVerified && <span className="text-[#a970ff] text-xs">✓</span>}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">{c.handle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-300 font-sans">
                    {c.tokensCount} token{c.tokensCount > 1 ? 's' : ''}
                  </td>
                  <td className="py-3 px-4 text-emerald-400 font-medium">
                    {c.creatorFeesPaid.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} ETH
                  </td>
                  <td className="py-3 px-4 text-right text-[#a970ff] font-bold">
                    {c.diamonds.toLocaleString()} Bits
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#202020]  rounded-xl overflow-hidden border border-zinc-700">
        <div className="px-4 py-4 bg-black  border-b border-zinc-700 ">
          <h2 className="text-sm font-bold text-white">Highest-value Tpaid coins</h2>
          <p className="text-xs text-zinc-500 mt-1">Ranked by current market cap from tokens launched on Tpaid.</p>
        </div>
        <div className="">
          {topTokens.map((token, index) => (
            <div key={token.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 text-center text-xs text-zinc-500">{index + 1}</span>
                <img src={token.imageUrl || undefined} alt="" className="w-8 h-8 rounded object-cover bg-zinc-900" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{token.ticker} <span className="text-zinc-400 font-normal">{token.name}</span></div>
                  <div className="text-[11px] text-zinc-500 truncate">{token.creatorHandle}</div>
                </div>
              </div>
              <div className="text-sm font-bold text-white">${token.marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })} MC</div>
            </div>
          ))}
          {!isLoading && topTokens.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">No Tpaid launches yet.</div>}
        </div>
      </div>
    </main>
  );
};
