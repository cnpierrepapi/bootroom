// Supported browser wallets for BOOTS purchases (devnet). Kept minimal — the
// purchase flow in lib/deposit.ts detects the injected provider by name.
export type WalletName = "Phantom" | "Solflare" | "Backpack";
export const WALLETS: WalletName[] = ["Phantom", "Solflare", "Backpack"];
