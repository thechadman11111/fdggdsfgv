import fetch from "node-fetch";
import { getAgentData } from "../firebase.js";
import { OpenAI } from "openai";
import * as dotenv from "dotenv";
dotenv.config();

const openAi = new OpenAI({ apiKey: process.env.AI_SERVICE_API_KEY });

/**
 * Validates the agent's existence and responds based on its personality.
 * @param agentName - Name of the agent to validate
 * @param userMessage - Message from the user
 */
async function validateAgentAndRespond(agentName: string, userMessage: string) {
  try {
    if (!agentName || !userMessage) {
      throw new Error('Both agent name and user message are required.');
    }

    // Fetch agent data
    const agentData = await getAgentData(agentName);

    if (!agentData) {
      console.error(`Error: Agent "${agentName}" does not exist or has no data.`);
      return;
    }

    // Make OpenAI API request
    const response = await openAi.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are ${agentName}, an AI agent with the following personality: "${agentData.personality}". Respond to the user based on this personality.`,
        },
        { role: "user", content: userMessage },
      ],
    });

    // Destructure response for better readability
    const { choices } = response;
    const agentReply = choices?.[0]?.message?.content || "I'm sorry, I couldn't process your request.";
    
    console.log(`Agent ${agentName}: ${agentReply}`);
  } catch (error: unknown) {
    // Type assertion for better error handling
    if (error instanceof Error) {
      console.error("Error generating response:", error.message);
    } else {
      console.error("Unknown error occurred:", error);
    }
  }
}

/**
 * Validates command-line arguments.
 * @returns {boolean} - Returns true if arguments are valid
 */
function validateArgs() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npm run askdraco {agent_name} "Your message here"');
    return false;
  }

  return true;
}

async function main() {
  if (!validateArgs()) {
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const agentName = args[0];
  const userMessage = args.slice(1).join(" ");

  await validateAgentAndRespond(agentName, userMessage);
}

main().catch((error: unknown) => {
  // Type assertion for better error handling
  if (error instanceof Error) {
    console.error("An unexpected error occurred:", error.message);
  } else {
    console.error("Unknown error occurred:", error);
  }
  process.exit(1);
});
