import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getInjectedProvider,
  getInjectedProviders,
  getProviderName,
  EthereumProvider,
  connectAndRequestRobinhoodChain,
  switchToRobinhoodChain,
  ROBINHOOD_CHAIN_MAINNET,
  formatEthBalance,
} from '../utils/robinhoodChain';

interface WalletContextType {
  walletAddress: string | null;
  chainId: number | null;
  chainName: string;
  balance: string | null;
  isConnecting: boolean;
  isRobinhoodChain: boolean;
  error: string | null;
  hasInjectedProvider: boolean;
  connect: () => Promise<boolean>;
  injectedProviders: Array<{ provider: EthereumProvider; name: string }>;
  connectWithProvider: (provider: EthereumProvider) => Promise<boolean>;
  disconnect: () => void;
  switchNetwork: () => Promise<boolean>;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

function clearLegacyDemoWallet() {
  if (localStorage.getItem('tipped_is_simulated') !== 'true') return false;
  localStorage.removeItem('tipped_wallet_address');
  localStorage.removeItem('tipped_chain_id');
  localStorage.removeItem('tipped_balance');
  localStorage.removeItem('tipped_is_simulated');
  return true;
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    if (clearLegacyDemoWallet()) return null;
    return localStorage.getItem('tipped_wallet_address') || null;
  });
  const [chainId, setChainId] = useState<number | null>(() => {
    const saved = localStorage.getItem('tipped_chain_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [balance, setBalance] = useState<string | null>(() => {
    return localStorage.getItem('tipped_balance') || null;
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<EthereumProvider | null>(null);
  const injectedProviders = getInjectedProviders().map((provider, index) => ({
    provider,
    name: getProviderName(provider, index),
  }));

  const provider = typeof window !== 'undefined' ? getInjectedProvider() : null;
  const hasInjectedProvider = !!provider;

  const isRobinhoodChain = chainId === ROBINHOOD_CHAIN_MAINNET.chainIdDecimal;

  const chainName =
    chainId === ROBINHOOD_CHAIN_MAINNET.chainIdDecimal
      ? 'Robinhood Chain'
      : chainId === 1
      ? 'Ethereum Mainnet'
      : chainId === 42161
      ? 'Arbitrum One'
      : chainId === 8453
      ? 'Base'
      : chainId
      ? `Chain #${chainId}`
      : 'Unknown';

  const clearError = () => setError(null);

  // Sync state to localStorage
  useEffect(() => {
    if (walletAddress) {
      localStorage.setItem('tipped_wallet_address', walletAddress);
    } else {
      localStorage.removeItem('tipped_wallet_address');
    }
  }, [walletAddress]);

  useEffect(() => {
    if (chainId) {
      localStorage.setItem('tipped_chain_id', chainId.toString());
    } else {
      localStorage.removeItem('tipped_chain_id');
    }
  }, [chainId]);

  useEffect(() => {
    if (balance) {
      localStorage.setItem('tipped_balance', balance);
    } else {
      localStorage.removeItem('tipped_balance');
    }
  }, [balance]);

  // Setup event listeners for injected provider
  useEffect(() => {
    if (!provider) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (!accs || accs.length === 0) {
        setWalletAddress(null);
        setBalance(null);
      } else {
        setWalletAddress(accs[0]);
        // Refresh balance
        provider.request({
          method: 'eth_getBalance',
          params: [accs[0], 'latest'],
        }).then((bHex) => {
          setBalance(formatEthBalance(bHex as string));
        }).catch(() => {});
      }
    };

    const handleChainChanged = (newChainHex: unknown) => {
      const newId = parseInt(newChainHex as string, 16);
      setChainId(newId);
    };

    if (provider.on) {
      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
    }

    return () => {
      if (provider.removeListener) {
        provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [provider]);

  // Real connection to Robinhood Chain
  const connectWithProvider = useCallback(async (provider: EthereumProvider): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);

    try {
      const result = await connectAndRequestRobinhoodChain(provider);
      setSelectedProvider(provider);
      setWalletAddress(result.address);
      setChainId(result.chainId);
      setBalance(result.balance);
      setIsConnecting(false);
      return true;
    } catch (err: unknown) {
      setIsConnecting(false);
      const e = err as { code?: number; message?: string };
      if (e?.code === 4001) {
        setError('Connection rejected by user.');
      } else {
        setError(e?.message || 'Failed to connect to Robinhood Chain');
      }
      return false;
    }
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    const providers = getInjectedProviders();
    if (providers.length !== 1) {
      setError(providers.length === 0 ? 'NO_WALLET_FOUND' : 'SELECT_WALLET');
      return false;
    }
    return connectWithProvider(providers[0]);
  }, [connectWithProvider]);

  const disconnect = useCallback(() => {
    setWalletAddress(null);
    setChainId(null);
    setBalance(null);
    setError(null);
    localStorage.removeItem('tipped_wallet_address');
    localStorage.removeItem('tipped_chain_id');
    localStorage.removeItem('tipped_balance');
  }, []);

  const switchNetwork = useCallback(async (): Promise<boolean> => {
    const activeProvider = selectedProvider || getInjectedProvider();
    if (!activeProvider) {
      setError('NO_WALLET_FOUND');
      return false;
    }

    try {
      const newChainId = await switchToRobinhoodChain();
      setChainId(newChainId);
      setError(null);
      return true;
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'Failed to switch network');
      return false;
    }
  }, [selectedProvider]);

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        chainId,
        chainName,
        balance,
        isConnecting,
        isRobinhoodChain,
        error,
        hasInjectedProvider,
        connect,
        connectWithProvider,
        injectedProviders,
        disconnect,
        switchNetwork,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
