import React, { useEffect, useState } from "react";
import { TokenItem } from "../types";
import { X, ExternalLink, Check, Gift, Copy, UserRound } from "lucide-react";
import { TwitchIcon } from "./Icons";
import confetti from "canvas-confetti";
import { useWallet } from "../context/WalletContext";
import { getPonsV2TokenDetails, tradePonsV2 } from "../utils/ponsV2";
import { useNavigate } from "react-router-dom";

interface TokenDetailModalProps {
  token: TokenItem | null;
  onClose: () => void;
  onTipSuccess?: (token: TokenItem, amount: number) => void;
}

export const TokenDetailModal: React.FC<TokenDetailModalProps> = ({
  token,
  onClose,
  onTipSuccess,
}) => {
  const [tradeAmount, setTradeAmount] = useState("0.1");
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [isTrading, setIsTrading] = useState(false);
  const [tradeDone, setTradeDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [ponsDetails, setPonsDetails] = useState<Awaited<
    ReturnType<typeof getPonsV2TokenDetails>
  > | null>(null);
  const { walletAddress, isRobinhoodChain } = useWallet();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || !/^0x[a-fA-F0-9]{40}$/.test(token.id)) return;
    getPonsV2TokenDetails(token.id as `0x${string}`)
      .then(setPonsDetails)
      .catch(() => setPonsDetails(null));
  }, [token]);

  if (!token) return null;

  const ethPrice = 2850; // Robinhood Chain uses ETH
  const ethValue = parseFloat(tradeAmount) || 0;
  const usdValue = ethValue * ethPrice;
  const estimatedTokens = (usdValue / (token.marketCap / 1000000)).toFixed(0);
  const feeUSD = usdValue * 0.01;
  const streamerRewardUSD = feeUSD * 0.85;
  const burnedUSD = feeUSD * 0.15;

  const handleExecuteTrade = async () => {
    if (!ponsDetails || !walletAddress || !isRobinhoodChain) {
      setTradeError("Connect the trading wallet on Robinhood Chain first.");
      return;
    }
    setIsTrading(true);
    try {
      setTradeError(null);
      await tradePonsV2({
        token: token.id as `0x${string}`,
        curve: ponsDetails.launch.curve,
        account: walletAddress as `0x${string}`,
        type: tradeType,
        amount: tradeAmount,
        decimals: ponsDetails.decimals,
      });
      setIsTrading(false);
      setTradeDone(true);
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#772ce8", "#00C805", "#ffffff"],
      });
    } catch (reason) {
      setIsTrading(false);
      setTradeError(reason instanceof Error ? reason.message : "Trade failed.");
      return;
    }

    if (onTipSuccess) {
      onTipSuccess(token, streamerRewardUSD);
    }

    window.setTimeout(() => {
      setTradeDone(false);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#10121a] border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative my-auto space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Token Header Banner */}
        <div className="flex items-center gap-4">
          {token.imageUrl ? (
            <img
              src={token.imageUrl}
              alt={token.name}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-lg object-cover bg-zinc-900 border border-zinc-800 shrink-0"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xl text-zinc-500">
              $
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {token.ticker}
              </h2>
              <span className="text-sm font-medium text-zinc-400">
                {token.name}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1 text-zinc-300">
                <TwitchIcon className="w-3 h-3 text-[#a970ff]" />
                {token.creatorHandle}
              </span>
              <span>·</span>
              <span className="font-mono text-zinc-500">{token.age}</span>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 bg-[#0d0e14] p-3 rounded-lg border border-zinc-850 text-center font-mono tabular-nums">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase font-sans">
              Market Cap
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              ${(token.marketCap / 1000).toFixed(1)}K
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase font-sans">
              24h Volume
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              ${token.volume24h.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase font-sans">
              24h Change
            </div>
            <div
              className={`text-sm font-bold mt-0.5 ${
                token.priceChange24h >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {token.priceChange24h >= 0
                ? `+${token.priceChange24h}%`
                : `${token.priceChange24h}%`}
            </div>
          </div>
        </div>

        {/* Description */}
        {token.description && (
          <p className="text-xs text-zinc-400 leading-relaxed bg-[#0d0e14] p-3 rounded-lg border border-zinc-850">
            {token.description}
          </p>
        )}
        {/^0x[a-fA-F0-9]{40}$/.test(token.id) && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#9146FF]/30 bg-[#181328] p-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#bf94ff]">
                Contract address
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-white">
                {token.id}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(token.id);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }}
              className="shrink-0 p-1.5 text-zinc-300 hover:text-white"
              title="Copy contract address"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
        {ponsDetails && (
          <button
            type="button"
            onClick={() => navigate(`/profile/${ponsDetails.launch.deployer}`)}
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0e14] p-3 text-left hover:border-zinc-600"
          >
            <UserRound className="h-4 w-4 text-[#bf94ff]" />
            <span className="text-xs text-zinc-400">Creator wallet</span>
            <span className="ml-auto font-mono text-[11px] text-white">
              {ponsDetails.launch.deployer.slice(0, 8)}...
              {ponsDetails.launch.deployer.slice(-6)}
            </span>
          </button>
        )}

        {/* Interactive Simulated Trade Box */}
        <div className="bg-[#0d0e14] border border-zinc-850 rounded-lg p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Simulate Robinhood Swap & Tip
            </span>
            <div className="flex gap-1 bg-zinc-900 p-0.5 rounded-lg text-xs font-medium">
              <button
                onClick={() => setTradeType("buy")}
                className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                  tradeType === "buy"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                  tradeType === "sell"
                    ? "bg-zinc-800 text-white font-semibold"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Sell
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>
                Amount ({tradeType === "buy" ? "ETH" : token.ticker} on
                Robinhood Chain)
              </span>
              <span className="font-mono tabular-nums">
                {tradeType === "buy"
                  ? `≈ $${usdValue.toFixed(2)} USD`
                  : "quoted on-chain"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.05"
                min="0.01"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                className="flex-1 bg-[#12141c] border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#9146FF]"
              />
              <div className="flex gap-1">
                {["0.05", "0.1", "0.5"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTradeAmount(v)}
                    className="px-2 py-1 text-xs font-mono bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 cursor-pointer"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fee routing breakdown */}
          {tradeError && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">
              {tradeError}
            </div>
          )}
          <div className="p-3 bg-[#111218] rounded-lg border border-zinc-850 text-xs space-y-1 font-mono tabular-nums">
            <div className="flex justify-between text-zinc-400">
              <span className="font-sans">Estimated receive:</span>
              <span className="text-white font-semibold">
                {estimatedTokens} {token.ticker}
              </span>
            </div>
            <div className="flex justify-between text-[#a970ff]">
              <span className="font-sans">
                Twitch Bits to {token.creatorHandle} (85%):
              </span>
              <span className="font-semibold">
                +${streamerRewardUSD.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between text-rose-400">
              <span className="font-sans">$TPAID buyback & burn (15%):</span>
              <span className="font-semibold">${burnedUSD.toFixed(3)}</span>
            </div>
          </div>

          <button
            onClick={handleExecuteTrade}
            disabled={isTrading}
            className="w-full py-2.5 rounded-lg bg-[#772ce8] hover:bg-[#6423c4] text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {isTrading ? (
              <span className="animate-pulse">
                Broadcasting Trade on Robinhood Chain...
              </span>
            ) : tradeDone ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Success! Twitch Bits Dispatched</span>
              </>
            ) : (
              <>
                <Gift className="w-4 h-4" />
                <span>
                  Execute {tradeType === "buy" ? "Buy" : "Sell"} & Route Creator
                  Fee
                </span>
              </>
            )}
          </button>
        </div>

        {/* Explorer Links */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-850 text-xs text-zinc-400">
          <a
            href="https://ponsfamily.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            ponsfamily Terminal <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="https://robinhoodchain.blockscout.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            Robinhood Explorer <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
