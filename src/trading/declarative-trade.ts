/**
 * Declarative Trade Example
 * 
 * Demonstrates how to request a quote for a declarative swap using the DFlow Trade API.
 * Declarative swaps allow for less slippage and better pricing by deferring route
 * calculation until execution time.
 * 
 * Based on: https://pond.dflow.net/quickstart/swap-tokens-declarative
 */

import 'dotenv/config';
import { Keypair, Transaction, Connection } from '@solana/web3.js';

// Token mint addresses
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// API configuration
const AGGREGATOR_API_BASE_URL = process.env.DFLOW_QUOTE_API_URL;
const API_KEY = process.env.DFLOW_API_KEY;
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Order status constants
const ORDER_STATUS = {
  CLOSED: 'CLOSED',
  PENDING_CLOSE: 'PENDING_CLOSE',
  OPEN_EXPIRED: 'OPEN_EXPIRED',
  OPEN_FAILED: 'OPEN_FAILED',
} as const;

type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

interface Fill {
  qtyIn: bigint;
  qtyOut: bigint;
}

interface MonitorOrderResult {
  status: OrderStatus;
  fills: Fill[];
  transactionError?: string;
}

interface MonitorOrderParams {
  connection: Connection;
  intent: { openTransaction: string };
  signedOpenTransaction: Transaction;
  submitIntentResponse: unknown;
}

// Declare monitorOrder function - should be imported from DFlow SDK
declare function monitorOrder(params: MonitorOrderParams): Promise<MonitorOrderResult>;

/**
 * Request a quote for a declarative swap
 * 
 * @param inputMint - Input token mint address
 * @param outputMint - Output token mint address
 * @param amount - Amount to swap (in smallest unit, e.g., lamports for SOL)
 * @param slippageBps - Slippage tolerance in basis points
 * @param userPublicKey - User's Solana public key
 * @returns Quote response from the API
 */
async function requestQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number,
  userPublicKey: string
) {
  const queryParams = new URLSearchParams();
  queryParams.append('inputMint', inputMint);
  queryParams.append('outputMint', outputMint);
  queryParams.append('amount', amount.toString());
  queryParams.append('userPublicKey', userPublicKey);
  queryParams.append('slippageBps', slippageBps.toString());

  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }

  const response = await fetch(
    `${AGGREGATOR_API_BASE_URL}/intent?${queryParams.toString()}`,
    { headers }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to request quote: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Signs an intent transaction
 * 
 * @param intentData - Intent data containing the openTransaction in base64 format
 * @param keypair - The keypair to sign the transaction with
 * @returns The signed transaction
 */
function signIntent(
  intentData: { openTransaction: string },
  keypair: Keypair
): Transaction {
  const transaction = intentData.openTransaction;
  const transactionBytes = Buffer.from(transaction, "base64");
  const openTransaction = Transaction.from(transactionBytes);

  openTransaction.sign(keypair);

  return openTransaction;
}

/**
 * Submits a signed intent transaction
 * 
 * @param intentData - Intent data from the quote response
 * @param openTransaction - The signed transaction
 * @returns The submit intent response
 */
async function submitIntent(
  intentData: { openTransaction: string },
  openTransaction: Transaction
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["x-api-key"] = API_KEY;
  }

  const response = await fetch(`${AGGREGATOR_API_BASE_URL}/submit-intent`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quoteResponse: intentData,
      signedOpenTransaction: Buffer.from(openTransaction.serialize()).toString(
        "base64"
      ),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to submit intent: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Main function
 * 
 * Demonstrates requesting a quote for swapping SOL to USDC
 */
async function main() {
  // Load keypair (using default Solana CLI location for simplicity)
  // In production, use a secure keypair loading method
  const keypair = Keypair.generate(); // For demo purposes - use your actual keypair

  // Create Solana connection
  const connection = new Connection(RPC_URL, 'confirmed');

  // Trade parameters
  const amount = 1_000_000_000; // 1 SOL in lamports
  const slippageBps = 1; // 0.01% slippage tolerance

  console.log('Requesting quote for declarative swap...');
  console.log(`Input: ${amount} lamports of SOL`);
  console.log(`Output: USDC`);
  console.log(`Slippage: ${slippageBps} bps\n`);

  const quote = await requestQuote(
    SOL,
    USDC,
    amount,
    slippageBps,
    keypair.publicKey.toBase58()
  );

  console.log('Quote received:');
  console.log(JSON.stringify(quote, null, 2));

  const intentData = quote as { openTransaction: string };
  const signedTransaction = signIntent(intentData, keypair);
  console.log('\nTransaction signed successfully');

  const submitIntentData = await submitIntent(intentData, signedTransaction);
  console.log('\nIntent submitted successfully:');
  console.log(JSON.stringify(submitIntentData, null, 2));

  const result = await monitorOrder({
    connection,
    intent: intentData,
    signedOpenTransaction: signedTransaction,
    submitIntentResponse: submitIntentData,
  });

  switch (result.status) {
    case ORDER_STATUS.CLOSED: {
      if (result.fills.length > 0) {
        // Order was filled and closed
        const qtyIn = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyIn, 0n);
        const qtyOut = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyOut, 0n);
        console.log(`Order succeeded: sent ${qtyIn}, received ${qtyOut}`);
      } else {
        // Order was closed without any fills
        console.log("Order failed");
      }
      break;
    }
    case ORDER_STATUS.PENDING_CLOSE: {
      if (result.fills.length > 0) {
        // Order was filled and is now closable
        const qtyIn = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyIn, 0n);
        const qtyOut = result.fills.reduce((acc: bigint, x: Fill) => acc + x.qtyOut, 0n);
        console.log(`Order succeeded: sent ${qtyIn}, received ${qtyOut}`);
      } else {
        // Order was not filled and is now closable
        console.log("Order failed");
      }
      break;
    }
    case ORDER_STATUS.OPEN_EXPIRED: {
      // Transaction to open the order expired
      console.log(
        "Transaction expired. Try again with a higher slippage tolerance."
      );
      break;
    }
    case ORDER_STATUS.OPEN_FAILED: {
      // Transaction to open the order was executed and failed
      console.log("Order failed", result.transactionError);
      break;
    }
  }
}

// Run the main function
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
