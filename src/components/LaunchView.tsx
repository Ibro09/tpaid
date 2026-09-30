import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TokenItem } from "../types";
import { QUICK_CREATORS } from "../data/mockData";
import { TwitchIcon, TwitchBitsIcon } from "./Icons";
import {
  Sparkles,
  Check,
  Image as ImageIcon,
  Send,
  Volume2,
  ArrowLeft,
  ChevronDown,
  ArrowBigRight,
  ArrowBigRightDash,
  ArrowRight,
  ArrowRightLeft,
  ArrowRightLeftIcon,
} from "lucide-react";
import confetti from "canvas-confetti";
import { getInjectedProvider } from "../utils/robinhoodChain";
import {
  collectTippedLaunchFee,
  launchAndBuyPonsV2,
  launchPonsV2,
  TIPPED_LAUNCH_FEE_ETH,
  TIPPED_LAUNCH_FEE_RECIPIENT,
  waitForTippedLaunchFee,
} from "../utils/ponsV2";

interface LaunchViewProps {
  onTokenCreated: (token: TokenItem) => void;
  walletConnected: boolean;
  walletAddress?: string;
  onOpenWallet: () => void;
}

interface TwitchCreator {
  handle: string;
  name: string;
  avatar?: string;
  description?: string;
  isLive?: boolean;
  category?: string;
}

type QuickCreator = {
  handle: string;
  name: string;
  avatarGradient?: string;
};

export const LaunchView: React.FC<LaunchViewProps> = ({
  onTokenCreated,
  walletConnected,
  walletAddress,
  onOpenWallet,
}) => {
  const navigate = useNavigate();
  // Form fields
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("https://usetipped.app");
  const [xLink, setXLink] = useState("https://x.com/usetippedX");
  const [firstBuy, setFirstBuy] = useState<string>("none");
  const [customBuy, setCustomBuy] = useState("0");
  const [imageUrl, setImageUrl] = useState("");

  // Twitch stream mockup interactive states
  const [bitsCheered, setBitsCheered] = useState(5000);
  const [isFollowing, setIsFollowing] = useState(false);
  const [cheerAlertVisible, setCheerAlertVisible] = useState(false);

  // Launch modal states
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState<number>(0);
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [googleSheetsWarning, setGoogleSheetsWarning] = useState<string | null>(
    null,
  );
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string | null>(null);
  const [creatorSuggestions, setCreatorSuggestions] = useState<TwitchCreator[]>(
    [],
  );
  const [isSearchingCreators, setIsSearchingCreators] = useState(false);
  const [creatorSearchError, setCreatorSearchError] = useState<string | null>(
    null,
  );
  const [creatorInputFocused, setCreatorInputFocused] = useState(false);
  const [verifiedCreatorHandle, setVerifiedCreatorHandle] = useState<
    string | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!creatorInputFocused || handle.trim()) return;
    setCreatorSuggestions(
      (QUICK_CREATORS as QuickCreator[]).map((creator) => ({
        handle: creator.handle,
        name: creator.name,
      })),
    );
  }, [creatorInputFocused, handle]);

  const normalizeTwitchLogin = (value: string) =>
    value
      .trim()
      .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "")
      .replace(/^@/, "")
      .split(/[/?#]/)[0]
      .trim();

  const lookupTwitchCreator = async (value = handle) => {
    const login = normalizeTwitchLogin(value);
    if (!login) return;
    setIsSearchingCreators(true);
    setCreatorSearchError(null);
    setCreatorSuggestions([]);
    try {
      const response = await fetch("/api/twitch/channel", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login }),
      });
      const data = (await response.json().catch(() => null)) as {
        user?: TwitchCreator;
        error?: string;
      } | null;
      if (!response.ok || !data?.user) {
        setVerifiedCreatorHandle(null);
        setCreatorSearchError(`No user with such username: ${login}`);
        return;
      }
      setVerifiedCreatorHandle(data.user.handle.toLowerCase());
      setCreatorSuggestions([data.user]);
    } catch {
      setCreatorSearchError("Unable to reach the Twitch channel service.");
    } finally {
      setIsSearchingCreators(false);
    }
  };

  const handleCreatorPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pasted = event.clipboardData.getData("text");
    if (!pasted.trim()) return;
    const login = normalizeTwitchLogin(pasted);
    event.preventDefault();
    setHandle(login);
    window.setTimeout(() => void lookupTwitchCreator(login), 0);
  };

  const handleSelectCreator = (creator: QuickCreator) => {
    setVerifiedCreatorHandle(null);
    setHandle(creator.handle);
    setName(`${creator.name} Coin`);
    const cleanTicker = creator.name.split(" ")[0].toUpperCase();
    setTicker(cleanTicker);
    setDescription(
      `Every buy & sell on ponsfamily routes 85% of creator rewards to @${creator.handle} as Twitch Bits & Subs!`,
    );
  };

  const handleSelectTwitchCreator = (creator: TwitchCreator) => {
    setVerifiedCreatorHandle(creator.handle.toLowerCase());
    setHandle(creator.handle);
    setName(`${creator.name} Coin`);
    setTicker(creator.handle.slice(0, 5).toUpperCase());
    if (creator.avatar?.trim()) setImageUrl(creator.avatar.trim());
    setDescription(
      creator.description?.trim() ||
        `Every buy & sell routes 85% of creator rewards to @${creator.handle} as Twitch Bits & Subs!`,
    );
    setCreatorInputFocused(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCheerBits = () => {
    setBitsCheered((prev) => prev + 500);
    setCheerAlertVisible(true);
    setTimeout(() => setCheerAlertVisible(false), 2400);
  };

  const handleStartLaunch = async () => {
    if (!walletConnected) {
      onOpenWallet();
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);
    setGoogleSheetsWarning(null);
    setGoogleSheetsUrl(null);
    setLaunchSuccess(false);
    setLaunchStep(1);
    let feeTransactionHash: `0x${string}` | undefined;
    let feeSubmittedHash: `0x${string}` | undefined;
    let launchTransactionHash: `0x${string}` | undefined;

    try {
      const normalizedHandle = normalizeTwitchLogin(handle);
      if (
        !normalizedHandle ||
        verifiedCreatorHandle !== normalizedHandle.toLowerCase()
      ) {
        throw new Error(
          "Search for and select a valid Twitch streamer before launching.",
        );
      }
      const provider = getInjectedProvider();
      if (!provider) {
        throw new Error(
          "A browser wallet is required to sign the launch transaction.",
        );
      }
      if (!walletAddress) {
        throw new Error("Connect a wallet before launching a token.");
      }

      const requestedFirstBuy =
        firstBuy === "none"
          ? 0
          : Number(firstBuy === "custom" ? customBuy : firstBuy);
      if (
        !Number.isFinite(requestedFirstBuy) ||
        requestedFirstBuy < 0 ||
        requestedFirstBuy > 5
      ) {
        throw new Error("First buy must be between 0 and 5 ETH.");
      }

      setLaunchStep(2);
      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      const from = accounts?.[0];
      if (!from) {
        throw new Error("No wallet account is available to sign the launch.");
      }
      if (from.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error(
          "The connected wallet changed. Reconnect and try again.",
        );
      }

      const launchInput = {
        account: from as `0x${string}`,
        name: name.trim() || `${handle} Coin`,
        symbol: ticker.replace(/^\$/, "").trim().toUpperCase() || "COIN",
        logo: imageUrl,
        description: description.trim(),
        website: website.trim() || undefined,
        twitter: xLink.trim() || undefined,
        firstBuyEth: requestedFirstBuy,
      };
      const launchFingerprint = JSON.stringify(launchInput);
      const feeStorageKey = `tipped:launch-fee:${from.toLowerCase()}`;
      const payLaunchFee = async (requirements: {
        value: bigint;
        gas: bigint;
      }) => {
        setLaunchStep(2);
        const clearRevertedFee = (error: unknown) => {
          if (
            !(error instanceof Error) ||
            !error.message.startsWith("The launch fee transfer reverted")
          )
            return;
          feeSubmittedHash = undefined;
          try {
            window.sessionStorage.removeItem(feeStorageKey);
          } catch {
            // Storage cleanup is best effort.
          }
        };
        let previousPayment: {
          fingerprint?: string;
          transactionHash?: `0x${string}`;
          submittedAt?: number;
        } | null = null;
        try {
          const stored = window.sessionStorage.getItem(feeStorageKey);
          previousPayment = stored
            ? (JSON.parse(stored) as {
                fingerprint?: string;
                transactionHash?: `0x${string}`;
                submittedAt?: number;
              })
            : null;
        } catch {
          previousPayment = null;
        }
        const previousHash = previousPayment?.transactionHash;
        if (
          previousPayment?.fingerprint === launchFingerprint &&
          typeof previousHash === "string" &&
          typeof previousPayment.submittedAt === "number" &&
          Date.now() - previousPayment.submittedAt < 24 * 60 * 60 * 1000
        ) {
          feeSubmittedHash = previousHash;
          try {
            await waitForTippedLaunchFee(previousHash);
          } catch (error) {
            clearRevertedFee(error);
            throw error;
          }
          feeTransactionHash = previousHash;
        } else {
          let payment: Awaited<ReturnType<typeof collectTippedLaunchFee>>;
          try {
            payment = await collectTippedLaunchFee(
              from as `0x${string}`,
              requirements,
              (transactionHash) => {
                feeSubmittedHash = transactionHash;
                try {
                  window.sessionStorage.setItem(
                    feeStorageKey,
                    JSON.stringify({
                      fingerprint: launchFingerprint,
                      transactionHash,
                      submittedAt: Date.now(),
                    }),
                  );
                } catch {
                  // The on-chain receipt remains authoritative if browser storage is unavailable.
                }
              },
            );
          } catch (error) {
            clearRevertedFee(error);
            throw error;
          }
          feeTransactionHash = payment.transactionHash;
          feeSubmittedHash = payment.transactionHash;
        }
        setLaunchStep(3);
      };
      const {
        hash: txHash,
        token: launchedToken,
        blockNumber,
      } = requestedFirstBuy > 0
        ? await launchAndBuyPonsV2(launchInput, payLaunchFee)
        : await launchPonsV2(launchInput, payLaunchFee);
      launchTransactionHash = txHash;
      try {
        window.sessionStorage.removeItem(feeStorageKey);
      } catch {
        // The launch has succeeded; storage cleanup is best effort.
      }
      if (!launchedToken) {
        throw new Error(
          `Launch transaction ${txHash} succeeded, but no token address was found in its receipt. The token was not saved.`,
        );
      }

      setLaunchStep(4);
      setLaunchSuccess(true);
      confetti({
        particleCount: 140,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#ff2d55", "#16e4df", "#ffffff"],
      });

      const newToken: TokenItem = {
        id: launchedToken || txHash,
        rank: 1,
        name: name || `${handle} Coin`,
        ticker: `$${ticker.replace(/^\$/, "") || "COIN"}`,
        creatorHandle: handle.startsWith("@") ? handle : `@${handle}`,
        creatorName: name.replace(" Coin", "") || handle,
        creatorAddress: from.toLowerCase(),
        creatorFeeRecipient: TIPPED_LAUNCH_FEE_RECIPIENT.toLowerCase(),
        creatorAvatar: imageUrl,
        imageUrl,
        marketCap: 0,
        volume24h: 0,
        priceChange24h: 0,
        age: "Just now",
        description,
        totalFeesPaid: 0,
        createdAt: Date.now(),
        launchBlock: Number(blockNumber),
        launchTxHash: launchTransactionHash,
      };

      const persistResponse = await fetch("/api/explore/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newToken,
          source: "tipped-launch",
          factoryAddress: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
          creatorAddress: from.toLowerCase(),
          creatorFeeRecipient: TIPPED_LAUNCH_FEE_RECIPIENT.toLowerCase(),
          launchBlock: Number(blockNumber),
          launchTxHash: launchTransactionHash,
        }),
      });
      if (!persistResponse.ok) {
        const payload = (await persistResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ||
            `Token launched, but database persistence failed (${persistResponse.status}).`,
        );
      }
      const persistPayload = (await persistResponse.json()) as {
        googleSheetsSync?: { synced?: boolean; error?: string; url?: string };
      };
      if (persistPayload.googleSheetsSync?.synced === false) {
        setGoogleSheetsWarning(
          persistPayload.googleSheetsSync.error ||
            "Google Sheets is not configured.",
        );
      }
      if (
        persistPayload.googleSheetsSync?.synced &&
        persistPayload.googleSheetsSync.url
      ) {
        setGoogleSheetsUrl(persistPayload.googleSheetsSync.url);
      }

      onTokenCreated(newToken);
      window.setTimeout(() => navigate(`/token/${newToken.id}`), 1600);
    } catch (error) {
      setLaunchStep(0);
      const message =
        error instanceof Error
          ? error.message
          : "Launch failed. Please try again.";
      const feeReverted = message.startsWith(
        "The launch fee transfer reverted",
      );
      setLaunchError(
        launchTransactionHash
          ? `Launch transaction ${launchTransactionHash} confirmed, but follow-up processing failed. ${feeTransactionHash ? `The launch fee was also paid (fee transaction ${feeTransactionHash}). ` : ""}${message}`
          : feeTransactionHash
            ? `The ${TIPPED_LAUNCH_FEE_ETH} ETH fee transfer confirmed, but the launch did not complete. The fee cannot be cancelled or refunded automatically (fee transaction ${feeTransactionHash}). ${message}`
            : feeSubmittedHash
              ? `${feeReverted ? "The fee transfer reverted" : "Fee transfer was submitted, but confirmation is still unknown"} (${feeSubmittedHash}); no launch transaction was submitted. ${message}`
              : message,
      );
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-10 max-w-6xl mx-auto w-full">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-[#151515] px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
      {/* Page Title & Explanation */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
          Launch token
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base max-w-2xl font-normal leading-relaxed">
          Launch a Pons V2 token for a Twitch creator. The{" "}
          {TIPPED_LAUNCH_FEE_ETH} ETH launch fee is paid in a separate
          transaction before the launch.
        </p>
      </div>

      {/* Dual Column Form + Mockup Layout */}
      <div className="rounded-3xl border border-zinc-700/80 p-5 sm:p-7 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left Column: Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Who gets tipped */}
          <section className="space-y-3" data-purpose="step-who-gets-tipped">
            <h2 className="text-sm font-bold text-white tracking-wide">
              Twitch creator
            </h2>
            <label className="block text-xs font-semibold text-gray-300">
              Twitch @channel
            </label>

            <div className="relative rounded-lg bg-[#202020] border border-[#23252e] focus-within:border-[#9146FF] transition-colors">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#bf94ff] text-sm">
                <TwitchIcon className="w-4 h-4 text-[#bf94ff]" />
              </div>
              <input
                type="text"
                value={handle}
                onFocus={() => setCreatorInputFocused(true)}
                onPaste={handleCreatorPaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void lookupTwitchCreator();
                  }
                }}
                onChange={(e) => {
                  setHandle(e.target.value);
                  setVerifiedCreatorHandle(null);
                  setCreatorSearchError(null);
                  setCreatorSuggestions([]);
                }}
                placeholder="kaicenat or a twitch.tv/ link"
                className="w-full bg-transparent pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none border-none font-mono"
              />
              {creatorInputFocused &&
                (creatorSuggestions.length > 0 ||
                  isSearchingCreators ||
                  creatorSearchError) && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-[#3a2c52] bg-[#17151f] shadow-2xl">
                    {isSearchingCreators && (
                      <div className="px-4 py-3 text-xs text-zinc-400">
                        Searching Twitch...
                      </div>
                    )}
                    {creatorSuggestions.map((creator) => (
                      <button
                        key={creator.handle}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectTwitchCreator(creator)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#241b32]"
                      >
                        {creator.avatar ? (
                          <img
                            src={creator.avatar}
                            alt={`${creator.name} profile`}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#9146FF] text-xs font-bold">
                            {creator.name[0]}
                          </div>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {creator.name}
                          </span>
                          <span className="block truncate text-xs text-[#bf94ff]">
                            @{creator.handle}
                            {creator.category ? ` · ${creator.category}` : ""}
                          </span>
                        </span>
                        {creator.isLive && (
                          <span className="text-[10px] font-bold uppercase text-red-400">
                            Live
                          </span>
                        )}
                      </button>
                    ))}
                    {creatorSearchError && (
                      <div className="px-4 py-3 text-xs text-amber-300">
                        {creatorSearchError}
                      </div>
                    )}
                  </div>
                )}
            </div>

            <p className="text-xs text-zinc-500 pt-0.5">
              Type username and click enter to select or paste a Twitch channel
              link or username. 85% of creator fees go to them directly as Bits
              & Subs.
            </p>
          </section>

          {/* Step 2: The coin */}
          <section className="space-y-4 pt-2" data-purpose="step-the-coin">
            <h2 className="text-sm font-bold text-white tracking-wide">
              Token details
            </h2>

            {/* Name & Ticker Fields Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Kai Cenat Coin"
                  className="w-full bg-[#202020] border border-[#23252e] rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-[#9146FF]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  Ticker
                </label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="KAI"
                  className="w-full bg-[#202020] border border-[#23252e] rounded-lg px-3.5 py-2 text-sm text-white uppercase focus:outline-none focus:border-[#9146FF] font-mono"
                />
              </div>
            </div>

            {/* Description Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">
                Description{" "}
                <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Why this Twitch streamer deserves a coin."
                className="w-full bg-[#202020] border border-[#23252e] rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#9146FF] resize-y"
              />
            </div>

            {/* Image Dropzone Area */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300">
                Image / Emote
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-[#23252e] hover:border-[#9146FF]/70 bg-[#202020] hover:bg-[#202020]/60 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center cursor-pointer transition-all group text-center"
              >
                {imageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={imageUrl || undefined}
                      alt="Coin preview"
                      className="w-16 h-16 rounded-xl object-cover border border-[#9146FF]/50 shadow-md group-hover:scale-105 transition-transform"
                    />
                    <span className="text-xs text-[#bf94ff] font-medium">
                      Click to replace image
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="w-11 h-11 rounded-lg bg-[#1b1d26] border border-[#23252e] flex items-center justify-center text-[#bf94ff] mb-3 group-hover:scale-105 transition-transform">
                      <ImageIcon className="w-5 h-5 text-[#bf94ff]" />
                    </div>
                    <div className="text-xs font-semibold text-white mb-1">
                      Drop the coin image or click to choose
                    </div>
                    <div className="text-[11px] text-zinc-500 max-w-sm">
                      PNG, JPEG, WebP or GIF · stream emotes & square avatars
                      work best
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Website and X Links Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  Website{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full bg-[#202020] border border-[#23252e] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#9146FF]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  X / Twitter{" "}
                  <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={xLink}
                  onChange={(e) => setXLink(e.target.value)}
                  className="w-full bg-[#202020] border border-[#23252e] rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#9146FF]"
                />
              </div>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Shown on the coin's Pons page. Prefilled with Tpaid's own; replace
              them with the streamer's or clear them.
            </p>
          </section>

          {/* Step 3: Your first buy */}
          <section className="space-y-3 pt-3" data-purpose="step-first-buy">
            <h2 className="text-base font-bold text-white tracking-wide">
              3 · Your first buy{" "}
              <span className="text-gray-500 font-normal text-sm">
                (optional)
              </span>
            </h2>

            {/* Buy Amount Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFirstBuy("none")}
                className={`font-semibold text-xs px-4 py-2 rounded-full transition-all cursor-pointer ${
                  firstBuy === "none"
                    ? "bg-[#9146FF] text-white shadow-md shadow-purple-950/40"
                    : "bg-[#202020] hover:bg-[#1c1d27] border border-[#23252e] text-white"
                }`}
              >
                None
              </button>

              {["0.05", "0.1", "0.5"].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setFirstBuy(amt)}
                  className={`text-xs px-4 py-2 rounded-full transition-colors cursor-pointer ${
                    firstBuy === amt
                      ? "bg-[#9146FF] text-white font-semibold shadow-md shadow-purple-950/40"
                      : "bg-[#202020] hover:bg-[#1c1d27] border border-[#23252e] text-white"
                  }`}
                >
                  {amt} ETH
                </button>
              ))}

              {/* Custom ETH Input */}
              <div
                onClick={() => setFirstBuy("custom")}
                className={`flex items-center bg-[#202020] border rounded-full px-3 py-1.5 text-xs cursor-pointer ${
                  firstBuy === "custom"
                    ? "border-[#9146FF]"
                    : "border-[#23252e]"
                }`}
              >
                <input
                  type="text"
                  value={customBuy}
                  onChange={(e) => {
                    setCustomBuy(e.target.value);
                    setFirstBuy("custom");
                  }}
                  className="w-12 bg-transparent text-white text-xs border-none p-0 focus:outline-none focus:ring-0 text-center font-mono"
                />
                <span className="text-gray-400 pl-1">ETH</span>
              </div>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Fires on Robinhood Chain right after the create and fee routing
              land on ponsfamily, so you are the first holder. Max 5 ETH.
            </p>
          </section>

          {/* Primary Action Button */}
          <div>
            <button
              type="button"
              onClick={handleStartLaunch}
              disabled={isLaunching}
              className="w-full bg-[#9146FF] hover:bg-[#772ce8] active:scale-[0.99] text-white font-bold py-3.5 px-6 rounded-full text-sm sm:text-base tracking-wide shadow-lg shadow-purple-950/50 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span> Launch</span>
              <ArrowRight size={16} />
            </button>
            {launchError && (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm leading-relaxed text-red-200"
              >
                {launchError}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Twitch Stream & Chat Mockup */}
        <div className="lg:col-span-5 flex flex-col items-center justify-start space-y-6 lg:pl-4">
          <div className="w-full max-w-[360px] rounded-3xl border border-zinc-700 bg-[#202020] p-5 shadow-xl">
            <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[#0d0d0d]">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={name || "Token"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-zinc-500" />
              )}
            </div>
            <div className="text-xl font-bold text-white">
              {name || "Your token"}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
              <span>{ticker || "SYMBOL"}</span>
              <span className="rounded-full bg-zinc-700 px-1.5 py-0.5">
                Paired ETH
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              )}
              <TwitchIcon className="h-3.5 w-3.5 text-[#bf94ff]" />
              <span>@{handle || "streamer"}</span>
            </div>
            {description && (
              <p className="mt-4 line-clamp-4 text-xs leading-relaxed text-zinc-400">
                {description}
              </p>
            )}
            <div className="mt-5 space-y-3 border-t border-zinc-700 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Tpaid launch fee</span>
                <strong className="text-white">
                  {TIPPED_LAUNCH_FEE_ETH} ETH
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Pons launch fee</span>
                <strong className="text-white">0.0005 ETH</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Paired with</span>
                <strong className="text-white">ETH</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Trade fee</span>
                <strong className="text-white">1.00%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Graduation</span>
                <strong className="text-white">4.2 ETH</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Liquidity</span>
                <strong className="text-white">Locked</strong>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[360px] flex flex-col items-center">
            {/* Twitch Stream Mockup Window */}
            <div className="stream-mockup hidden w-full h-[580px] bg-[#0e0c15] rounded-[24px] overflow-hidden flex-col relative select-none border border-[#2c2242] shadow-2xl">
              {/* Twitch Stream Header Bar */}
              <div className="px-3.5 py-2.5 bg-[#181424] border-b border-[#2d2442] flex items-center justify-between z-20">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-800 border border-[#9146FF]/50 shrink-0">
                    <img
                      src={imageUrl || undefined}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-white flex items-center gap-1 leading-tight">
                      <span className="truncate">{handle || "streamer"}</span>
                      <TwitchIcon className="w-2.5 h-2.5 text-[#bf94ff] shrink-0" />
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight">
                      Playing ponsfamily
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-white animate-ping" />{" "}
                    LIVE
                  </span>
                  <button
                    onClick={() => setIsFollowing(!isFollowing)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      isFollowing
                        ? "bg-zinc-800 text-zinc-300"
                        : "bg-[#9146FF] text-white hover:bg-[#772ce8]"
                    }`}
                  >
                    {isFollowing ? "Followed" : "Follow"}
                  </button>
                </div>
              </div>

              {/* Video Area */}
              <div className="h-56 bg-black relative flex items-center justify-center overflow-hidden border-b border-[#2d2442]">
                <img
                  src={imageUrl || undefined}
                  alt="Stream frame"
                  className="w-full h-full object-cover opacity-60 filter blur-[0.5px]"
                />

                {/* Center Spinning Token Badge */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-28 h-28 rounded-full border-2 border-[#9146FF]/60 shadow-[0_0_25px_#9146FF] overflow-hidden bg-black/40 backdrop-blur-sm flex items-center justify-center p-1">
                    <img
                      src={imageUrl || undefined}
                      alt="Coin emblem"
                      className="w-full h-full rounded-full object-cover animate-spin-slow"
                      style={{ animation: "spin 20s linear infinite" }}
                    />
                  </div>
                </div>

                {/* Live Bits Cheer Notification Overlay */}
                {cheerAlertVisible && (
                  <div className="absolute top-3 left-3 right-3 bg-[#9146FF]/95 text-white px-3 py-1.5 rounded-lg border border-purple-300/40 text-xs font-bold text-center shadow-lg animate-bounce flex items-center justify-center gap-1.5">
                    <span>💎</span> Tpaid creator-fee activity
                  </div>
                )}

                {/* Bottom Overlay Info on Video */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white/90 bg-black/60 backdrop-blur-md px-2 py-1 rounded">
                  <span className="font-mono font-bold text-[#bf94ff]">
                    {ticker || "$COIN"}
                  </span>
                  <span className="text-zinc-300">42,891 viewers</span>
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <Volume2 className="w-3 h-3" /> Live
                  </span>
                </div>
              </div>

              {/* Twitch Stream Chat Section */}
              <div className="flex-1 flex flex-col bg-[#0e0c15] text-[11px] p-3 justify-between">
                <div className="text-[10px] uppercase font-bold text-zinc-400 border-b border-zinc-800 pb-1.5 mb-2 flex items-center justify-between">
                  <span>STREAM CHAT</span>
                  <span className="text-[#bf94ff] font-mono">
                    bits: {bitsCheered.toLocaleString()}
                  </span>
                </div>

                {/* Chat Feed */}
                <div className="space-y-1.5 flex-1 overflow-hidden font-sans">
                  <div className="leading-tight text-zinc-300">
                    <span className="font-bold text-[#bf94ff]">pons_bot:</span>{" "}
                    <span>{ticker || "$COIN"} deployed on ponsfamily! 🚀</span>
                  </div>

                  <div className="leading-tight p-1.5 rounded bg-[#1f1633] border border-[#9146FF]/30 text-white">
                    <span className="text-[10px] text-[#bf94ff] font-bold block">
                      💎 TPAID NOTIFICATION
                    </span>
                    <span className="text-zinc-200">
                      85% creator rewards route directly to{" "}
                      <strong>@{handle || "streamer"}</strong> as Bits!
                    </span>
                  </div>

                  <div className="leading-tight text-zinc-300">
                    <span className="font-bold text-emerald-400">
                      cryptowhale:
                    </span>{" "}
                    <span>Just aped 1 SOL on ponsfamily LETS GOOO</span>
                  </div>

                  <div className="leading-tight text-zinc-300">
                    <span className="font-bold text-amber-400">
                      stream_mod:
                    </span>{" "}
                    <span>W token split! 15% burns $TPAID 🔥</span>
                  </div>
                </div>

                {/* Interactive Cheer & Chat Input */}
                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  <button
                    onClick={handleCheerBits}
                    className="w-full bg-[#1e1430] hover:bg-[#281b40] border border-[#9146FF]/40 text-[#bf94ff] text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <TwitchBitsIcon className="w-3.5 h-3.5 text-[#bf94ff]" />
                    <span>Test Cheer 500 Bits to @{handle || "streamer"}</span>
                  </button>

                  <div className="flex items-center bg-[#151220] border border-zinc-800 rounded-lg px-2 py-1 text-zinc-500 text-[10px]">
                    <span className="truncate">
                      Send a message to stream chat...
                    </span>
                    <Send className="w-3 h-3 ml-auto text-zinc-600" />
                  </div>
                </div>
              </div>
            </div>

            <span className="text-xs text-zinc-500 font-medium mt-3">
              Live stream & chat preview
            </span>
          </div>

          {/* WHEN YOU SIGN Card */}
          <div
            className="w-full max-w-[360px] bg-[#202020] border border-[#23252e] rounded-2xl p-5 space-y-4"
            data-purpose="when-you-sign-explainer"
          >
            <div className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">
              LAUNCH FLOW
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#201830] border border-[#9146FF]/60 flex items-center justify-center text-[10px] font-bold text-[#bf94ff] shrink-0 mt-0.5">
                  1
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  First pay {TIPPED_LAUNCH_FEE_ETH} ETH to the Tpaid wallet.
                  After it confirms, approve the separate Pons launch
                  transaction. The fee is not refundable if launch fails.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#201830] border border-[#9146FF]/60 flex items-center justify-center text-[10px] font-bold text-[#bf94ff] shrink-0 mt-0.5">
                  2
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  <strong className="text-white font-semibold">
                    {ticker
                      ? ticker.startsWith("$")
                        ? ticker
                        : `$${ticker}`
                      : "$COIN"}
                  </strong>{" "}
                  goes live on ponsfamily. Every buy and sell pays a creator fee
                  into that account.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#201830] border border-[#9146FF]/60 flex items-center justify-center text-[10px] font-bold text-[#bf94ff] shrink-0 mt-0.5">
                  3
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Tpaid tracks creator fees from live Pons V2 activity for the
                  designated fee recipient.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Signing Progress Modal */}
      {isLaunching && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111116] border border-purple-900/60 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <TwitchIcon className="w-5 h-5 text-[#9146FF]" />
                <h3 className="font-bold text-white text-base">
                  Launching {ticker || "$COIN"} on ponsfamily
                </h3>
              </div>
              {launchSuccess && (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Live on ponsfamily!
                </span>
              )}
            </div>

            <div className="space-y-4">
              {/* Step 1: service fee */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      launchStep > 2
                        ? "bg-emerald-500 text-black"
                        : launchStep === 2
                          ? "bg-[#9146FF] text-white animate-spin"
                          : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {launchStep > 2 ? "✓" : "1"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Pay Tpaid launch fee
                    </div>
                    <div className="text-xs text-zinc-400">
                      {TIPPED_LAUNCH_FEE_ETH} ETH to the Tpaid wallet
                    </div>
                  </div>
                </div>
                {launchStep === 2 && (
                  <span className="text-xs text-[#bf94ff] animate-pulse">
                    Confirming...
                  </span>
                )}
              </div>

              {/* Step 2: token launch */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      launchStep > 3
                        ? "bg-emerald-500 text-black"
                        : launchStep === 3
                          ? "bg-[#9146FF] text-white animate-spin"
                          : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {launchStep > 3 ? "✓" : "2"}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Launch token
                    </div>
                    <div className="text-xs text-zinc-400">
                      Confirm the Pons transaction
                      {firstBuy !== "none"
                        ? ` and ${firstBuy === "custom" ? customBuy : firstBuy} ETH first buy`
                        : ""}
                    </div>
                  </div>
                </div>
                {launchStep === 3 && (
                  <span className="text-xs text-[#bf94ff] animate-pulse">
                    Confirming...
                  </span>
                )}
              </div>
            </div>

            {launchSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-300">
                🎉 Coin created and routed! Redirecting to Explore...
              </div>
            )}
            {googleSheetsWarning && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-center text-xs text-amber-200">
                Token launch succeeded, but its shared Google Sheet row was not
                synced: {googleSheetsWarning}
              </div>
            )}
            {googleSheetsUrl && (
              <a
                href={googleSheetsUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-[#bf94ff] underline"
              >
                Open the shared token spreadsheet
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
