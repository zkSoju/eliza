import {
    Action,
    composeContext,
    elizaLogger,
    generateObjectV2,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
} from "@ai16z/eliza";
import { z } from "zod";
import { SimpleHashProvider } from "../providers/simpleHashProvider";

const MarketInsightSchema = z.object({
    collection: z.object({
        name: z.string(),
        chain: z.string(),
        generation: z.number().optional(),
    }),
    analysis: z.object({
        price_trend: z.object({
            direction: z.enum(["increasing", "decreasing", "stable"]),
            significance: z.number().min(1).max(10),
            context: z.string(),
        }),
        volume_trend: z.object({
            direction: z.enum(["increasing", "decreasing", "stable"]),
            significance: z.number().min(1).max(10),
            context: z.string(),
        }),
        holder_behavior: z.object({
            pattern: z.string(),
            significance: z.number().min(1).max(10),
            context: z.string(),
        }),
    }),
    insights: z.array(z.string()),
    risks: z.array(z.string()).optional(),
    opportunities: z.array(z.string()).optional(),
});

const marketAnalysisTemplate = `Analyze this NFT collection data and provide insights.

Collection Data:
{{collectionData}}

Previous Analysis:
{{previousAnalysis}}

Guidelines:
- Identify meaningful patterns in price and volume data
- Evaluate holder behavior changes
- Note cross-marketplace dynamics
- Flag potential risks and opportunities
- Focus on actionable insights

Response Format:
{
    "collection": {
        "name": "Collection Name",
        "chain": "chain_name",
        "generation": 1
    },
    "analysis": {
        "price_trend": {
            "direction": "increasing",
            "significance": 8,
            "context": "Steady price appreciation across all marketplaces"
        },
        "volume_trend": {
            "direction": "stable",
            "significance": 6,
            "context": "Consistent trading volume with minor fluctuations"
        },
        "holder_behavior": {
            "pattern": "accumulation",
            "significance": 7,
            "context": "Long-term holders increasing positions"
        }
    },
    "insights": [
        "Growing institutional interest indicated by large wallet accumulation",
        "Cross-chain liquidity improving with new marketplace integrations"
    ],
    "risks": [
        "Increasing concentration in top wallets"
    ],
    "opportunities": [
        "Potential for price discovery in newer marketplaces"
    ]
}`;

export const marketDataRefreshAction: Action = {
    name: "REFRESH_MARKET_DATA",
    description: "Refreshes market data cache and stores new market trends",
    similes: ["UPDATE_MARKET_DATA", "SYNC_MARKET_DATA", "DAILY_MARKET_UPDATE"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Refresh market data",
                    action: "REFRESH_MARKET_DATA",
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
            elizaLogger.info("Starting market data refresh");

            const simpleHash = new SimpleHashProvider(runtime);
            const marketData = await simpleHash.getData();

            if (!marketData) {
                elizaLogger.error("Failed to fetch market data");
                return;
            }

            // Get previous analysis for context
            const previousAnalysis = await runtime.messageManager.getMemories({
                roomId: stringToUuid("market-trends-" + runtime.agentId),
                count: 1,
                unique: false,
            });

            // Process each collection using AI
            const processedInsights = await Promise.all(
                Object.entries(marketData).map(
                    async ([tokenId, collection]) => {
                        const context = composeContext({
                            state: {
                                ...state,
                                tokenId,
                                collectionData: JSON.stringify(
                                    collection,
                                    null,
                                    2
                                ),
                                previousAnalysis: previousAnalysis.length
                                    ? JSON.stringify(
                                          previousAnalysis[0].content
                                              .insights?.[tokenId],
                                          null,
                                          2
                                      )
                                    : "No previous analysis available",
                            },
                            template: marketAnalysisTemplate,
                        });

                        const result = await generateObjectV2({
                            runtime,
                            context,
                            modelClass: ModelClass.SMALL,
                            schema: MarketInsightSchema,
                        });

                        return {
                            tokenId,
                            analysis: result.object,
                        };
                    }
                )
            );

            // Store processed data in memory
            const globalMemory: Memory = {
                id: stringToUuid(`market-data-${Date.now()}`),
                userId: runtime.agentId,
                agentId: runtime.agentId,
                roomId: stringToUuid("market-trends-" + runtime.agentId),
                content: {
                    text: "Daily market data refresh",
                    marketData,
                    insights: processedInsights,
                    timestamp: new Date().toISOString(),
                },
                createdAt: Date.now(),
            };

            await runtime.ensureRoomExists(globalMemory.roomId);
            await runtime.messageManager.createMemory(globalMemory);
            elizaLogger.info("Market data and insights stored in memory", {
                collections: processedInsights.length,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            elizaLogger.error("Error in market data refresh:", error);
        }
    },
};
