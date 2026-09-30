import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDollarSign, ExternalLink, ShieldCheck, Wallet, Zap } from 'lucide-react';
import { TIPPED_LAUNCH_FEE_ETH, TIPPED_LAUNCH_FEE_RECIPIENT } from '../utils/ponsV2';

const shortAddress = (address: string) => `${address.slice(0, 8)}...${address.slice(-6)}`;

const steps = [
  {
    number: '01',
    title: 'Choose a creator',
    description: 'Find the Twitch creator and enter the token name, ticker, image, and optional first buy.',
  },
  {
    number: '02',
    title: 'Pay the Tpaid launch fee',
    description: `Send ${TIPPED_LAUNCH_FEE_ETH} ETH to the Tpaid fee wallet in a separate transaction. Keep extra ETH available for network gas.`,
  },
  {
    number: '03',
    title: 'Confirm the Pons V2 launch',
    description: 'Review and sign the launch transaction on Robinhood Chain. The fee recipient is recorded in the token launch configuration.',
  },
];

export const DocsView: React.FC = () => {
  const navigate = useNavigate();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-7 overflow-y-auto px-4 py-6 pb-10 sm:px-8 sm:py-8" data-purpose="docs-page">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Documentation</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
            How Tpaid launches tokens and reads creator fees on Pons V2.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/launch')}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-[#ff2d55] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#ff456a] sm:self-auto"
        >
          <Zap className="h-3.5 w-3.5" />
          Launch a token
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-[#111] p-5 sm:p-7">
        <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
          <ShieldCheck className="h-4 w-4 text-zinc-300" />
          Protocol overview
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Token fees, recorded on-chain</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Tpaid provides a launch flow for Pons V2 tokens on Robinhood Chain. Pons contract events and fee-escrow balances are the source for the fee information shown in the app. The creator-fee recipient is set in the token launch transaction; the app does not report estimated activity as a completed payout.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Network</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">Robinhood Chain</div>
            <div className="mt-1 text-xs text-zinc-500">Chain ID 4663</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Launch platform</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">Pons V2</div>
            <div className="mt-1 text-xs text-zinc-500">Launch and fee escrow contracts</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Tpaid launch fee</div>
            <div className="mt-1 font-mono text-sm font-semibold text-zinc-100">{TIPPED_LAUNCH_FEE_ETH} ETH</div>
            <div className="mt-1 text-xs text-zinc-500">Paid separately from launch gas</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Launching a token</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">You will review and approve each transaction in your connected wallet.</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="rounded-2xl border border-zinc-800 bg-[#111] p-5">
              <div className="font-mono text-xs text-zinc-500">{step.number}</div>
              <h3 className="mt-3 text-sm font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-[#111] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-[#171717] text-zinc-300">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Creator-fee recipient</h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              New tokens launched through Tpaid set the creator-fee recipient to the Tpaid fee wallet below. The launcher remains the token creator, but creator fees are claimable by the recipient wallet, not by the launcher’s wallet. Existing tokens keep the recipient recorded at their launch.
            </p>
            <a
              href={`https://robinhoodchain.blockscout.com/address/${TIPPED_LAUNCH_FEE_RECIPIENT}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-800 bg-[#0b0b0b] px-3 py-2 font-mono text-xs text-zinc-200 transition-colors hover:border-zinc-600"
            >
              <span className="truncate">{shortAddress(TIPPED_LAUNCH_FEE_RECIPIENT)}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-zinc-500" />
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-[#111] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-zinc-300" />
          <h2 className="text-base font-semibold text-white">Understanding creator fees</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
            <h3 className="text-sm font-medium text-zinc-100">Earned</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Calculated from the token curve’s on-chain buy/sell tax events and that token’s swept pool-fee events. It is activity attributed to that token.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0b0b0b] p-4">
            <h3 className="text-sm font-medium text-zinc-100">Claimable</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Only the non-zero balance already credited to Pons fee escrow can be claimed. Earned fees that have not reached escrow are not yet withdrawable.
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Escrow balances are pooled by recipient wallet and fee asset, so credited, claimed, and remaining totals can include activity from other tokens using the same wallet and asset. The claim action sends the selected escrow balance to the recipient wallet and requires that wallet to sign the transaction.
        </p>
      </section>

      <footer className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#111] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Ready to launch?</h2>
          <p className="mt-1 text-xs text-zinc-500">Review the fee and token details in the launch flow before signing.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/launch')}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-[#ff2d55] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#ff456a] sm:self-auto"
        >
          Open launch
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </footer>
      <div className="flex items-center gap-2 pb-2 text-[10px] text-zinc-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Fee figures are read from Pons V2 contracts on Robinhood Chain.
      </div>
    </main>
  );
};
