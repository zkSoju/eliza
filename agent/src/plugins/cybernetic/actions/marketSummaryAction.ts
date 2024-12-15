import {
    Action,
    elizaLogger,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { TokenCollection } from "../providers/simpleHashProvider";

interface MarketSummary {
    honeycomb?: TokenCollection;
    honeyJars: TokenCollection[];
    timestamp: string;
}

function formatPrice(price: number): string {
    // Always format with 2 decimal places, no comma for thousands in price
    return `$${price.toFixed(2)}`;
}

function formatNumber(num: number): string {
    // Use comma for thousands only in numbers like holder count
    return num.toLocaleString();
}

function formatCollectionData(collection: TokenCollection): string {
    const floorPrice = collection.computed?.floor_price_usd
        ? formatPrice(collection.computed.floor_price_usd)
        : "N/A";

    return `${collection.name}:
- Floor Price: ${floorPrice}
- Holders: ${formatNumber(collection.distinct_owner_count)}
- Supply: ${formatNumber(collection.total_quantity)}
- Marketplaces: ${collection.marketplace_pages.map((m) => m.marketplace_name).join(", ")}`;
}

const template = `Provide a concise market overview using the stored insights:

Market Data:
{{marketData}}

Guidelines:
- Keep insights extremely brief
- Use emojis for visual clarity (🍯 for Honeycomb, 🏺 for HoneyJars)
- Focus on most significant changes
- Highlight key risks/opportunities
- Compare generations when relevant
- Format prices with proper commas for thousands
- Show chain for each generation

Format:
- Start with Honeycomb overview
- List HoneyJars by generation
- Add key trends
- Note any important watch points`;

export const marketSummaryAction: Action = {
    name: "SUMMARIZE_MARKET",
    description:
        "Summarizes recent market trends and provides actionable insights",
    similes: ["MARKET_SUMMARY", "TREND_OVERVIEW", "MARKET_UPDATE"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are the key market trends we should know about?",
                    action: "SUMMARIZE_MARKET",
                },
            },
        ],
    ],
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: unknown,
        callback: HandlerCallback
    ) => {
        try {
            // Get latest market data from memory
            const recentMemory = await runtime.messageManager.getMemories({
                roomId: stringToUuid("market-trends-" + runtime.agentId),
                count: 1,
            });

            elizaLogger.info("Recent memory", {
                recentMemory,
            });

            if (!recentMemory.length) {
                return generateDirectResponse(
                    runtime,
                    state,
                    callback,
                    {},
                    "No recent market data available",
                    { error: "No data available" }
                );
            }

            const { marketData, insights } = recentMemory[0].content;

            return generateDirectResponse(
                runtime,
                state,
                callback,
                {
                    marketData: JSON.stringify(
                        { marketData, insights },
                        null,
                        2
                    ),
                },
                template,
                { model: ModelClass.LARGE }
            );
        } catch (error) {
            elizaLogger.error("Error in market summary action:", error);
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "Error generating market summary",
                { error: "Processing error" }
            );
        }
    },
};
