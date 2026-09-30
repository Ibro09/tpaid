import React, { useState } from 'react';
import {
  X,
  Check,
  ExternalLink,
  Copy,
  AlertTriangle,
  RefreshCw,
  Info,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { RobinhoodIcon } from './Icons';
import { useWallet } from '../context/WalletContext';
import {
  ROBINHOOD_CHAIN_MAINNET,
  ROBINHOOD_CHAIN_TESTNET,
  formatAddress,
} from '../utils/robinhoodChain';

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
    targetNetwork,
    setTargetNetwork,
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

  const handleCopy = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnectInjected = async (provider?: typeof injectedProviders[number]['provider']) => {
    clearError();
    const ok = provider
      ? await connectWithProvider(provider, targetNetwork)
      : await connect(targetNetwork);
    if (ok) {
      onClose();
    }
  };

  const handleConnectSimulated = (addr?: string) => {
    connectSimulated(addr);
    onClose();
  };

  const handleSwitchToRobinhood = async () => {
    await switchNetwork(targetNetwork);
  };

  const currentChainTarget =
    targetNetwork === 'testnet' ? ROBINHOOD_CHAIN_TESTNET : ROBINHOOD_CHAIN_MAINNET;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#10121a] border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative my-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#00C805]/15 border border-[#00C805]/30 flex items-center justify-center text-[#00C805]">
              <RobinhoodIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm leading-tight">
                {walletAddress ? 'Robinhood Chain Wallet' : 'Connect Wallet'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Arbitrum Orbit L2 · Chain ID: {currentChainTarget.chainIdDecimal}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Network Selector Toggle */}
        <div className="flex items-center justify-between bg-[#0d0e14] p-1 rounded-lg border border-zinc-850 text-xs">
          <span className="text-zinc-500 px-2 text-[10px] uppercase font-medium">Network</span>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setTargetNetwork('mainnet');
                if (walletAddress && !isRobinhoodChain) {
                  switchNetwork('mainnet');
                }
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                targetNetwork === 'mainnet'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Mainnet (4663)
            </button>
            <button
              onClick={() => {
                setTargetNetwork('testnet');
                if (walletAddress && !isRobinhoodChain) {
                  switchNetwork('testnet');
                }
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                targetNetwork === 'testnet'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Testnet (46630)
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">Notice:</span>
              <span className="text-[11px] text-rose-200/90 leading-tight">
                {error === 'NO_WALLET_FOUND'
                  ? 'No browser wallet extension detected. You can connect using the instant demo Robinhood Chain wallet below.'
                  : error}
              </span>
            </div>
            <button
              onClick={clearError}
              className="text-zinc-400 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {walletAddress ? (
          /* CONNECTED STATE */
          <div className="space-y-4">
            {/* Wrong Network Warning Banner */}
            {!isRobinhoodChain && (
              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-xs text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Wrong Network: {chainName}</span>
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  Tpaid settles on Robinhood Chain (ID: {currentChainTarget.chainIdDecimal}). Please switch networks.
                </p>
                <button
                  onClick={handleSwitchToRobinhood}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Switch to Robinhood Chain ({currentChainTarget.chainIdDecimal})</span>
                </button>
              </div>
            )}

            {/* Account Card */}
            <div className="p-4 bg-[#0d0e14] rounded-lg border border-zinc-850 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full bg-[#00C805]" />
                  <span className="font-medium text-zinc-300">
                    {isRobinhoodChain ? 'Robinhood Chain Active' : chainName}
                  </span>
                </div>
                {isSimulated && (
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Instant Demo Mode
                  </span>
                )}
              </div>

              {/* Address Row */}
              <div className="flex items-center justify-between bg-[#111218] p-2 rounded border border-zinc-800">
                <div className="font-mono text-xs text-zinc-200 font-semibold select-all break-all">
                  {walletAddress}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={handleCopy}
                    className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Copy address"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-[#00C805]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={`${currentChainTarget.blockExplorerUrls[0]}/address/${walletAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-800 transition-colors"
                    title="View on Robinhood Blockscout Explorer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Balance & Network Row */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-850 text-xs font-mono tabular-nums">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-sans">Balance</div>
                  <div className="font-bold text-white text-sm mt-0.5">
                    {balance || '0.00 ETH'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500 uppercase font-sans">Chain ID</div>
                  <div className="font-bold text-[#00C805] text-sm mt-0.5">
                    {chainId || currentChainTarget.chainIdDecimal}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowNetworkDetails(!showNetworkDetails)}
                className="flex-1 py-2 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showNetworkDetails ? 'Hide RPC Info' : 'Network RPC Info'}</span>
              </button>

              <button
                onClick={() => {
                  disconnect();
                  onClose();
                }}
                className="flex-1 py-2 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 border border-rose-500/30 text-rose-300 font-medium text-xs transition-colors cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          /* NOT CONNECTED STATE */
          <div className="space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Connect your Web3 wallet. Tpaid will request an account connection and prompt your wallet to switch to <strong className="text-zinc-200">Robinhood Chain</strong> (Chain ID: {currentChainTarget.chainIdDecimal}).
            </p>

            {/* Main Action 1: Injected Provider */}
            <div className="space-y-2">
              {injectedProviders.length > 1 && (
                <p className="text-[11px] text-[#bf94ff]">Choose which installed wallet should connect:</p>
              )}
              {injectedProviders.length > 0 ? injectedProviders.map(({ provider, name }) => (
              <button
                key={name}
                onClick={() => handleConnectInjected(provider)}
                disabled={isConnecting}
                className="w-full flex items-center justify-between p-3.5 rounded-lg bg-[#141722] hover:bg-[#1a1e2c] border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-[#00C805] text-black flex items-center justify-center font-bold text-sm shrink-0">
                    <RobinhoodIcon className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-white group-hover:text-zinc-200 transition-colors">
                      {name}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Requests Robinhood Chain (ID: {currentChainTarget.chainIdDecimal})
                    </div>
                  </div>
                </div>

                {isConnecting ? (
                  <RefreshCw className="w-4 h-4 text-[#00C805] animate-spin" />
                ) : (
                  <span className="text-xs text-zinc-400 group-hover:text-white transition-colors">Connect →</span>
                )}
              </button>
              )) : (
                <button onClick={() => handleConnectInjected()} disabled={isConnecting} className="w-full rounded-lg border border-zinc-800 p-3 text-left text-xs text-zinc-300">
                  No injected wallet detected. Install a wallet or use the demo connection.
                </button>
              )}

              {/* Instant Simulated Robinhood Chain Wallet */}
              <button
                onClick={() => handleConnectSimulated()}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-[#0d0e14] hover:bg-[#12141c] border border-zinc-850 hover:border-zinc-800 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-zinc-800 text-zinc-300 flex items-center justify-center font-mono text-xs">
                    ⚡
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">
                      Demo Robinhood Chain Wallet
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Instant connection with 3.45 ETH balance
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Instant Test
                </span>
              </button>
            </div>

            {/* Quick helper info */}
            <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500">
              <button
                onClick={() => setShowNetworkDetails(!showNetworkDetails)}
                className="hover:text-zinc-300 cursor-pointer flex items-center gap-1"
              >
                <Info className="w-3 h-3" />
                <span>Robinhood Chain RPC specs</span>
              </button>
              <a
                href="https://robinhood.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-zinc-300 flex items-center gap-1"
              >
                <span>Robinhood Web3</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Network Details Accordion */}
        {showNetworkDetails && (
          <div className="p-3.5 bg-[#0b0c10] border border-zinc-850 rounded-lg text-[11px] space-y-2 font-mono">
            <div className="text-white font-sans font-semibold flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00C805]" />
              <span>{currentChainTarget.chainName}</span>
            </div>
            <div className="space-y-1 text-zinc-400 pt-1 border-t border-zinc-850">
              <div className="flex justify-between">
                <span className="text-zinc-500">Chain ID:</span>
                <span className="text-white font-bold">{currentChainTarget.chainIdDecimal} ({currentChainTarget.chainId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Currency:</span>
                <span className="text-white font-bold">{currentChainTarget.nativeCurrency.symbol} (ETH)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">RPC URL:</span>
                <span className="text-zinc-300 truncate max-w-[200px]">{currentChainTarget.rpcUrls[0]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Explorer:</span>
                <a
                  href={currentChainTarget.blockExplorerUrls[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#00C805] hover:underline flex items-center gap-1"
                >
                  <span>Blockscout</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
