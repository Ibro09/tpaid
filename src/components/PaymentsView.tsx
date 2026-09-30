import React, { useState } from "react";
import { PaymentReceipt } from "../types";
import { ExternalLink, Search, CheckCircle2 } from "lucide-react";
import { TwitchIcon } from "./Icons";

interface PaymentsViewProps {
  receipts: PaymentReceipt[];
  onAddTestPayment?: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  receipts,
  onAddTestPayment,
}) => {
  const [search, setSearch] = useState("");

  const filteredReceipts = receipts.filter(
    (r) =>
      r.recipientHandle.toLowerCase().includes(search.toLowerCase()) ||
      r.recipientName.toLowerCase().includes(search.toLowerCase()) ||
      r.txHash.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPaid = receipts.reduce((acc, r) => acc + r.amount, 0);
  const totalBurned = totalPaid * 0.15;
  const totalBits = receipts.reduce(
    (acc, r) => acc + (r.bits || r.diamonds),
    0,
  );

  return (
    <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Payments & Settlement Ledger
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Auditable on-chain transaction history of creator token trading fees
            routed to Twitch channels.
          </p>
        </div>

        {onAddTestPayment && (
          <button
            onClick={onAddTestPayment}
            className="bg-[#12141c] hover:bg-[#181a24] border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span>Simulate Live Tip ($20)</span>
          </button>
        )}
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
            Total Fees Routed
          </span>
          <div className="text-2xl font-bold text-white mt-1 font-mono tabular-nums">
            ${totalPaid.toFixed(2)}
          </div>
          <span className="text-xs text-zinc-500">
            85% converted to Twitch Bits & Subs
          </span>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
            $TPAID Bought & Burned
          </span>
          <div className="text-2xl font-bold text-rose-400 mt-1 font-mono tabular-nums">
            ${totalBurned.toFixed(2)}
          </div>
          <span className="text-xs text-zinc-500">
            15% fee share burned on Robinhood Chain
          </span>
        </div>

        <div className="bg-[#111218] border border-zinc-850 rounded-xl p-4">
          <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
            Total Bits Dispatched
          </span>
          <div className="text-2xl font-bold text-[#a970ff] mt-1 font-mono tabular-nums">
            {totalBits.toLocaleString()}
          </div>
          <span className="text-xs text-zinc-500">
            Delivered as live on-stream cheer alerts
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by streamer or TxHash..."
            className="w-full bg-[#111218] border border-zinc-850 hover:border-zinc-700 focus:border-[#9146FF] rounded-lg py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
          />
        </div>

        <div className="text-xs text-zinc-400 flex items-center gap-1.5 self-end sm:self-auto font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Robinhood Chain & ponsfamily Synced</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-[#111218] border border-zinc-850 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e14] border-b border-zinc-850 text-zinc-400 uppercase text-[11px] font-medium tracking-wider">
              <tr>
                <th className="py-3 px-4">Recipient Channel</th>
                <th className="py-3 px-4">Fee Settled</th>
                <th className="py-3 px-4">Twitch Reward</th>
                <th className="py-3 px-4">Milestone</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Blockscout Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60 font-mono tabular-nums text-zinc-300">
              {filteredReceipts.map((rec) => (
                <tr
                  key={rec.id}
                  className="hover:bg-zinc-800/20 transition-colors"
                >
                  <td className="py-3 px-4 font-sans">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={rec.recipientAvatar || undefined}
                        alt={rec.recipientName}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded object-cover bg-zinc-900 border border-zinc-850 shrink-0"
                      />
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1">
                          {rec.recipientName}
                          {rec.isVerified && (
                            <span className="text-[#a970ff] text-xs">✓</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          {rec.recipientHandle}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">
                      ${rec.amount.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-sans">
                      ${(rec.amount * 0.85).toFixed(2)} creator · $
                      {(rec.amount * 0.15).toFixed(2)} burn
                    </div>
                  </td>

                  <td className="py-3 px-4 font-sans text-zinc-200">
                    {rec.giftType}
                  </td>

                  <td className="py-3 px-4 font-sans text-zinc-400">
                    <div>{rec.milestone}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      ${rec.lifetimeAmount.toFixed(2)} lifetime
                    </div>
                  </td>

                  <td className="py-3 px-4 text-zinc-500 text-[11px]">
                    {rec.timeAgo}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <a
                      href="https://robinhoodchain.blockscout.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#00C805] hover:underline text-[11px]"
                    >
                      {rec.txHash}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};
