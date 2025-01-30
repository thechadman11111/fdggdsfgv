import { config } from "dotenv";
import { VersionedTransaction, Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fetch from "node-fetch";
import { checkAgentExists } from "../firebase.js";

// Load environment variables from .env file
config();

// Solana RPC endpoint
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
// Solana connection setup with confirmed commitment level
const web3Connection = new Connection(RPC_ENDPOINT, "confirmed");

/**
 * Sends a transaction for the specified agent via a portal.
 * This function checks if the agent exists, then retrieves trade details 
 * from environment variables to construct and send the transaction to the portal.
 * 
 * @param agentName The name of the agent requesting the transaction.
 * @throws Throws an error if the private key is not set or is invalid.
 */
async function sendPortalTransaction(agentName: string) {
  // Check if the agent exists in the database
  const agentExists = await checkAgentExists(agentName);
  if (!agentExists) {
    console.error(`Error: No agent found with the name "${agentName}".`);
    return;
  }

  // Retrieve trade settings from environment variables
  const action = process.env.TRADE_ACTION || "buy";  // Default action is "buy"
  const mint = process.env.TRADE_MINT || "";  // Mint address of the token to trade
  const amount = parseInt(process.env.TRADE_AMOUNT || "1000");  // Amount to trade (default is 1000)

  // Retrieve the secret key from the environment variables (for signing the transaction)
  const secretKey = process.env.PK;
  if (!secretKey) {
    throw new Error("PK is not set in the .env file!");
  }

  // Decode the base58-encoded secret key
  const decodedSecretKey = bs58.decode(secretKey);

  // Check if the decoded secret key has the correct length (64 bytes)
  if (decodedSecretKey.length !== 64) {
    throw new Error("Invalid private key length! Ensure the key is correctly encoded in base58.");
  }

  // Create a Keypair from the decoded secret key for signing the transaction
  const signerKeyPair = Keypair.fromSecretKey(decodedSecretKey);

  // Make a POST request to the external portal API with the trade details
  const response = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      publicKey: signerKeyPair.publicKey.toBase58(),  // The public key of the signer
      action: action,  // Action to perform ("buy" or "sell")
      mint: mint,  // Mint address of the token
      denominatedInSol: "false",  // Whether the amount is denominated in SOL (false by default)
      amount: amount,  // Amount to trade
      slippage: 10,  // Slippage tolerance (10% by default)
      priorityFee: 0.00001,  // Priority fee for transaction (set by default)
      pool: "pump",  // The liquidity pool to interact with (set to "pump")
    }),
  });

  // If the response is successful (HTTP 200), deserialize the transaction and send it
  if (response.status === 200) {
    const data = await response.arrayBuffer();  // Get the transaction data as ArrayBuffer
    const tx = VersionedTransaction.deserialize(new Uint8Array(data));  // Deserialize the transaction

    // Sign the transaction with the private key and send it to the network
    tx.sign([signerKeyPair]);
    const signature = await web3Connection.sendTransaction(tx);
    console.log(`Transaction successful: https://solscan.io/tx/${signature}`);
  } else {
    console.error("Error:", response.statusText);  // Log an error if the response is not successful
  }
}

// Retrieve the agent name from command-line arguments
const agentName = process.argv[2];

// Ensure the agent name is provided as an argument
if (!agentName) {
  console.error("Error: Please provide the agent name as an argument.");
  process.exit(1);
}

// Call the function to send the portal transaction and catch any errors
sendPortalTransaction(agentName).catch((error) => {
  console.error("An error occurred:", error);
});
