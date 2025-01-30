import { VersionedTransaction, Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import fs from "fs";
import fetch from "node-fetch";
import { agentDetails } from "./defineDraco.js";
import { checkAgentExists, storeAgent } from "../firebase.js";
dotenv.config();

const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";
const web3Connection = new Connection(RPC_ENDPOINT, "confirmed");

// Define the expected structure of the metadata response
interface MetadataResponse {
  metadata: {
    name: string;
    symbol: string;
  };
  metadataUri: string;
}

/**
 * Sends a local create transaction for an agent's token and metadata.
 * This includes checking if the agent already exists, uploading metadata, 
 * creating the token on Solana, and saving agent details to Firebase.
 */
async function sendLocalCreateTx() {
    const agentName = agentDetails.name;

    // Step 1: Check if the agent already exists in the system
    const agentExists = await checkAgentExists(agentName);
    if (agentExists) {
        console.error(`Agent "${agentName}" already exists. Please try another name.`);
        return;
    }

    // Step 2: Validate and decode private key for the signer
    const secretKey = process.env.PK;
    if (!secretKey) {
        throw new Error("PK is not set in the .env file! Please set your private key.");
    }
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode(secretKey));

    // Step 3: Generate a new mint keypair for the token
    const mintKeypair = Keypair.generate();

    // Step 4: Upload metadata to IPFS using form data
    const metadataResponseJSON = await uploadMetadata();

    // Step 5: Create the token on Solana with the metadata URI
    await createSolanaToken(signerKeyPair, mintKeypair, metadataResponseJSON);

    // Step 6: Store the agent details in Firebase
    await storeAgent(agentName, { 
        ...agentDetails, 
        mintAddress: mintKeypair.publicKey.toBase58(), 
        personality: agentDetails.personality 
    });

    console.log(`Agent "${agentName}" and mint address saved to Firebase.`);
}

/**
 * Uploads metadata (including image and description) to IPFS.
 * @returns The response from the metadata upload API, including metadata and URI.
 */
async function uploadMetadata(): Promise<MetadataResponse> {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    formData.append("file", fs.createReadStream(agentDetails.imagePath));
    formData.append("name", agentDetails.name);
    formData.append("symbol", agentDetails.symbol);

    const modifiedDescription = `${agentDetails.description}\n\nPowered by Draco`;
    formData.append("description", modifiedDescription);

    const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
        method: "POST",
        body: formData,
        headers: formData.getHeaders(),
    });

    if (!metadataResponse.ok) {
        throw new Error(`Failed to upload metadata: ${metadataResponse.statusText}`);
    }

    // Type casting the response to match the expected structure
    return metadataResponse.json() as Promise<MetadataResponse>;
}

/**
 * Creates a token on the Solana blockchain using the provided signer and mint keypair.
 * @param signerKeyPair - The keypair of the signer (agent owner)
 * @param mintKeypair - The keypair for the new token mint
 * @param metadataResponseJSON - The response containing the metadata URI
 */
async function createSolanaToken(signerKeyPair: Keypair, mintKeypair: Keypair, metadataResponseJSON: MetadataResponse) {
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: signerKeyPair.publicKey.toBase58(),
            action: "create",
            tokenMetadata: {
                name: metadataResponseJSON.metadata.name,
                symbol: metadataResponseJSON.metadata.symbol,
                uri: metadataResponseJSON.metadataUri,
            },
            mint: mintKeypair.publicKey.toBase58(),
            denominatedInSol: "true",
            amount: agentDetails.initialBuyAmount,
            slippage: 10,
            priorityFee: 0.0005,
            pool: "pump",
        }),
    });

    if (!response.ok) {
        throw new Error(`Error creating token: ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(data));
    tx.sign([mintKeypair, signerKeyPair]);

    // Send the transaction to the Solana network
    const signature = await web3Connection.sendTransaction(tx);

    console.log(`Transaction successful: https://solscan.io/tx/${signature}`);
}

/**
 * Main function to initiate the creation of the agent's token and metadata.
 */
sendLocalCreateTx().catch((error) => {
    console.error("An error occurred during deployment:", error.message || error);
});
