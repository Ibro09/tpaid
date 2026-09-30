import React from "react";
import { X, ShieldCheck, Flame, Gift, ArrowRight } from "lucide-react";
import { TwitchIcon } from "./Icons";

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchClick: () => void;
}

export const DocsModal: React.FC<DocsModalProps> = ({
  isOpen,
  onClose,
  onLaunchClick,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#10121a] border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="p-5 border-b border-zinc-850 flex items-center justify-between bg-[#0d0e14]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#772ce8] flex items-center justify-center text-white shrink-0">
              <TwitchIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Tpaid Protocol Documentation
              </h2>
              <div className="text-[11px] text-zinc-400">
                Automated fee routing to Twitch streamers via Robinhood Chain &
                ponsfamily
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          {/* Section 1 */}
          <div className="space-y-2">
            <h3 className="text-white font-bold text-base flex items-center gap-2">
              <Gift className="w-4 h-4 text-[#a970ff]" />
              <span>What is Tpaid?</span>
            </h3>
            <p className="text-zinc-400 text-xs sm:text-sm">
              Tpaid is a token launch and creator-fee tracking platform on
              Robinhood Chain. It reads creator-fee activity from Pons V2 and
              displays fees available in escrow.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <h3 className="text-white font-bold text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>On-Chain Fee Locking on Robinhood Chain</span>
            </h3>
            <p className="text-zinc-400 text-xs sm:text-sm">
              When launching via Tpaid, the token launch flow interacts with
              Pons V2:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-zinc-400 text-xs">
              <li>
                <strong className="text-zinc-200">Launch:</strong> Deploys the
                token through Pons V2 on Robinhood Chain.
              </li>
              <li>
                <strong className="text-zinc-200">Creator fees:</strong> The fee
                recipient is set in the token launch transaction; available
                escrow balances can be claimed by the recipient wallet.
              </li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <h3 className="text-white font-bold text-base flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>The 85 / 15 Fee Split Architecture</span>
            </h3>
            <div className="p-4 bg-[#0d0e14] border border-zinc-850 rounded-lg space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <span className="text-[#a970ff] font-bold font-mono text-sm">
                  85%
                </span>
                <div>
                  <strong className="text-white">
                    Twitch Streamer Bits & Subs
                  </strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Forwarded instantly as live Twitch Bits cheers or Tier 1/3
                    gift subs to the targeted streamer channel. Streamers cash
                    them out directly to fiat through Twitch's creator payouts.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 pt-2 border-t border-zinc-850">
                <span className="text-rose-400 font-bold font-mono text-sm">
                  15%
                </span>
                <div>
                  <strong className="text-white">$TPAID Buyback & Burn</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    15% of all launch and trading fees market-buys $TPAID from
                    the liquidity pool and routes it directly to Robinhood
                    Chain's dead address (0x0...dEaD), decreasing token supply
                    over time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <h3 className="text-white font-bold text-base">
              Does the Streamer Need a Crypto Wallet?
            </h3>
            <p className="text-zinc-400 text-xs sm:text-sm">
              No. The streamer never needs to touch crypto, hold private keys,
              or manage gas on Robinhood Chain. They simply receive Bits and
              subscription revenue credited directly inside their verified
              Twitch Creator Dashboard.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0d0e14] border-t border-zinc-850 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            Ready to route fees to a Twitch streamer?
          </span>
          <button
            onClick={() => {
              onClose();
              onLaunchClick();
            }}
            className="bg-[#772ce8] hover:bg-[#6423c4] text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>Launch a Coin</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
