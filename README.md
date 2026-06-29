# Ballbasket 🧺⚽

**Pin your teams. Score the matchday.**

Ballbasket is a trustless **sports-index** game for the World Cup, built on the
[TxLINE](https://txline.txodds.com) on-chain data layer. You build a *basket* of
national teams — like a tiny ETF — deposit USDC, and your basket's value rises or
falls with the **real, on-chain-verified match output** of the teams you picked.
At full-time you **cash out** your share or **roll over** into a fresh basket for
the next matchday.

> Submission for the TxLINE / TxODDS World Cup hackathon — **Track A: Prediction
> Markets & Settlement.**

## How it works

1. **Create a basket** — pick a handful of national teams (a sticky note on the board).
2. **Deposit USDC** — your stake locks into a neutral escrow PDA until the matchday ends.
3. **The matchday plays** — each basket is scored by the **mean** of its teams'
   performance, computed only from stats anchored on-chain by TxLINE.
4. **Settle trustlessly** — a keeper triggers settlement, which CPIs into TxLINE's
   `validate_stat` to prove every team's stats against the on-chain Merkle root.
   No oracle, no admin, no "trust us" — every settlement emits a verifiable receipt.
5. **Cash out or roll over** — take your share of the pool, or re-pick teams and ride
   into the next matchday.

## Scoring (objective, on-chain-provable)

A basket's score is the **mean** across its teams of a calibrated composite:

```
teamPoints = w₁·(goalsFor − goalsAgainst) + w₂·corners − w₃·cards
basketScore = mean(teamPoints over the basket's teams)
```

Every term reduces to one of the **8 stats TxLINE anchors on-chain** (goals,
corners, yellow cards, red cards — each per side), so the entire result is provable
via `validate_stat`. Taking the **mean** (not the sum) makes basket *selection* the
skill — adding a weak team drags your average down — rather than just stacking teams.

## TxLINE endpoints used

- `scores` SSE stream + `scores/snapshot` / `scores/updates` — live & historical match stats
- `fixtures/snapshot` — schedule, teams, kickoff times
- `validate_stat` (CPI) — trustless on-chain confirmation of basket-scoring inputs

## Stack

- Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript
- Solana (`@solana/web3.js`, Anchor) — USDC escrow + `validate_stat` settlement
- Deployed on Vercel

## Status

Hackathon build in progress. See the board at the deployed URL.
