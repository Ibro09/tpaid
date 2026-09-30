import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleHelp,
  Copy,
  ExternalLink,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { ROBINHOOD_CHAIN_MAINNET, formatAddress } from '../utils/robinhoodChain';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const {
    walletAddress,
    chainId,
    chainName,
    balance,
    isConnecting,
    isRobinhoodChain,
    isSimulated,
    error,
    connect,
    connectWithProvider,
    injectedProviders,
    connectSimulated,
    disconnect,
    switchNetwork,
    clearError,
  } = useWallet();
  const [copied, setCopied] = useState(false);
  const [showNetworkDetails, setShowNetworkDetails] = useState(false);

  if (!isOpen) return null;

  const chain = ROBINHOOD_CHAIN_MAINNET;
  const handleCopy = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleConnect = async (provider?: typeof injectedProviders[number]['provider']) => {
    clearError();
    const connected = provider ? await connectWithProvider(provider) : await connect();
    if (connected) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        className="relative my-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-[#29252f] bg-[#0d0c10] shadow-[0_24px_100px_rgba(0,0,0,0.65)]"
        role="dialog"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#bca8f7]/70 to-transparent" />
        <header className="flex items-start justify-between border-b border-white/[0.07] px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#a78bfa]/20 bg-[#a78bfa]/10 text-[#c4b5fd]">
              <Wallet className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#bca8f7]">
                Tpaid wallet
              </p>
              <h2 id="wallet-modal-title" className="text-base font-semibold tracking-tight text-white">
                {walletAddress ? 'Your wallet' : 'Connect a wallet'}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {walletAddress ? 'Account and network details' : 'Connect to use Tpaid on Robinhood Chain'}
              </p>
            </div>
          </div>
          <button
            aria-label="Close wallet dialog"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/[0.07] text-zinc-500 transition-colors hover:border-white/15 hover:bg-white/[0.05] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#bca8f7] opacity-30" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#bca8f7]" />
              </span>
              <span className="text-sm font-medium text-zinc-200">Robinhood Chain</span>
            </div>
            <span className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1 font-mono text-[10px] text-zinc-500">
              {chain.chainIdDecimal}
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3.5 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Could not connect</p>
                <p className="mt-1 text-xs leading-relaxed text-rose-200/70">
                  {error === 'NO_WALLET_FOUND'
                    ? 'No browser wallet detected. Install a wallet extension or try demo mode.'
                    : error === 'SELECT_WALLET'
                      ? 'Choose a wallet below to continue.'
                      : error}
                </p>
              </div>
              <button
                aria-label="Dismiss error"
                onClick={clearError}
                className="cursor-pointer text-rose-200/50 transition-colors hover:text-rose-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {walletAddress ? (
            <div className="space-y-4">
              {!isRobinhoodChain && (
                <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
                    <AlertTriangle className="h-4 w-4 text-amber-300" />
                    Wrong network
                  </div>
                  <p className="text-xs leading-relaxed text-amber-100/65">
                    You’re connected to {chainName}. Switch to Robinhood Chain to use Tpaid.
                  </p>
                  <button
                    onClick={() => void switchNetwork()}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#ff2d55] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ff456a]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Switch network
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${isRobinhoodChain ? 'bg-emerald-400' : 'bg-amber-300'}`} />
                    {isRobinhoodChain ? 'Connected to Robinhood Chain' : chainName}
                  </div>
                  {isSimulated && (
                    <span className="rounded-md border border-[#bca8f7]/15 bg-[#bca8f7]/[0.07] px-2 py-1 text-[10px] font-medium text-[#c4b5fd]">
                      Demo
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Wallet address</p>
                    <p className="truncate font-mono text-sm text-zinc-200">{formatAddress(walletAddress)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label="Copy wallet address"
                      onClick={() => void handleCopy()}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <a
                      aria-label="View wallet on Blockscout"
                      href={`${chain.blockExplorerUrls[0]}/address/${walletAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">Balance</p>
                    <p className="mt-1 font-mono text-sm font-medium text-white">{balance || '0.00 ETH'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">Network</p>
                    <p className="mt-1 text-sm font-medium text-white">{chainId || chain.chainIdDecimal}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowNetworkDetails((visible) => !visible)}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                  Network details
                </button>
                <button
                  onClick={() => {
                    disconnect();
                    onClose();
                  }}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-rose-400/15 px-3 py-2.5 text-xs font-medium text-rose-300/80 transition-colors hover:bg-rose-400/[0.07] hover:text-rose-200"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-zinc-400">
                Connect your wallet to explore tokens, launch, and manage creator fees.
              </p>

              {injectedProviders.length > 0 ? (
                <div className="space-y-2">
                  {injectedProviders.map(({ provider, name }) => (
                    <button
                      key={name}
                      onClick={() => void handleConnect(provider)}
                      disabled={isConnecting}
                      className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 text-left transition-colors hover:border-[#bca8f7]/30 hover:bg-[#bca8f7]/[0.04] disabled:cursor-wait disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#bca8f7]/15 bg-[#bca8f7]/[0.08] text-[#c4b5fd]">
                          <Wallet className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-zinc-100">{name}</span>
                          <span className="mt-1 block text-xs text-zinc-500">Connect to Robinhood Chain</span>
                        </span>
                      </span>
                      {isConnecting
                        ? <RefreshCw className="h-4 w-4 animate-spin text-[#c4b5fd]" />
                        : <ArrowUpRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-[#c4b5fd]" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-xs leading-relaxed text-zinc-500">
                  No browser wallet detected. Install a wallet extension to connect.
                </div>
              )}

              <button
                onClick={() => {
                  connectSimulated();
                  onClose();
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/[0.06] px-3.5 py-3 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.025]"
              >
                <span>
                  <span className="block text-xs font-medium text-zinc-300">Try demo mode</span>
                  <span className="mt-1 block text-[11px] text-zinc-600">Simulated wallet · no transactions</span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-zinc-600" />
              </button>

              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-zinc-600">
                <ShieldCheck className="h-3.5 w-3.5 text-[#bca8f7]/70" />
                Your wallet never shares its private keys with Tpaid
              </div>
            </div>
          )}

          {showNetworkDetails && (
            <div className="space-y-2 rounded-xl border border-white/[0.07] bg-black/20 p-3.5 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">Chain ID</span>
                <span className="font-mono text-zinc-300">{chain.chainIdDecimal}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">Currency</span>
                <span className="font-mono text-zinc-300">{chain.nativeCurrency.symbol}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">RPC</span>
                <span className="max-w-[220px] truncate font-mono text-zinc-400">{chain.rpcUrls[0]}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-zinc-500">Explorer</span>
                <a
                  href={chain.blockExplorerUrls[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#c4b5fd] transition-colors hover:text-white"
                >
                  Blockscout <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
