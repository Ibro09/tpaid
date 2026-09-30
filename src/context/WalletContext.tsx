import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getInjectedProvider,
  getInjectedProviders,
  getProviderName,
  EthereumProvider,
  connectAndRequestRobinhoodChain,
  switchToRobinhoodChain,
  ROBINHOOD_CHAIN_MAINNET,
  ROBINHOOD_CHAIN_TESTNET,
  formatEthBalance,
} from '../utils/robinhoodChain';

interface WalletContextType {
  walletAddress: string | null;
  chainId: number | null;
  chainName: string;
  balance: string | null;
  isConnecting: boolean;
  isRobinhoodChain: boolean;
  isSimulated: boolean;
  error: string | null;
  hasInjectedProvider: boolean;
  targetNetwork: 'mainnet' | 'testnet';
  setTargetNetwork: (net: 'mainnet' | 'testnet') => void;
  connect: (net?: 'mainnet' | 'testnet') => Promise<boolean>;
  injectedProviders: Array<{ provider: EthereumProvider; name: string }>;
  connectWithProvider: (provider: EthereumProvider, net?: 'mainnet' | 'testnet') => Promise<boolean>;
  connectSimulated: (customAddress?: string) => void;
  disconnect: () => void;
  switchNetwork: (net?: 'mainnet' | 'testnet') => Promise<boolean>;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState<string | null>(() => {
    return localStorage.getItem('tipped_wallet_address') || null;
  });
  const [chainId, setChainId] = useState<number | null>(() => {
    const saved = localStorage.getItem('tipped_chain_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [balance, setBalance] = useState<string | null>(() => {
    return localStorage.getItem('tipped_balance') || null;
  });
  const [isSimulated, setIsSimulated] = useState<boolean>(() => {
    return localStorage.getItem('tipped_is_simulated') === 'true';
  });
  const [targetNetwork, setTargetNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<EthereumProvider | null>(null);
  const injectedProviders = getInjectedProviders().map((provider, index) => ({
    provider,
    name: getProviderName(provider, index),
  }));

  const provider = typeof window !== 'undefined' ? getInjectedProvider() : null;
  const hasInjectedProvider = !!provider;

  // Determine if active chain is Robinhood Chain (Mainnet 4663 or Testnet 46630)
  const isRobinhoodChain = chainId === ROBINHOOD_CHAIN_MAINNET.chainIdDecimal || 
                           chainId === ROBINHOOD_CHAIN_TESTNET.chainIdDecimal;

  const chainName =
    chainId === ROBINHOOD_CHAIN_MAINNET.chainIdDecimal
      ? 'Robinhood Chain'
      : chainId === ROBINHOOD_CHAIN_TESTNET.chainIdDecimal
      ? 'Robinhood Chain Testnet'
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

  useEffect(() => {
    localStorage.setItem('tipped_is_simulated', isSimulated.toString());
  }, [isSimulated]);

  // Setup event listeners for injected provider
  useEffect(() => {
    if (!provider || isSimulated) return;

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
  }, [provider, isSimulated]);

  // Real connection to Robinhood Chain
  const connectWithProvider = useCallback(async (provider: EthereumProvider, net?: 'mainnet' | 'testnet'): Promise<boolean> => {
    const selectedNet = net || targetNetwork;
    setIsConnecting(true);
    setError(null);

    try {
      const result = await connectAndRequestRobinhoodChain(selectedNet, provider);
      setSelectedProvider(provider);
      setWalletAddress(result.address);
      setChainId(result.chainId);
      setBalance(result.balance);
      setIsSimulated(false);
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
  }, [targetNetwork]);

  const connect = useCallback(async (net?: 'mainnet' | 'testnet'): Promise<boolean> => {
    const providers = getInjectedProviders();
    if (providers.length !== 1) {
      setError(providers.length === 0 ? 'NO_WALLET_FOUND' : 'SELECT_WALLET');
      return false;
    }
    return connectWithProvider(providers[0], net);
  }, [connectWithProvider]);

  // Simulated Robinhood Chain wallet connection for environments without browser extensions
  const connectSimulated = useCallback((customAddress?: string) => {
    const targetChain = targetNetwork === 'testnet' ? ROBINHOOD_CHAIN_TESTNET : ROBINHOOD_CHAIN_MAINNET;
    const simAddress = customAddress || '0x4663B9a1d94f786E8e28B23f8C751b34F0744663';
    setWalletAddress(simAddress);
    setChainId(targetChain.chainIdDecimal);
    setBalance('3.450 ETH');
    setIsSimulated(true);
    setError(null);
  }, [targetNetwork]);

  const disconnect = useCallback(() => {
    setWalletAddress(null);
    setChainId(null);
    setBalance(null);
    setIsSimulated(false);
    setError(null);
    localStorage.removeItem('tipped_wallet_address');
    localStorage.removeItem('tipped_chain_id');
    localStorage.removeItem('tipped_balance');
    localStorage.removeItem('tipped_is_simulated');
  }, []);

  const switchNetwork = useCallback(async (net?: 'mainnet' | 'testnet'): Promise<boolean> => {
    const selectedNet = net || targetNetwork;
    if (isSimulated) {
      const targetConfig = selectedNet === 'testnet' ? ROBINHOOD_CHAIN_TESTNET : ROBINHOOD_CHAIN_MAINNET;
      setChainId(targetConfig.chainIdDecimal);
      return true;
    }

    const activeProvider = selectedProvider || getInjectedProvider();
    if (!activeProvider) {
      setError('NO_WALLET_FOUND');
      return false;
    }

    try {
      const newChainId = await switchToRobinhoodChain(selectedNet);
      setChainId(newChainId);
      setError(null);
      return true;
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'Failed to switch network');
      return false;
    }
  }, [targetNetwork, isSimulated, selectedProvider]);

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        chainId,
        chainName,
        balance,
        isConnecting,
        isRobinhoodChain,
        isSimulated,
        error,
        hasInjectedProvider,
        targetNetwork,
        setTargetNetwork,
        connect,
        connectWithProvider,
        injectedProviders,
        connectSimulated,
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
