import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatUnits } from 'viem';
import { TokenItem } from '../types';
import { ArrowLeft, ExternalLink, Check, Copy, ArrowUpRight, CircleDollarSign, Wallet } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getPonsV2CreatorFeeBalancesForAssets, getPonsV2FeeAssetMetadata, getPonsV2MarketData, getPonsV2TokenDetails, getPonsV2TradingBalances, normalizePonsAssetUrl, resolvePonsV2TokenAddress } from '../utils/ponsV2';
import { claimPonsV2CreatorFeesForAssets, tradePonsV2 } from '../utils/ponsV2';
import { getCreatorFeeClaimTotals, NATIVE_FEE_ASSET, recordCreatorFeeClaim } from '../utils/creatorFees';
import { useWallet } from '../context/WalletContext';

interface TokenDetailViewProps {
  tokens: TokenItem[];
}

type PonsApiTokenData = {
  image?: string | null;
  description?: string | null;
  price?: number | null;
  priceEth?: number | null;
  marketCap?: number | null;
  volume1hEth: number;
  volume24hEth: number;
  volume1hUsd?: number;
  volume24hUsd?: number;
  pool?: string | null;
  pairedToken?: string | null;
  graduated?: boolean | null;
  creator?: string | null;
  socials?: Record<string, string | null>;
};

export const TokenDetailView: React.FC<TokenDetailViewProps> = ({ tokens }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { walletAddress, isRobinhoodChain } = useWallet();

  const matchingToken = tokens.find(
    (t) => t.id.toLowerCase() === id?.toLowerCase() || t.ticker.toLowerCase() === id?.toLowerCase()
  );
  const token = /^0x[a-fA-F0-9]{40}$/.test(id || '') ? matchingToken : matchingToken || tokens[0];

  const [tradeAmount, setTradeAmount] = useState('0.1');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [isTrading, setIsTrading] = useState(false);
  const [tradeDone, setTradeDone] = useState(false);
  const [ponsDetails, setPonsDetails] = useState<Awaited<ReturnType<typeof getPonsV2TokenDetails>> | null>(null);
  const [marketData, setMarketData] = useState<Awaited<ReturnType<typeof getPonsV2MarketData>> | null>(null);
  const [ponsApiData, setPonsApiData] = useState<PonsApiTokenData | null>(null);
  const [resolvedTokenAddress, setResolvedTokenAddress] = useState<string | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [creatorFeeBalance, setCreatorFeeBalance] = useState<bigint | null>(null);
  const [claimedFeeBalance, setClaimedFeeBalance] = useState<bigint | null>(null);
  const [feeAssetMetadata, setFeeAssetMetadata] = useState<Record<string, { symbol: string; decimals: number }>>({});
  const [feeHistoryError, setFeeHistoryError] = useState<string | null>(null);
  const [claimingCreatorFees, setClaimingCreatorFees] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [nativeTradingBalance, setNativeTradingBalance] = useState<bigint | null>(null);
  const [tokenTradingBalance, setTokenTradingBalance] = useState<bigint | null>(null);
  const [tradingBalanceError, setTradingBalanceError] = useState<string | null>(null);

  const refreshTradingBalances = useCallback(async () => {
    if (!walletAddress || !resolvedTokenAddress || !ponsDetails || !isRobinhoodChain) return;
    try {
      const balances = await getPonsV2TradingBalances(
        walletAddress as `0x${string}`,
        resolvedTokenAddress as `0x${string}`,
        ponsDetails.decimals,
      );
      setNativeTradingBalance(balances.native);
      setTokenTradingBalance(balances.token);
      setTradingBalanceError(null);
    } catch {
      setTradingBalanceError('Unable to refresh wallet balances. Check the connected wallet and network.');
    }
  }, [walletAddress, resolvedTokenAddress, ponsDetails, isRobinhoodChain]);

  useEffect(() => {
    if (!id || !/^0x[a-fA-F0-9]{40}$/.test(id)) return;
    let cancelled = false;
    setResolvingAddress(true);
    setPonsDetails(null);
    setMarketData(null);
    setPonsApiData(null);
    setCreatorFeeBalance(null);
    setClaimedFeeBalance(null);
    setFeeHistoryError(null);
    setClaimMessage(null);
    setResolvedTokenAddress(null);
    const load = async () => {
      try {
        const isKnownLaunch = token?.id.toLowerCase() === id.toLowerCase();
        const resolved = isKnownLaunch
          ? id as `0x${string}`
          : await resolvePonsV2TokenAddress(id as `0x${string}`);
        if (cancelled) return;
        if (!resolved) {
          setResolvedTokenAddress(null);
          return;
        }
        // Keep the resolved address even if one metadata read is unavailable.
        setResolvedTokenAddress(resolved);
        const details = await getPonsV2TokenDetails(resolved);
        if (cancelled) return;
        setPonsDetails(details);

        void getPonsV2MarketData(
            details.launch.curve,
            details.decimals,
            details.totalSupply,
            details.graduation?.[0] ?? 0n,
            details.launch.sweptQuote,
            details.launch.pairToken.toLowerCase() === NATIVE_FEE_ASSET,
          ).then((market) => {
            if (!cancelled) setMarketData(market);
          }).catch(() => {
            if (!cancelled) setMarketData(null);
          });

      } catch {
        if (!cancelled) {
          setResolvedTokenAddress(null);
          setPonsDetails(null);
        }
      } finally {
        if (!cancelled) setResolvingAddress(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [id, token?.id, walletAddress]);

  useEffect(() => {
    if (!resolvedTokenAddress || !ponsDetails) {
      setCreatorFeeBalance(null);
      setClaimedFeeBalance(null);
      return;
    }
    let cancelled = false;
    const recipient = ponsDetails.launch.creatorFeeRecipient;
    const asset = ponsDetails.launch.pairToken.toLowerCase() as `0x${string}`;
    const refreshFeeBalances = async () => {
      const [balancesResult, claimedResult] = await Promise.allSettled([
        getPonsV2CreatorFeeBalancesForAssets(recipient, [asset]),
        getCreatorFeeClaimTotals(recipient),
      ]);
      if (cancelled) return;

      if (balancesResult.status === 'fulfilled') {
        const balances = balancesResult.value;
        const balance = asset === NATIVE_FEE_ASSET
          ? balances.nativeBalance
          : balances.tokenBalances.find((entry) => entry.asset.toLowerCase() === asset)?.balance ?? 0n;
        setCreatorFeeBalance(balance);
        setFeeHistoryError(null);
      } else {
        setFeeHistoryError('Unable to load the live claimable balance from Pons escrow.');
      }

      if (claimedResult.status === 'fulfilled') {
        setClaimedFeeBalance(claimedResult.value[asset] ?? 0n);
      } else {
        setFeeHistoryError((current) => current || 'Unable to load verified claim history.');
      }
    };
    void refreshFeeBalances();
    const interval = window.setInterval(() => void refreshFeeBalances(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [resolvedTokenAddress, ponsDetails]);

  useEffect(() => {
    if (!resolvedTokenAddress) return;
    let cancelled = false;
    const refreshTokenMarket = () => {
      void fetch(`/api/pons/token-details/${resolvedTokenAddress}`)
        .then(async (response) => {
          if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return;
          const data = await response.json() as PonsApiTokenData;
          if (!cancelled) setPonsApiData(data);
        })
        .catch(() => {});
    };
    refreshTokenMarket();
    const interval = window.setInterval(() => void refreshTokenMarket(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [resolvedTokenAddress]);

  const feeTokenAssets = ponsDetails && resolvedTokenAddress
    ? [ponsDetails.launch.pairToken.toLowerCase()]
    : [];
  useEffect(() => {
    let cancelled = false;
    const assets = new Set(feeTokenAssets);
    assets.delete(NATIVE_FEE_ASSET);
    void Promise.all([...assets].map(async (asset) => {
      try {
        const metadata = await getPonsV2FeeAssetMetadata(asset as `0x${string}`);
        return [asset, metadata] as const;
      } catch {
        return [asset, { symbol: shortAddress(asset), decimals: 0 }] as const;
      }
    })).then((entries) => {
      if (!cancelled) setFeeAssetMetadata(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [feeTokenAssets.join(',')]);

  useEffect(() => {
    if (!walletAddress || !resolvedTokenAddress || !ponsDetails || !isRobinhoodChain) {
      setNativeTradingBalance(null);
      setTokenTradingBalance(null);
      setTradingBalanceError(null);
      return;
    }
    void refreshTradingBalances();
  }, [refreshTradingBalances]);

  const displayToken: TokenItem | undefined = ponsDetails && id ? {
    rank: token?.rank ?? 0,
    id: resolvedTokenAddress || id,
    name: ponsDetails.name,
    ticker: `$${ponsDetails.symbol}`,
    imageUrl: normalizePonsAssetUrl(ponsApiData?.image || ponsDetails.logo || token?.imageUrl || ''),
    creatorAvatar: ponsDetails.logo || token?.creatorAvatar || '',
    creatorName: 'Pons V2 creator',
    creatorAddress: ponsDetails.launch.deployer,
    creatorFeeRecipient: ponsDetails.launch.creatorFeeRecipient,
    creatorHandle: `@${ponsDetails.launch.deployer.slice(0, 6)}...${ponsDetails.launch.deployer.slice(-4)}`,
    marketCap: token?.marketCap ?? 0,
    volume24h: token?.volume24h ?? 0,
    priceChange24h: token?.priceChange24h ?? 0,
    age: 'On-chain',
    totalFeesPaid: token?.totalFeesPaid ?? 0,
    description: ponsApiData?.description || ponsDetails.description || token?.description || '',
  } : resolvedTokenAddress ? {
    rank: 0,
    id: resolvedTokenAddress,
    name: token?.name || 'Pons V2 token',
    ticker: token?.ticker || '$TOKEN',
    imageUrl: token?.imageUrl || '',
    creatorAvatar: token?.creatorAvatar || '',
    creatorName: token?.creatorName || 'Pons V2 creator',
    creatorHandle: token?.creatorHandle || 'On-chain',
    marketCap: token?.marketCap ?? 0,
    volume24h: token?.volume24h ?? 0,
    priceChange24h: token?.priceChange24h ?? 0,
    age: 'On-chain',
    totalFeesPaid: token?.totalFeesPaid ?? 0,
    description: token?.description || '',
  } : token;

  if (!displayToken && /^0x[a-fA-F0-9]{40}$/.test(id || '') && resolvingAddress) {
    return <div className="flex-1 flex items-center justify-center p-8 text-sm text-zinc-400">Loading Pons V2 token...</div>;
  }

  if (!displayToken) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Token Not Found</h2>
        <button
          onClick={() => navigate('/explore')}
          className="text-xs text-[#bf94ff] hover:underline cursor-pointer"
        >
          ← Return to Explore
        </button>
      </div>
    );
  }

  const ethPrice = 2850; // Robinhood Chain uses ETH
  const ethValue = parseFloat(tradeAmount) || 0;
  const usdValue = ethValue * ethPrice;
  const estimatedTokens = displayToken.marketCap > 0
    ? (usdValue / (displayToken.marketCap / 1000000)).toFixed(0)
    : '—';
  const shortAddress = (address?: string) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unavailable';
  const isFeeRecipient = Boolean(
    walletAddress &&
    ponsDetails &&
    walletAddress.toLowerCase() === ponsDetails.launch.creatorFeeRecipient.toLowerCase(),
  );
  const feeAssetRows = ponsDetails && feeTokenAssets.length > 0
    ? [{
        asset: feeTokenAssets[0],
        claimed: claimedFeeBalance,
        remaining: creatorFeeBalance,
        symbol: feeTokenAssets[0] === NATIVE_FEE_ASSET
          ? 'ETH'
          : feeAssetMetadata[feeTokenAssets[0]]?.symbol || shortAddress(feeTokenAssets[0]),
        decimals: feeTokenAssets[0] === NATIVE_FEE_ASSET
          ? 18
          : feeAssetMetadata[feeTokenAssets[0]]?.decimals ?? 0,
      }]
    : [];
  const hasClaimableCreatorFees = Boolean(
    (creatorFeeBalance ?? 0n) > 0n,
  );

  const handleClaimCreatorFees = async () => {
    if (!walletAddress || !isFeeRecipient) return;
    setClaimingCreatorFees(true);
    setClaimMessage(null);
    try {
      const currentBalances = await getPonsV2CreatorFeeBalancesForAssets(
        walletAddress as `0x${string}`,
        feeTokenAssets as `0x${string}`[],
      );
      const claimAmounts = [
        ...(currentBalances.nativeBalance > 0n
          ? [{ asset: NATIVE_FEE_ASSET, amountRaw: currentBalances.nativeBalance }]
          : []),
        ...currentBalances.tokenBalances
          .filter((entry) => entry.balance > 0n)
          .map((entry) => ({ asset: entry.asset, amountRaw: entry.balance })),
      ];
      const hashes = await claimPonsV2CreatorFeesForAssets(
        walletAddress as `0x${string}`,
        feeTokenAssets as `0x${string}`[],
      );
      let feeRefreshWarning: string | null = null;
      try {
        const balances = await getPonsV2CreatorFeeBalancesForAssets(
          walletAddress as `0x${string}`,
          feeTokenAssets as `0x${string}`[],
        );
        const asset = feeTokenAssets[0];
        const liveBalance = asset === NATIVE_FEE_ASSET
          ? balances.nativeBalance
          : balances.tokenBalances.find((entry) => entry.asset.toLowerCase() === asset)?.balance ?? 0n;
        setCreatorFeeBalance(liveBalance);
      } catch {
        feeRefreshWarning = 'The transaction succeeded, but live fee totals could not be refreshed yet.';
        setFeeHistoryError(feeRefreshWarning);
      }
      const claimStatus = `Claim submitted: ${hashes.map((hash) => `${hash.slice(0, 10)}...${hash.slice(-8)}`).join(', ')}`;
      try {
        const sheetsWarning = await recordCreatorFeeClaim(
          walletAddress,
          claimAmounts,
          hashes,
          resolvedTokenAddress || undefined,
        );
        try {
          const claimedTotals = await getCreatorFeeClaimTotals(walletAddress);
          setClaimedFeeBalance(claimedTotals[feeTokenAssets[0]] ?? 0n);
        } catch {
          setFeeHistoryError((current) => current || 'The claim succeeded, but verified claim history could not be refreshed yet.');
        }
        setClaimMessage([
          claimStatus,
          feeRefreshWarning,
          sheetsWarning ? `Claim sync warning: ${sheetsWarning}` : null,
        ].filter(Boolean).join(' '));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unable to sync the claim record.';
        setClaimMessage(`Claim succeeded on-chain, but Tpaid could not sync its claim record: ${reason}`);
      }
      await refreshTradingBalances();
    } catch (reason) {
      setClaimMessage(reason instanceof Error ? reason.message : 'Creator fee claim failed.');
    } finally {
      setClaimingCreatorFees(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!ponsDetails || !walletAddress || !isRobinhoodChain) {
      setTradeError('Connect the trading wallet on Robinhood Chain first.');
      return;
    }
    setIsTrading(true);
    try {
      setTradeError(null);
      const result = await tradePonsV2({
        token: resolvedTokenAddress as `0x${string}`,
        curve: ponsDetails.launch.curve,
        account: walletAddress as `0x${string}`,
        type: tradeType,
        amount: tradeAmount,
        decimals: ponsDetails.decimals,
      });
      await refreshTradingBalances();
      setIsTrading(false);
      setTradeDone(true);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#9146FF', '#00f2fe', '#ffffff', '#bf94ff'],
      });
    } catch (reason) {
      setIsTrading(false);
      setTradeError(reason instanceof Error ? reason.message : 'Trade failed.');
      return;
    }

    window.setTimeout(() => {
      setTradeDone(false);
    }, 2500);
  };

  const setTradePercentage = (percentage: number) => {
    if (tradeType === 'buy') {
      if (nativeTradingBalance === null) return;
      const gasReserve = percentage === 100 ? 500_000_000_000_000n : 0n;
      const spendable = nativeTradingBalance > gasReserve ? nativeTradingBalance - gasReserve : 0n;
      const amount = spendable * BigInt(percentage) / 100n;
      setTradeAmount((Number(amount) / 1e18).toFixed(6));
      return;
    }
    if (tokenTradingBalance === null || !ponsDetails) return;
    const amount = tokenTradingBalance * BigInt(percentage) / 100n;
    setTradeAmount(Number(amount) / 10 ** ponsDetails.decimals > 0
      ? (Number(amount) / 10 ** ponsDetails.decimals).toFixed(6)
      : '0');
  };

  const handleTradeAmountChange = (value: string) => {
    if (value === '') {
      setTradeAmount('');
      return;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) setTradeAmount(value);
  };

  const supply = ponsDetails ? Number(ponsDetails.totalSupply) / 10 ** ponsDetails.decimals : 0;
  const graduationThreshold = ponsDetails?.graduation?.[1] ?? ponsDetails?.launch.graduationThreshold ?? 0n;
  const pairedPrincipal = ponsDetails?.graduation?.[0] ?? 0n;
  const graduationPercent = graduationThreshold > 0n
    ? Math.min(100, Number((pairedPrincipal * 10000n) / graduationThreshold) / 100)
    : 0;
  const quoteSymbol = ponsDetails?.launch.pairToken === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'QUOTE';

  const tokenPrice = ponsApiData?.price ?? marketData?.priceUsd;
  const apiPriceEth = ponsApiData?.priceEth;
  const curvePriceEth = ponsDetails?.launch.pairToken.toLowerCase() === NATIVE_FEE_ASSET
    ? marketData?.priceEth
    : null;
  const tokenPriceEth = apiPriceEth && apiPriceEth > 0 ? apiPriceEth : curvePriceEth;
  const priceMarketSource = apiPriceEth && apiPriceEth > 0
    ? 'Pons Family market'
    : curvePriceEth && curvePriceEth > 0
      ? 'Pons V2 ETH curve'
      : 'ETH quote unavailable';
  const marketCap = ponsApiData?.marketCap ?? marketData?.marketCapUsd;
  const tokenAddress = resolvedTokenAddress || id || '';
  const inputBalance = tradeType === 'buy'
    ? nativeTradingBalance === null ? null : `${(Number(nativeTradingBalance) / 1e18).toFixed(6)} ETH`
    : tokenTradingBalance === null || !ponsDetails ? null : `${(Number(tokenTradingBalance) / 10 ** ponsDetails.decimals).toFixed(6)} ${displayToken.ticker}`;

  return (
    <main className="mx-auto flex-1 w-full max-w-6xl space-y-5 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8" data-purpose="token-page">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <section className="flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-[#111] sm:h-20 sm:w-20">
            {displayToken.imageUrl ? (
              <img src={displayToken.imageUrl} alt={displayToken.name} onError={(event) => { event.currentTarget.style.display = 'none'; }} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-2xl text-zinc-600">$</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{displayToken.name}</h1>
              <span className="font-mono text-sm text-zinc-500">{displayToken.ticker}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <a href={`https://robinhoodchain.blockscout.com/address/${ponsDetails?.launch.deployer || tokenAddress}`} target="_blank" rel="noreferrer" className="transition-colors hover:text-zinc-200">
                Creator {shortAddress(ponsDetails?.launch.deployer || displayToken.creatorAddress)}
                <ArrowUpRight className="ml-1 inline h-3 w-3" />
              </a>
              <span>·</span>
              <span>{displayToken.age}</span>
              <span className="rounded-md border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">Pons V2</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-400">Paired with {quoteSymbol}</span>
          <a href={`https://robinhoodchain.blockscout.com/address/${tokenAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white">
            Explorer <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      <section className="grid grid-cols-2 divide-x divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-[#101010] sm:grid-cols-4 sm:divide-y-0" aria-label="Token market data">
        <div className="p-4">
          <div className="text-xs text-zinc-500">Price</div>
          <div className="mt-1 font-mono text-sm font-medium text-white">{tokenPrice == null ? '—' : `$${tokenPrice.toPrecision(6)}`}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-zinc-500">Market cap</div>
          <div className="mt-1 font-mono text-sm font-medium text-white">{marketCap == null ? '—' : `$${marketCap.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-zinc-500">Price in ETH</div>
          <div className="mt-1 font-mono text-sm font-medium text-white">{tokenPriceEth && tokenPriceEth > 0 ? `${tokenPriceEth.toPrecision(8)} ETH` : '—'}</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-zinc-500">ETH price market</div>
          <div className="mt-1">
            {priceMarketSource === 'ETH quote unavailable' ? (
              <span className="text-sm font-medium text-zinc-500">{priceMarketSource}</span>
            ) : (
              <a
                href={priceMarketSource === 'Pons Family market'
                  ? `https://www.ponsfamily.com/launchpad/${tokenAddress}`
                  : `https://robinhoodchain.blockscout.com/address/${ponsDetails?.launch.curve || tokenAddress}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-zinc-200 transition-colors hover:text-[#c4b5fd]"
              >
                {priceMarketSource}
                <ExternalLink className="h-3 w-3 text-zinc-500" />
              </a>
            )}
          </div>
          <div className="mt-1 text-[10px] text-zinc-600">
            {priceMarketSource === 'Pons Family market'
              ? 'Live token price feed'
              : priceMarketSource === 'Pons V2 ETH curve'
                ? 'Simulated against the on-chain curve'
                : 'No ETH-denominated quote available'}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <section className="rounded-2xl border border-zinc-800 bg-[#101010] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Trade {displayToken.ticker}</h2>
              <p className="mt-1 text-xs text-zinc-500">Swap on Robinhood Chain</p>
            </div>
            <div className="flex rounded-lg border border-zinc-800 p-1">
              {(['buy', 'sell'] as const).map((type) => (
                <button key={type} type="button" onClick={() => { setTradeType(type); setTradeAmount('0'); }} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${tradeType === type ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <label htmlFor="token-trade-amount">{tradeType === 'buy' ? 'You pay' : 'You sell'}</label>
              <span>Balance: {inputBalance ?? '—'}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input id="token-trade-amount" type="number" min="0" step="0.000001" value={tradeAmount} onChange={(event) => handleTradeAmountChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-2xl text-white outline-none placeholder:text-zinc-700" />
              <span className="shrink-0 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300">{tradeType === 'buy' ? quoteSymbol : displayToken.ticker}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-600">{tradeType === 'buy' ? `≈ $${usdValue.toFixed(2)}` : `Available to sell: ${inputBalance ?? '—'}`}</div>
          </div>

          <div className="mt-3 flex gap-2">
            {[25, 50, 75, 100].map((percentage) => (
              <button key={percentage} type="button" onClick={() => setTradePercentage(percentage)} disabled={(tradeType === 'buy' ? nativeTradingBalance : tokenTradingBalance) === null} className="flex-1 rounded-lg border border-zinc-800 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-40">
                {percentage === 100 ? 'Max' : `${percentage}%`}
              </button>
            ))}
          </div>

          <div className="my-4 flex items-center justify-between border-t border-zinc-800 pt-4 text-xs">
            <span className="text-zinc-500">Estimated receive</span>
            <span className="font-medium text-zinc-300">Quoted on-chain when submitted</span>
          </div>
          {tradingBalanceError && <div className="mb-3 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">{tradingBalanceError}</div>}
          {tradeError && <div className="mb-3 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">{tradeError}</div>}
          <button onClick={handleExecuteTrade} disabled={isTrading || tradeDone} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tradeDone ? 'bg-emerald-500 text-black' : 'bg-[#ff2d55] text-white hover:bg-[#e5264b]'}`}>
            {tradeDone ? <><Check className="h-4 w-4" /> Trade confirmed</> : isTrading ? 'Confirming on Robinhood Chain…' : `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${displayToken.ticker}`}
          </button>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-zinc-800 bg-[#101010] p-5">
            <h2 className="text-sm font-semibold text-white">Token details</h2>
            {displayToken.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{displayToken.description}</p>}
            <dl className="mt-4 divide-y divide-zinc-800 border-y border-zinc-800 text-xs">
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-zinc-500">Creator tax</dt>
                <dd className="text-zinc-200">{ponsDetails ? `${Number(ponsDetails.launch.creatorTaxBps) / 100}%` : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-zinc-500">Total supply</dt>
                <dd className="font-mono text-zinc-200">{supply ? supply.toLocaleString() : '—'} {displayToken.ticker.replace('$', '')}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="text-zinc-500">Fee recipient</dt>
                <dd className="font-mono text-zinc-200">{shortAddress(ponsDetails?.launch.creatorFeeRecipient)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#0b0b0b] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Contract</div>
                <div className="mt-1 truncate font-mono text-xs text-zinc-300">{tokenAddress}</div>
              </div>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(tokenAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }} className="rounded-md p-2 text-zinc-500 transition-colors hover:text-white" title="Copy contract address">
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-4 flex gap-4 text-xs text-zinc-500">
              <a href={`https://www.ponsfamily.com/launchpad/${tokenAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-white">View token on Pons <ExternalLink className="h-3 w-3" /></a>
              <a href={`https://robinhoodchain.blockscout.com/address/${tokenAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-white">Blockscout <ExternalLink className="h-3 w-3" /></a>
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-[#101010] p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-zinc-300" />
            <h2 className="text-base font-semibold text-white">Creator fees</h2>
          </div>
          <span className="text-xs text-zinc-600">Escrow balance refreshes every minute</span>
        </div>

        {feeAssetRows.length > 0 ? feeAssetRows.map((entry) => (
          <div key={entry.asset} className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-300">{entry.symbol} · fee wallet totals</span>
              {entry.asset !== NATIVE_FEE_ASSET && <span className="font-mono text-zinc-600">{shortAddress(entry.asset)}</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: 'Claimable now', amount: entry.remaining, description: 'Available in Pons escrow' },
                { label: 'Already claimed', amount: entry.claimed, description: 'Verified claims for this fee wallet and asset' },
              ].map((metric) => (
                <div key={metric.label} className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
                  <div className="text-xs text-zinc-500">{metric.label}</div>
                  <div className="mt-2 break-all font-mono text-lg font-medium text-white">
                    {metric.amount === null ? 'Loading…' : formatUnits(metric.amount, entry.decimals)}
                    <span className="ml-1.5 text-xs text-zinc-500">{entry.symbol}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">{metric.description}</div>
                </div>
              ))}
            </div>
          </div>
        )) : (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-[#0b0b0b] px-4 py-5 text-sm text-zinc-500">
            {feeHistoryError || (creatorFeeBalance === null ? 'Loading live fee history…' : 'No fee history available for this token yet.')}
          </div>
        )}

        {feeHistoryError && feeAssetRows.length > 0 && <div className="mt-3 text-xs text-red-300">{feeHistoryError}</div>}
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
            <div>
              <div className="text-xs font-medium text-zinc-300">Fee wallet <span className="font-mono text-zinc-500">{shortAddress(ponsDetails?.launch.creatorFeeRecipient)}</span></div>
              <div className="mt-1 text-xs text-zinc-600">
                {hasClaimableCreatorFees
                  ? isFeeRecipient ? 'Claim sends the available balance to this wallet.' : 'Connect this wallet to claim the available escrow balance.'
                  : feeHistoryError || (creatorFeeBalance === null ? 'Checking escrow…' : 'Nothing to claim yet')}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => void handleClaimCreatorFees()} disabled={!isFeeRecipient || claimingCreatorFees || !hasClaimableCreatorFees} className="shrink-0 rounded-lg bg-[#ff2d55] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#e5264b] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">
            {claimingCreatorFees ? 'Claiming…' : isFeeRecipient ? 'Claim fees' : 'Fee wallet required'}
          </button>
        </div>
        {claimMessage && <div className="mt-3 break-words rounded-lg border border-zinc-800 bg-[#0b0b0b] p-3 text-xs text-zinc-400">{claimMessage}</div>}
      </section>
    </main>
  );
};
