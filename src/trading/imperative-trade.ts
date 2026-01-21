/**
 * Imperative Trade Example
 *
 * Demonstrates the imperative swap flow:
 * 1. GET /order (with userPublicKey to receive transaction)
 * 2. Sign transaction
 * 3. Submit to Solana RPC
 */

import "dotenv/config";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
// @ts-ignore - bs58 types not available but package exists
import bs58 from "bs58";

const API_KEY = process.env.DFLOW_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TRADE_API_BASE_URL = process.env.DFLOW_TRADE_API_URL || "https://dev-quote-api.dflow.net";

// Get private key from environment variable
// Format: Base58 string (e.g., 'YourBase58PrivateKeyHere') or JSON array (e.g., [1,2,3,...])
function getKeypair(): Keypair {
    const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;

    if (!privateKeyStr) {
        throw new Error(
            "SOLANA_PRIVATE_KEY environment variable is required.\n" +
            "Format: Base58 string or JSON array, e.g., [1,2,3,...]"
        );
    }

    try {
        // Try JSON array format first
        if (privateKeyStr.trim().startsWith("[")) {
            const secretKey = new Uint8Array(JSON.parse(privateKeyStr));
            return Keypair.fromSecretKey(secretKey);
        } else {
            // Assume base58 format
            const secretKey = bs58.decode(privateKeyStr);
            return Keypair.fromSecretKey(secretKey);
        }
    } catch (error) {
        throw new Error(`Failed to parse private key: ${error}`);
    }
}

async function fetchOrder(params: {
    userPublicKey: string;
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
    dexes?: string[];
}): Promise<{ transaction: string }> {
    const dexesParam = params.dexes && params.dexes.length > 0 ? `&dexes=${params.dexes.join(",")}` : "";
    const url = `${TRADE_API_BASE_URL}/order?` +
        `inputMint=${params.inputMint}` +
        `&outputMint=${params.outputMint}` +
        `&amount=${params.amount}` +
        `&slippageBps=${params.slippageBps}` +
        `&userPublicKey=${params.userPublicKey}` +
        dexesParam;

    const headers: Record<string, string> = {};
    if (API_KEY) {
        headers["x-api-key"] = API_KEY;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch order. Status: ${response.statusText}. Error: ${errorText}`);
    }

    return (await response.json()) as { transaction: string };
}

async function sendTransaction(connection: Connection, tx: VersionedTransaction) {
    const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
    });

    console.log(`Transaction sent: ${signature}`);

    await connection.confirmTransaction(signature, "confirmed");
    console.log("Transaction confirmed");
}

async function main() {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const keypair = getKeypair();

    console.log("Imperative trade params:");
    console.log("  RPC:", SOLANA_RPC_URL);
    console.log("  Quote API:", process.env.TRADE_API_BASE_URL);
    console.log("  API key:", API_KEY ? `${API_KEY.slice(0, 4)}...` : "unset");
    console.log("  Wallet:", keypair.publicKey.toBase58());

    const inputMint = "So11111111111111111111111111111111111111112"; // SOL
    const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
    const inputAmount = 100000; // 0.0001 SOL (9 decimals)
    const slippageBps = 50; // 0.5%
    const dexes = ["Raydium AMM"]; // single venue for deterministic path

    console.log("Fetching order...");
    const order = await fetchOrder({
        userPublicKey: keypair.publicKey.toBase58(),
        inputMint,
        outputMint,
        amount: inputAmount,
        slippageBps,
        dexes,
    });

    console.log("Order received, signing transaction...");
    const transactionBuffer = Buffer.from(order.transaction, "base64");
    const tx = VersionedTransaction.deserialize(transactionBuffer);
    tx.sign([keypair]);

    console.log("Submitting transaction to Solana...");
    await sendTransaction(connection, tx);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
