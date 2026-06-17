"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { PropsWithChildren } from "react";
import { baseSepolia } from "wagmi/chains";
import { onchainKitConfig } from "../lib/onchainkit-config";

// Sepolia OnchainKit context for /onchain only. Chain switches for txs are
// handled per call (writeContract chainId); avoid switchChain here — it races
// wagmi's connection state and breaks signMessage with ConnectorChainMismatchError.
export function OnchainSepoliaProviders({ children }: PropsWithChildren) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={baseSepolia}
      config={onchainKitConfig}
    >
      {children}
    </OnchainKitProvider>
  );
}
