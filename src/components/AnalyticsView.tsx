import React from "react";
import { TokenItem } from "../types";
import { TrendingUp, DollarSign, Flame, Users } from "lucide-react";
import { TwitchIcon } from "./Icons";

interface AnalyticsViewProps {
  tokens: TokenItem[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tokens }) => {
  const totalVolume = tokens.reduce((acc, t) => acc + t.volume24h, 0);
  const totalMarketCap = tokens.reduce((acc, t) => acc + t.marketCap, 0);
  const totalBurned = 1845.2;
  const burnedTokensCount = 428900;

  return (
    <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          Ecosystem Analytics & Burns
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Real-time telemetry on fee routing, streamer distributions, and $TPAID
          buyback & burn mechanics on Robinhood Chain.
        </p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              24h Volume
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono tabular-nums">
            $
            {totalVolume.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-xs text-emerald-400 mt-1 font-mono font-medium">
            +14.2%{" "}
            <span className="text-zinc-500 font-sans font-normal">
              vs previous day
            </span>
          </div>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              Aggregated Market Cap
            </span>
            <DollarSign className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono tabular-nums">
            ${(totalMarketCap / 1000).toFixed(1)}K
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            Across 200 deployed creator coins
          </div>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              $TPAID Burned
            </span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2 font-mono tabular-nums">
            ${totalBurned.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-400 mt-1 font-mono">
            {burnedTokensCount.toLocaleString()} $TPAID permanently burned
          </div>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">
              Beneficiary Channels
            </span>
            <Users className="w-4 h-4 text-[#a970ff]" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono tabular-nums">
            148
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            Receiving Twitch Bits without wallet setup
          </div>
        </div>
      </div>

      {/* Fee Split & Twitch Rewards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white tracking-tight">
            On-Chain Fee Routing Protocol
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Creator-fee activity for tokens launched through Tpaid is read from
            Pons V2 events and escrow balances on Robinhood Chain:
          </p>

          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs font-semibold text-white mb-1.5 font-mono">
                <span className="text-zinc-200 font-sans">
                  85% Streamer Revenue (Bits & Subs)
                </span>
                <span>85.0%</span>
              </div>
              <div className="w-full h-2 rounded bg-zinc-800 overflow-hidden">
                <div className="w-[85%] h-full bg-[#772ce8] rounded" />
              </div>
              <p className="text-xs text-zinc-400 mt-1.5">
                Automatically converted into live on-screen Twitch Bits cheers
                and community gift subscriptions.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-white mb-1.5 font-mono">
                <span className="text-zinc-200 font-sans">
                  15% $TPAID Buyback & Burn
                </span>
                <span>15.0%</span>
              </div>
              <div className="w-full h-2 rounded bg-zinc-800 overflow-hidden">
                <div className="w-[15%] h-full bg-rose-500 rounded" />
              </div>
              <p className="text-xs text-zinc-400 mt-1.5">
                Market-bought through ponsfamily liquidity and routed directly
                to Robinhood Chain's dead address (0x0...dEaD).
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white tracking-tight">
              Twitch Rewards Distribution
            </h2>
            <TwitchIcon className="w-4 h-4 text-[#a970ff]" />
          </div>
          <p className="text-xs text-zinc-400">
            Distribution breakdown across real-time creator rewards executed on
            stream.
          </p>

          <div className="space-y-2.5 pt-1">
            {[
              {
                name: "10,000 Bits Cheer",
                bits: "10,000 Bits",
                count: 68,
                share: "36%",
              },
              {
                name: "Sub Bomb (50x Community Gift)",
                bits: "25,000 Bits Eq.",
                count: 42,
                share: "30%",
              },
              {
                name: "Hype Train Level 5 Bonus",
                bits: "5,000 Bits Eq.",
                count: 84,
                share: "20%",
              },
              {
                name: "Tier 3 Channel Subs (10x)",
                bits: "5,000 Bits Eq.",
                count: 120,
                share: "14%",
              },
            ].map((gift) => (
              <div
                key={gift.name}
                className="flex items-center justify-between p-3 bg-[#0d0e14] rounded-lg border border-zinc-850 text-xs"
              >
                <div>
                  <div className="font-semibold text-white">{gift.name}</div>
                  <div className="text-zinc-500 text-[11px] font-mono">
                    {gift.bits}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-zinc-200 font-semibold">
                    {gift.count} sent
                  </div>
                  <div className="text-xs text-zinc-400">{gift.share}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};
