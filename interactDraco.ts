import fetch from "node-fetch";
import { checkAgentExists } from "../firebase.js"; 
import { getAgentData } from "../firebase.js";

// API and API Key for Bitquery
const BITQUERY_API_URL = "https://streaming.bitquery.io/eap";
const BITQUERY_API_KEY = "YOUR_API_KEY";

// Interface to define the structure of TokenSupplyUpdate
interface TokenSupplyUpdate {
  Marketcap: string;  // Market cap in USD
  Currency: {
    Symbol: string;  // Token symbol (e.g., BTC, ETH)
    MintAddress: string;  // Token's mint address
  };
}

// Interface for BalanceUpdate
interface BalanceUpdate {
  Account: {
    Address: string;  // Account address of the holder
  };
  Holding: string;  // Amount of token held
}

// Interface for Trade Currency (optional fields)
interface TradeCurrency {
  Name?: string;  // Token name
  MintAddress?: string;  // Token mint address
  Symbol?: string;  // Token symbol
}

// Interface for DEXTrade, includes the Buy currency
interface DEXTrade {
  Currency: TradeCurrency;  // Trade currency (buy or sell)
}

// Generic interface for Bitquery API responses
interface BitqueryResponse<T> {
  data?: {
    Solana?: T;
  };
}

/**
 * Formats the market cap into human-readable format (K/M).
 * @param value The market cap value in USD (string).
 * @returns The formatted market cap (e.g., "1M", "500K").
 */
function formatMarketcap(value: string): string {
  const num = parseFloat(value);
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(0)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`;
  }
  return num.toFixed(0);
}

/**
 * Fetches market cap data for a token using Bitquery.
 * @param agentName The name of the agent requesting data.
 * @param count The number of results to fetch (max 30).
 * @param term The search term (Mint Address) for the token.
 */
async function fetchMarketcap(agentName: string, count: number, term: string): Promise<void> {
  if (count > 30) count = 30;  // Limit count to 30

  const query = `
  query MyQuery {
    Solana {
      TokenSupplyUpdates(
        where: {TokenSupplyUpdate: {Currency: {MintAddress: {includes: "${term}"}}}}
        orderBy: {descending: Block_Time, descendingByField: "TokenSupplyUpdate_Marketcap"}
        limitBy: {by: TokenSupplyUpdate_Currency_MintAddress, count: 1}
        limit: {count: ${count}}
      ) {
        TokenSupplyUpdate {
          Marketcap: PostBalanceInUSD
          Currency {
            Symbol
            MintAddress
          }
        }
      }
    }
  }`;

  try {
    const response = await fetch(BITQUERY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": BITQUERY_API_KEY,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch market cap data: ${response.statusText}`);
    }

    const data = (await response.json()) as BitqueryResponse<{ TokenSupplyUpdates: { TokenSupplyUpdate: TokenSupplyUpdate }[] }>;
    const updates = data?.data?.Solana?.TokenSupplyUpdates || [];

    if (updates.length === 0) {
      console.log(`No results found for term: "${term}"`);
      return;
    }

    console.log(`Marketcap Data for term: "${term}":`);
    updates.forEach(({ TokenSupplyUpdate }) => {
      const marketcap = formatMarketcap(TokenSupplyUpdate.Marketcap);
      const symbol = TokenSupplyUpdate.Currency.Symbol;
      const mintAddress = TokenSupplyUpdate.Currency.MintAddress;

      console.log(`${symbol} | ${mintAddress} | Marketcap: ${marketcap}`);
    });
  } catch (error) {
    console.error("Error fetching market cap data from Bitquery:", error);
  }
}

/**
 * Fetches top holders for a specific token using Bitquery.
 * @param agentName The name of the agent requesting data.
 * @param mintAddress The mint address of the token.
 */
async function fetchTopHolders(agentName: string, mintAddress: string): Promise<void> {
  const query = `
  query MyQuery {
    Solana(dataset: realtime) {
      BalanceUpdates(
        limit: { count: 10 }
        orderBy: { descendingByField: "BalanceUpdate_Holding_maximum" }
        where: {
          BalanceUpdate: {
            Currency: {
              MintAddress: { is: "${mintAddress}" }
            }
          }
          Transaction: { Result: { Success: true } }
        }
      ) {
        BalanceUpdate {
          Account {
            Address
          }
          Holding: PostBalance(maximum: Block_Slot)
        }
      }
    }
  }
  `;

  try {
    const response = await fetch(BITQUERY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": BITQUERY_API_KEY,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch top holders: ${response.statusText}`);
    }

    const data = (await response.json()) as BitqueryResponse<{ BalanceUpdates: { BalanceUpdate: BalanceUpdate }[] }>;
    const balanceUpdates = data?.data?.Solana?.BalanceUpdates || [];

    if (balanceUpdates.length === 0) {
      console.log(`No top holders found for MintAddress: ${mintAddress}`);
      return;
    }

    console.log(`Fetching top 10 holders for: ${mintAddress}`);
    balanceUpdates.forEach(({ BalanceUpdate }) => {
      const address = BalanceUpdate?.Account?.Address || "Unknown Address";
      const holding = BalanceUpdate?.Holding ? parseFloat(BalanceUpdate.Holding).toFixed(6) : "0.000000";

      console.log(`${address} | Holdings: ${holding}`);
    });
  } catch (error) {
    console.error("Error fetching top holders from Bitquery:", error);
  }
}

/**
 * Fetches the first top buyers for a specific token using Bitquery.
 * @param agentName The name of the agent requesting data.
 * @param mintAddress The mint address of the token.
 * @param count The number of top buyers to fetch.
 */
async function fetchFirstTopBuyers(agentName: string, mintAddress: string, count: number): Promise<void> {
  const query = `
  query MyQuery {
    Solana {
      DEXTrades(
        where: {
          Trade: {
            Buy: {
              Currency: {
                MintAddress: { is: "${mintAddress}" }
              }
            }
          }
        }
        limit: { count: ${count} }
        orderBy: { ascending: Block_Time }
      ) {
        Trade {
          Buy {
            Amount
            Account {
              Token {
                Owner
              }
            }
          }
        }
      }
    }
  }`;

  try {
    const response = await fetch(BITQUERY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": BITQUERY_API_KEY,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch top buyers: ${response.statusText}`);
    }

    const data = (await response.json()) as BitqueryResponse<{ DEXTrades: { Trade: { Buy: { Amount: string; Account: { Token: { Owner: string } } } } }[] }>;
    const trades = data?.data?.Solana?.DEXTrades || [];

    if (trades.length === 0) {
      console.log(`No top buyers found for MintAddress: ${mintAddress}`);
      return;
    }

    console.log(`Top ${count} buyers for: ${mintAddress}`);
    trades.forEach(({ Trade }) => {
      const amount = Trade.Buy.Amount;
      const owner = Trade.Buy.Account.Token.Owner;

      console.log(`Amount: ${amount} | Owner: ${owner}`);
    });
  } catch (error) {
    console.error("Error fetching top buyers from Bitquery:", error);
  }
}

/**
 * Fetches trending tokens for Solana using Bitquery.
 * @param agentName The name of the agent requesting data.
 */
async function fetchTrendingTokens(agentName: string): Promise<void> {
  const query = `
query MyQuery {
  Solana {
    DEXTradeByTokens(
      where: {Transaction: {Result: {Success: true}}, Trade: {Side: {Currency: {MintAddress: {is: "So11111111111111111111111111111111111111112"}}}}, Block: {Time: {since: "2024-08-15T04:19:00Z"}}}
      orderBy: {}
      limit: {count: 5}
    ) {
      Trade {
        Currency {
          Name
          MintAddress
          Symbol
        }
        start: PriceInUSD
        min5: PriceInUSD(
          minimum: Block_Time
          if: {Block: {Time: {after: "2024-08-15T05:14:00Z"}}}
        )
        end: PriceInUSD(maximum: Block_Time)
        Side {
          Currency {
            Symbol
            Name
            MintAddress
          }
        }
      }
    }
  }
}
  `;

  try {
    const response = await fetch(BITQUERY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": BITQUERY_API_KEY,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch trending tokens: ${response.statusText}`);
    }

    const data = (await response.json()) as BitqueryResponse<{ DEXTradeByTokens: { Trade: DEXTrade }[] }>;
    const trades = data?.data?.Solana?.DEXTradeByTokens || [];

    if (trades.length === 0) {
      console.log("No trending tokens found.");
      return;
    }

    console.log("Top 5 Trending Tokens 24h:");
    trades.forEach(({ Trade }) => {
      const name = Trade.Currency.Name || "Unknown Token";
      const mintAddress = Trade.Currency.MintAddress || "Unknown Address";

      console.log(`${mintAddress} | ${name}`);
    });
  } catch (error) {
    console.error("Error fetching trending tokens from Bitquery:", error);
  }
}

/**
 * Interacts with the agent to answer questions based on the type of query.
 * @param agentName The name of the agent.
 * @param question The question asked to the agent.
 */
async function interactAgent(agentName: string, question: string): Promise<void> {
  const hasMarketcapKeywords = /Marketcap/i.test(question);
  const hasTrendingKeywords = /Trending/i.test(question);
  const hasTopHoldersKeywords = /Top.*holders/i.test(question);
  const hasTopBuyersKeywords = /First.*top.*buyers/i.test(question);

  // Check if the agent exists in the system
  const agentExists = await checkAgentExists(agentName);

  if (!agentExists) {
      console.error(`Cannot process request. Agent "${agentName}" is not registered.`);
      return;
  }

  const agentData = await getAgentData(agentName); // Retrieve agent data
  const personality = agentData?.personality || "neutral"; // Default to "neutral" if not set

  // Process market cap query
  if (hasMarketcapKeywords) {
    const countMatch = question.match(/count:\s*(\d+)/i);
    const termMatch = question.match(/term:\s*"([^"]+)"/i);
    const count = countMatch ? parseInt(countMatch[1], 10) : 10;
    const term = termMatch ? termMatch[1] : "";

    if (term) {
      await fetchMarketcap(agentName, count, term);
    } else {
      console.log("Please provide a valid search term.");
    }
  }
  // Process top holders query
  else if (hasTopHoldersKeywords) {
    const mintAddressMatch = question.match(/[A-Za-z0-9]{32,44}/);
    if (mintAddressMatch) {
      const mintAddress = mintAddressMatch[0];
      await fetchTopHolders(agentName, mintAddress);
    } else {
      console.log("Please provide a valid MintAddress in the question.");
    }
  }
  // Process top buyers query
  else if (hasTopBuyersKeywords) {
    const mintAddressMatch = question.match(/[A-Za-z0-9]{32,44}/);
    const countMatch = question.match(/First.*top\s*(\d+)/i);
    const count = countMatch ? parseInt(countMatch[1], 10) : 10;

    if (mintAddressMatch) {
      const mintAddress = mintAddressMatch[0];
      await fetchFirstTopBuyers(agentName, mintAddress, count);
    } else {
      console.log("Please provide a valid MintAddress in the question.");
    }
  }
  // Process trending tokens query
  else if (hasTrendingKeywords) {
    await fetchTrendingTokens(agentName);
  } else {
    console.log(`Unsupported question: "${question}"`);
  }
}

// Command line arguments and entry point
const args = process.argv.slice(2);
if (args.length < 3 || args[1] !== "ask") {
  console.error('Usage: npm run interact {agent_name} ask "Your question"');
  process.exit(1);
}

const agentName = args[0];
const question = args.slice(2).join(" ");

// Call the function to interact with the agent
interactAgent(agentName, question).catch((error) => {
  console.error("An error occurred:", error);
});
