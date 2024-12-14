import {
    Evaluator,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    elizaLogger,
    generateObjectV2,
    stringToUuid,
} from "@ai16z/eliza";
import { z } from "zod";
import { SimpleHashProvider } from "../../cybernetic/providers/simpleHashProvider";

const MarketTrendSchema = z.object({
    category: z.enum([
        "token_price",
        "market_sentiment",
        "volume_analysis",
        "holder_activity",
        "marketplace_trend",
        "general_market",
    ]),
    significance: z.number().min(0).max(10),
    sentiment: z.enum(["bullish", "bearish", "neutral"]),
    keyMetrics: z.array(
        z.object({
            name: z.string(),
            value: z.number(),
            trend: z.enum(["up", "down", "stable"])
        })
    ).min(1),
    insights: z.array(z.string()),
    actionItems: z.array(z.string()).optional(),
});

export type MarketTrendAnalysis = z.infer<typeof MarketTrendSchema>;

const marketTrendTemplate = `Analyze the market trends and token metrics in the context of this message.

Message Content:
{{messageContent}}

Current Market Data:
{{marketData}}

Recent Price History:
{{priceHistory}}

Collection Stats:
{{collectionStats}}

Guidelines for market trend analysis:

Response Format:
{
    "category": "token_price",
    "significance": 8,
    "sentiment": "bullish",
    "keyMetrics": [
        {
            "name": "price_change_24h",
            "value": 15.5,
            "trend": "up"
        },
        {
            "name": "volume_24h",
            "value": 250000,
            "trend": "up"
        }
    ],
    "insights": [
        "Strong buying pressure across all HoneyJar generations",
        "Increased holder retention rate"
    ],
    "actionItems": [
        "Monitor volume distribution across DEXs",
        "Track holder concentration metrics"
    ]
}

Categories:
- token_price: Direct price movements and predictions
- market_sentiment: Overall market mood and direction
- volume_analysis: Trading volume and liquidity patterns
- holder_activity: Changes in holder behavior
- marketplace_trend: Specific marketplace performance
- general_market: Broader market conditions

Significance Scale (0-10):
0-2: Minor market movements
3-4: Notable but not significant changes
5-6: Important market signals
7-8: Significant market events
9-10: Critical market developments

Analyze the market context and provide a structured assessment following the exact format shown above.`;

export const marketTrendEvaluator: Evaluator = {
    name: "ANALYZE_MARKET_TRENDS",
    description: "Analyzes market trends, token prices, and trading activity",
    similes: ["MARKET_ANALYSIS", "PRICE_TRENDS", "TRADING_PATTERNS"],
    examples: [
        {
            context: "Price movement discussion",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "HoneyJar price up 20% with 3x volume increase across all generations",
                    },
                },
            ],
            outcome: `{
                "category": "token_price",
                "significance": 8,
                "sentiment": "bullish",
                "keyMetrics": [
                    {
                        "name": "price_change_24h",
                        "value": 20,
                        "trend": "up"
                    },
                    {
                        "name": "volume_multiple",
                        "value": 3,
                        "trend": "up"
                    }
                ],
                "insights": [
                    "Strong momentum across all generations",
                    "Volume surge indicates high interest",
                    "Coordinated buying pressure"
                ]
            }`,
        },
        {
            context: "Holder activity analysis",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Seeing increased holder concentration in Gen 3, while Gen 1 holders are diversifying",
                    },
                },
            ],
            outcome: `{
                "category": "holder_activity",
                "significance": 7,
                "sentiment": "neutral",
                "keyMetrics": [
                    {
                        "name": "gen3_holder_concentration",
                        "value": 0.85,
                        "trend": "up"
                    },
                    {
                        "name": "gen1_holder_diversity",
                        "value": 0.65,
                        "trend": "up"
                    }
                ],
                "insights": [
                    "Generation 3 accumulation pattern",
                    "Generation 1 distribution phase",
                    "Mixed holder behavior across generations"
                ]
            }`,
        },
    ],
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        return [];
    },
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            // Skip if message is from the agent itself
            if (message.userId === runtime.agentId) {
                return true;
            }

            elizaLogger.info("Market trend evaluator triggered");

            const simpleHash = new SimpleHashProvider(runtime);
            const [prices, stats] = await Promise.all([
                simpleHash.getAllTokenPrices(),
                simpleHash.getAllCollectionStats(),
            ]);

            const context = composeContext({
                state: {
                    ...state,
                    messageContent: message.content.text,
                    marketData: JSON.stringify(
                        {
                            prices,
                            stats,
                        },
                        null,
                        2
                    ),
                    priceHistory: prices
                        ? JSON.stringify(prices, null, 2)
                        : "No price data available",
                    collectionStats: stats
                        ? JSON.stringify(stats, null, 2)
                        : "No collection stats available",
                },
                template: marketTrendTemplate,
            });

            const result = await generateObjectV2({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
                schema: MarketTrendSchema,
            });

            const analysis = result.object as MarketTrendAnalysis;

            // Store significant market trends in memory
            if (analysis.significance >= 5) {
                const globalMemory: Memory = {
                    id: stringToUuid(`market-trend-${Date.now()}`),
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: stringToUuid("market-trends-" + runtime.agentId),
                    content: {
                        text: message.content.text,
                        marketTrend: analysis,
                        marketData: {
                            prices,
                            stats,
                        },
                    },
                    createdAt: message.createdAt,
                };

                await runtime.messageManager.createMemory(globalMemory);

                // Cache the market analysis
                const cacheKey = `${runtime.character.name}/market-trend/${message.id}`;
                await runtime.cacheManager?.set(cacheKey, analysis);
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in market trend validator:", error);
            return false;
        }
    },
};
