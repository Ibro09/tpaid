import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenItem } from '../types';
import { Search } from 'lucide-react';
import {
  getPonsV2MarketData,
  getPonsV2PlatformLaunches,
  getPonsV2TokenDetails,
  getPonsV2TokenVolume24h,
  normalizePonsAssetUrl,
} from '../utils/ponsV2';

function formatTokenAge(createdAt?: number, fallback = 'launched') {
  if (!createdAt) return fallback;
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EXPLORE_CACHE_KEY = 'tipped:explore-tokens:v1';

function readExploreCache(): TokenItem[] {
  try {
    const raw = window.localStorage.getItem(EXPLORE_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((token): token is TokenItem => (
      !!token
      && typeof token === 'object'
      && typeof token.id === 'string'
      && /^0x[a-fA-F0-9]{40}$/.test(token.id)
      && typeof token.name === 'string'
      && typeof token.ticker === 'string'
      && typeof token.marketCap === 'number'
    ));
  } catch {
    return [];
  }
}

const TokenArtwork: React.FC<{ src?: string; name: string; ticker: string }> = ({ src, name, ticker }) => {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [src]);
  const candidates = src?.includes('/ipfs/')
    ? [
        src.replace(/^https?:\/\/[^/]+\/ipfs\//, 'https://gateway.pinata.cloud/ipfs/'),
        src.replace(/^https?:\/\/[^/]+\/ipfs\//, 'https://cloudflare-ipfs.com/ipfs/'),
        src.replace(/^https?:\/\/[^/]+\/ipfs\//, 'https://ipfs.io/ipfs/'),
      ]
    : src ? [src] : [];
  if (!src || attempt >= candidates.length) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-3xl font-bold text-zinc-600">
        {ticker.replace(/^\$/, '').slice(0, 2) || name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={candidates[attempt]}
      alt={name}
      loading="lazy"
      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      onError={() => setAttempt((index) => index + 1)}
    />
  );
};

interface ExploreViewProps {
  tokens: TokenItem[];
  onTokensLoaded?: (tokens: TokenItem[]) => void;
  onSelectToken?: (token: TokenItem) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onLaunchClick?: () => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  tokens: _tokens,
  onTokensLoaded,
  onSelectToken,
  searchQuery,
  onSearchChange,
  onLaunchClick,
}) => {
  const navigate = useNavigate();
  const [activeSort, setActiveSort] = useState<'marketCap' | 'volume' | 'newest' | 'oldest'>('newest');
  const [platformTokens, setPlatformTokens] = useState<TokenItem[]>(readExploreCache);
  const [isLoading, setIsLoading] = useState(() => readExploreCache().length === 0);
  const [loadError, setLoadError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTokens, setTotalTokens] = useState(() => readExploreCache().length);
  const tokensPerPage = 50;
  const platformTokensRef = useRef(platformTokens);
  platformTokensRef.current = platformTokens;
  const refreshingVolumesRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPLORE_CACHE_KEY, JSON.stringify(platformTokens));
    } catch {
      // Cached Explore data is an offline convenience; live APIs remain authoritative.
    }
  }, [platformTokens]);

  useEffect(() => {
    onTokensLoaded?.(platformTokens);
  }, [onTokensLoaded, platformTokens]);

  useEffect(() => {
    let cancelled = false;
    if (platformTokensRef.current.length === 0) setIsLoading(true);
    setLoadError('');
    const fetchTippedTokens = async () => {
      const fetchPage = async (page: number) => {
        const response = await fetch(`/api/explore/tokens?page=${page}&limit=100`);
        const payload = await response.json() as { tokens?: TokenItem[]; total?: number; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Explore database unavailable.');
        return payload;
      };
      try {
        const firstPage = await fetchPage(1);
        const tippedTotal = firstPage.total || 0;
        const totalPages = Math.ceil(tippedTotal / 100);
        const additionalPages = await Promise.all(
          Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchPage(index + 2)),
        );
        const tippedTokens = [
          ...(firstPage.tokens || []),
          ...additionalPages.flatMap((payload) => payload.tokens || []),
        ].map((token) => ({ ...token, source: 'tipped' as const }));
        let ponsTokens: TokenItem[] = [];
        const cachedPonsTokens = readExploreCache().filter((token) => token.source === 'pons');

        if (tippedTotal < 50) {
          try {
            const launches = await getPonsV2PlatformLaunches(100);
            const uniqueLaunches = new Map<string, (typeof launches)[number]>();
            launches.forEach((launch) => {
              if (launch.token) uniqueLaunches.set(launch.token.toLowerCase(), launch);
            });
            const tippedIds = new Set(tippedTokens.map((token) => token.id.toLowerCase()));
            const fallbackLaunches = [...uniqueLaunches.values()]
              .filter((launch) => launch.token && !tippedIds.has(launch.token.toLowerCase()))
              .slice(0, 100);
            ponsTokens = fallbackLaunches.flatMap((launch, index) => {
              if (!launch.token) return [];
              const deployer = launch.deployer || '';
              const shortDeployer = deployer ? `${deployer.slice(0, 6)}...${deployer.slice(-4)}` : 'Pons creator';
              return [{
                id: launch.token,
                rank: 0,
                name: 'Pons token',
                ticker: '$TOKEN',
                creatorHandle: shortDeployer,
                creatorName: shortDeployer,
                creatorAddress: deployer.toLowerCase() || undefined,
                creatorAvatar: '',
                imageUrl: '',
                marketCap: 0,
                volume24h: 0,
                priceChange24h: 0,
                age: 'Pons Family',
                description: '',
                totalFeesPaid: 0,
                createdAt: launch.createdAt || Date.now() - index,
                source: 'pons' as const,
              } satisfies TokenItem];
            });
            const ponsById = new Map<string, TokenItem>();
            [...cachedPonsTokens, ...ponsTokens].forEach((token) => ponsById.set(token.id.toLowerCase(), token));
            ponsTokens = [...ponsById.values()].slice(0, 100);
          } catch (error) {
            ponsTokens = cachedPonsTokens;
            if (tippedTokens.length === 0 && cachedPonsTokens.length === 0) throw error;
            setLoadError(`Pons Family tokens are temporarily unavailable: ${error instanceof Error ? error.message : 'launch index request failed.'}`);
          }
        }
        if (cancelled) return;
        const combined = new Map<string, TokenItem>();
        [...ponsTokens, ...tippedTokens].forEach((token) => combined.set(token.id.toLowerCase(), token));
        const items = [...combined.values()];
        setPlatformTokens(items);
        setTotalTokens(items.length);
        if (items.length === 0) setLoadError('No tokens are available to explore yet.');
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Explore tokens could not be loaded.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchTippedTokens();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/explore`);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; token?: TokenItem };
        if (message.type !== 'token:update' || !message.token) return;
        const existingToken = platformTokensRef.current.some(
          (token) => token.id.toLowerCase() === message.token!.id.toLowerCase(),
        );
        if (!existingToken) setTotalTokens((total) => total + 1);
        setPlatformTokens((current) => {
          const next = new Map(current.map((token) => [token.id.toLowerCase(), token]));
          next.set(message.token!.id.toLowerCase(), message.token!);
          return [...next.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        });
      } catch {
        // Ignore malformed socket messages and keep the last known snapshot.
      }
    };
    return () => socket.close();
  }, []);

  const tokenIdsKey = platformTokens.map((token) => token.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const hydrateMetadata = async () => {
      const missing = platformTokensRef.current.filter((token) => (
        /^0x[a-fA-F0-9]{40}$/.test(token.id)
        && (!token.imageUrl || !token.name || token.name === 'Pons token' || token.ticker === '$TOKEN' || token.marketCap <= 0)
      ));
      for (let index = 0; index < missing.length; index += 6) {
        const batch = missing.slice(index, index + 6);
        const updates = await Promise.all(batch.map(async (token) => {
          const apiResult = await fetch(`/api/pons/token-details/${token.id}`, { cache: 'no-store' })
            .then(async (response) => {
              if (!response.ok) return null;
              const body: unknown = await response.json();
              return body && typeof body === 'object' && !Array.isArray(body)
                ? body as Record<string, unknown>
                : null;
            })
            .catch(() => null);
          const apiName = typeof apiResult?.name === 'string' ? apiResult.name.trim() : '';
          const apiSymbol = typeof apiResult?.symbol === 'string' ? apiResult.symbol.trim() : '';
          const apiImage = typeof apiResult?.image === 'string' ? apiResult.image.trim() : '';
          const directMarketCap = Number(apiResult?.marketCap);
          const fullyDilutedValuation = Number(apiResult?.fdv);
          const apiMarketCap = Number.isFinite(directMarketCap) && directMarketCap > 0
            ? directMarketCap
            : fullyDilutedValuation;
          if (Number.isFinite(apiMarketCap) && apiMarketCap > 0) {
            setPlatformTokens((items) => items.map((item) => (
              item.id.toLowerCase() === token.id.toLowerCase()
                ? { ...item, marketCap: apiMarketCap }
                : item
            )));
          }
          const needsChainData = !apiImage || !apiName || !apiSymbol
            || !Number.isFinite(apiMarketCap) || apiMarketCap <= 0;
          const detailsResult = needsChainData
            ? await getPonsV2TokenDetails(token.id as `0x${string}`).then((value) => value, () => null)
            : null;
          let marketCap = apiMarketCap;
          if ((!Number.isFinite(marketCap) || marketCap <= 0) && detailsResult) {
            const priceUsd = Number(apiResult?.priceUsd ?? apiResult?.price);
            const supply = Number(detailsResult.totalSupply) / 10 ** detailsResult.decimals;
            if (Number.isFinite(priceUsd) && priceUsd > 0 && Number.isFinite(supply) && supply > 0) {
              marketCap = priceUsd * supply;
            }
          }
          if ((!Number.isFinite(marketCap) || marketCap <= 0) && apiResult) {
            const priceUsd = Number(apiResult.priceUsd ?? apiResult.price);
            const reportedSupply = Number(apiResult.totalSupply);
            const reportedDecimals = Number(apiResult.tokenDecimals);
            const decimals = Number.isInteger(reportedDecimals) && reportedDecimals >= 0 && reportedDecimals <= 36
              ? reportedDecimals
              : 18;
            const supply = reportedSupply / 10 ** decimals;
            if (Number.isFinite(priceUsd) && priceUsd > 0 && Number.isFinite(supply) && supply > 0) {
              marketCap = priceUsd * supply;
            }
          }
          if ((!Number.isFinite(marketCap) || marketCap <= 0) && detailsResult) {
            const market = await getPonsV2MarketData(
              detailsResult.curve,
              detailsResult.decimals,
              detailsResult.totalSupply,
              detailsResult.graduation?.[0] ?? 0n,
              detailsResult.launch.sweptQuote ?? 0n,
              detailsResult.launch.pairToken.toLowerCase() === '0x0000000000000000000000000000000000000000',
            ).catch(() => null);
            if (market && Number.isFinite(market.marketCapUsd) && market.marketCapUsd > 0) {
              marketCap = market.marketCapUsd;
            }
          }
          const creator = detailsResult?.deployer || token.creatorAddress || '';
          const image = apiImage
            ? apiImage
            : detailsResult?.logo || '';
          return {
            id: token.id.toLowerCase(),
            name: apiName || detailsResult?.name,
            ticker: apiSymbol
              ? (apiSymbol.startsWith('$') ? apiSymbol : `$${apiSymbol}`)
              : detailsResult?.symbol ? `$${detailsResult.symbol}` : undefined,
            marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : undefined,
            progressPercent: detailsResult?.launch.graduationThreshold && detailsResult.graduation?.[0]
              ? Math.max(0, Math.min(100, Number(detailsResult.graduation[0]) / Number(detailsResult.launch.graduationThreshold) * 100))
              : undefined,
            creatorAddress: creator.toLowerCase() || undefined,
            creatorFeeRecipient: detailsResult?.launch.creatorFeeRecipient.toLowerCase(),
            creatorHandle: creator ? `${creator.slice(0, 6)}...${creator.slice(-4)}` : undefined,
            creatorName: creator ? `${creator.slice(0, 6)}...${creator.slice(-4)}` : undefined,
            imageUrl: image ? normalizePonsAssetUrl(image) : undefined,
            description: typeof apiResult?.description === 'string' && apiResult.description
              ? apiResult.description
              : detailsResult?.description,
          };
        }));
        if (cancelled) return;
        const updatesById = new Map(updates.map((entry) => [entry.id, entry]));
        setPlatformTokens((items) => items.map((token) => {
          const update = updatesById.get(token.id.toLowerCase());
          if (!update) return token;
          return {
            ...token,
            ...(update.marketCap === undefined ? {} : { marketCap: update.marketCap }),
            ...(update.progressPercent === undefined ? {} : { progressPercent: update.progressPercent }),
            ...(update.name ? { name: update.name } : {}),
            ...(update.ticker ? { ticker: update.ticker } : {}),
            ...(update.creatorAddress ? { creatorAddress: update.creatorAddress } : {}),
            ...(update.creatorHandle ? { creatorHandle: update.creatorHandle } : {}),
            ...(update.creatorName ? { creatorName: update.creatorName } : {}),
            ...(update.imageUrl ? { imageUrl: update.imageUrl, creatorAvatar: update.imageUrl } : {}),
            ...(update.description ? { description: update.description } : {}),
          };
        }));
      }
    };
    void hydrateMetadata();
    const interval = window.setInterval(() => void hydrateMetadata(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tokenIdsKey]);

  useEffect(() => {
    let cancelled = false;
    const refreshVolumes = async () => {
      if (refreshingVolumesRef.current) return;
      const current = platformTokensRef.current.filter((token) => /^0x[a-fA-F0-9]{40}$/.test(token.id));
      if (current.length === 0) return;
      refreshingVolumesRef.current = true;
      try {
        for (let index = 0; index < current.length; index += 6) {
          const batch = current.slice(index, index + 6);
          const updates = await Promise.all(batch.map(async (token) => {
            const result = await getPonsV2TokenVolume24h(token.id as `0x${string}`)
              .then((volume) => volume, () => null);
            return result ? {
              id: token.id.toLowerCase(),
              volume: result.volume,
              symbol: result.quoteSymbol,
            } : null;
          }));
          if (cancelled) return;
          const volumeById = new Map(updates.flatMap((entry) => entry ? [[entry.id, entry] as const] : []));
          setPlatformTokens((items) => items.map((token) => {
            const volume = volumeById.get(token.id.toLowerCase());
            return volume ? {
              ...token,
              volume24h: Number(volume.volume) || 0,
              volume24hQuote: volume.volume,
              volume24hSymbol: volume.symbol,
            } : token;
          }));
        }
      } finally {
        refreshingVolumesRef.current = false;
      }
    };
    void refreshVolumes();
    const interval = window.setInterval(() => void refreshVolumes(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tokenIdsKey]);

  const handleTokenClick = (token: TokenItem) => {
    if (onSelectToken) onSelectToken(token);
    navigate(`/token/${token.id}`);
  };

  const sourceTokens = useMemo(() => {
    return platformTokens;
  }, [platformTokens]);

  const filteredTokens = useMemo(() => {
    let list = [...sourceTokens];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.ticker.toLowerCase().includes(q) ||
          t.creatorHandle.toLowerCase().includes(q) ||
          t.creatorName.toLowerCase().includes(q)
      );
    }

    if (activeSort === 'marketCap') {
      list.sort((a, b) => b.marketCap - a.marketCap);
    } else if (activeSort === 'volume') {
      list.sort((a, b) => b.volume24h - a.volume24h);
    } else if (activeSort === 'newest') {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }

    return list;
  }, [sourceTokens, searchQuery, activeSort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeSort]);

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / tokensPerPage));
  const pageTokens = filteredTokens.slice((currentPage - 1) * tokensPerPage, currentPage * tokensPerPage);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);
  const formatMarketCap = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '—';
    return value >= 1_000_000
      ? `$${(value / 1_000_000).toFixed(2)}m`
      : value >= 1_000
        ? `$${(value / 1_000).toFixed(1)}k`
        : `$${value.toFixed(0)}`;
  };
  const shortAddress = (address?: string) => address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : 'Unknown';

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-7 py-6 space-y-6 max-w-7xl mx-auto w-full" data-purpose="explore-page-content">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            Explore
            <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[10px] font-semibold text-zinc-300">
              {totalTokens.toLocaleString()} launched
            </span>
          </h1>
          <p className="mt-1 text-xs text-zinc-400">Tokens still climbing toward graduation on Robinhood Chain.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-0.5 overflow-x-auto rounded-full border border-zinc-700 bg-zinc-900 p-1 text-[10px] font-semibold">
            {([
              ['volume', 'Top volume'],
              ['newest', 'Newest'],
              ['oldest', 'Oldest'],
              ['marketCap', 'Top market cap'],
            ] as const).map(([sort, label]) => (
              <button
                key={sort}
                type="button"
                onClick={() => setActiveSort(sort)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                  activeSort === sort ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative block sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search tokens"
              className="w-full rounded-full border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
          </label>
        </div>
      </header>

      {isLoading && (
        <div className="rounded-2xl border border-[#21242C] bg-[#121317] p-8 text-center text-sm text-neutral-400">
          Loading tokens launched on Robinhood Chain...
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-2xl border border-[#21242C] bg-[#121317] p-8 text-center text-sm text-neutral-400">
          {loadError}
        </div>
      )}

      {/* Token Grid */}
      {pageTokens.length > 0 && <section className="grid grid-cols-2 gap-2.5 pb-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" data-purpose="token-card-grid">
        {pageTokens.map((token, index) => {
          const displayRank = (currentPage - 1) * tokensPerPage + index + 1;
          const progress = token.progressPercent;

          return (
            <article
              key={token.id}
              onClick={() => handleTokenClick(token)}
              className="group cursor-pointer rounded-2xl border border-zinc-800 bg-[#202020] p-2 transition-colors hover:border-zinc-600"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-[#0d0d0d]">
                <TokenArtwork src={token.imageUrl} name={token.name} ticker={token.ticker} />
                <div className="absolute left-1.5 top-1.5 flex gap-1">
                  <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">V2</span>
                  {token.source === 'tipped' && (
                    <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">TPAID</span>
                  )}
                </div>
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-300">
                  #{displayRank}
                </span>
              </div>
              <div className="px-0.5 pb-1 pt-2">
                <div className="truncate text-xs font-semibold text-white">{token.name}</div>
                <div className="truncate text-[10px] text-zinc-400">{token.ticker}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xs font-bold text-zinc-100">{formatMarketCap(token.marketCap)}</span>
                  <span className="text-[9px] text-zinc-500">MC</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-lime-400"
                      style={{ width: `${progress === undefined ? 0 : Math.max(0, Math.min(progress, 100))}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-[9px] tabular-nums text-zinc-400">
                    {progress === undefined ? '—' : `${progress.toFixed(2)}%`}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1 text-[9px] text-zinc-500">
                  <span className="truncate font-mono">{shortAddress(token.id)}</span>
                  <span className="shrink-0 font-semibold text-lime-400">{formatTokenAge(token.createdAt, token.age)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </section>}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 pb-8" aria-label="Token pages">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
            className="rounded-lg border border-[#21242C] bg-[#121317] px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-[#9146FF] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-400">
            Page {currentPage} of {totalPages} · Showing {pageTokens.length} of {filteredTokens.length}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            className="rounded-lg border border-[#21242C] bg-[#121317] px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-[#9146FF] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}

      {/* No results prompt */}
      {!isLoading && filteredTokens.length === 0 && (
        <div className="p-12 text-center bg-[#121317] border border-[#21242C] rounded-2xl">
          <p className="text-zinc-400 text-sm">{loadError || `No tokens matched "${searchQuery}".`}</p>
          <button
            onClick={() => onSearchChange('')}
            className="mt-3 text-xs text-[#bf94ff] hover:underline cursor-pointer"
          >
            Clear search filter
          </button>
        </div>
      )}
    </main>
  );
};
