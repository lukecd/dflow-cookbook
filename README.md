# DFlow Cookbook

A collection of code recipes to get you up and running with DFlow quickly.

## Setup

### Solana Private Key

For scripts that require signing transactions, export the `SOLANA_PRIVATE_KEY` environment variable.

Format: Base58 string (e.g., `'YourBase58PrivateKeyHere'`) or JSON array (e.g., `[1,2,3,...]`)

**Note**: The private key contains both the private and public key. You don't need to provide the public key separately.

Example:
```bash
export SOLANA_PRIVATE_KEY='YourBase58PrivateKeyHere'
npm run dev src/trading/imperative-trade.ts
```

## Scripts

- `src/prediction-markets/discover-prediction-markets.ts` — fetch and print prediction market events, active/initialized markets, tags, and filtered series.
- `src/trading/declarative-trade.ts` — request a quote, sign, submit, and monitor a declarative trade intent.
- `src/trading/imperative-trade.ts` — GET /order, sign transaction, and submit to Solana RPC (requires `SOLANA_PRIVATE_KEY`).