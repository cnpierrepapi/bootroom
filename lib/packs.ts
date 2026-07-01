// BOOTS packs — buy BOOTS with devnet USDC. BOOTS are a non-redeemable buy-in
// currency (500 per extra punt beyond the 3 free ones); they can NEVER be
// withdrawn (that's the reward ledger's job — see the two-ledger split in the
// br_* schema). Prices/amounts live here so the buy UI, the on-chain verify
// route, and the ledger all agree on one source of truth.
//
// Tiers follow a geometric bonus curve: the Kit is the base rate; bigger bags
// give more BOOTS per dollar. Non-round prices are fine — USDC is 6-decimal, so
// $3.49 = 3_490_000 base units exactly (see packBaseUnits).
export type Pack = { id: string; tier: 1 | 2 | 3; usdc: number; boots: number; label: string; bonus?: string };

export const PACKS: Pack[] = [
  { id: "kit",   tier: 1, usdc: 3.49, boots: 7_000,  label: "Kit" },
  { id: "squad", tier: 2, usdc: 4.89, boots: 11_700, label: "Squad", bonus: "+19%" },
  { id: "club",  tier: 3, usdc: 7.69, boots: 39_200, label: "Club",  bonus: "+154%" },
];

export const USDC_DECIMALS = 6;
export const packById = (id: string): Pack | undefined => PACKS.find((p) => p.id === id);
// USDC base units (6 dp) for a pack — the exact amount the transfer must carry.
export const packBaseUnits = (p: Pack): number => Math.round(p.usdc * 10 ** USDC_DECIMALS);
