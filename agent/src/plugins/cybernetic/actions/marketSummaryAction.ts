import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { MarketTrendAnalysis } from "../evaluators/marketTrendEvaluator";

interface CleanedMarketTrend {
    timestamp: string;
    category: string;
    significance: number;
    sentiment: string;
    keyMetrics: Array<{
        name: string;
        value: number;
        trend: string;
    }>;
    insights: string[];
    actionItems?: string[];
    originalMessage: string;
}

function cleanMarketTrend(memory: Memory): CleanedMarketTrend {
    const trend = memory.content.marketTrend as MarketTrendAnalysis;
    return {
        timestamp: memory.createdAt,
        category: trend.category,
        significance: trend.significance,
        sentiment: trend.sentiment,
        keyMetrics: trend.keyMetrics,
        insights: trend.insights,
        actionItems: trend.actionItems,
        originalMessage: memory.content.text
    };
}

function groupTrendsByCategory(trends: CleanedMarketTrend[]): {
    [key: string]: CleanedMarketTrend[];
} {
    return trends.reduce((acc: { [key: string]: CleanedMarketTrend[] }, trend) => {
        if (!acc[trend.category]) {
            acc[trend.category] = [];
        }
        acc[trend.category].push(trend);
        return acc;
    }, {});
}

function formatCategoryTrends(trends: CleanedMarketTrend[]): string {
    // Sort by significance and timestamp
    const sortedTrends = trends.sort((a, b) =>
        b.significance - a.significance ||
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return sortedTrends.map(trend => {
        const sentimentEmoji = {
            bullish: "📈",
            bearish: "📉",
            neutral: "➖"
        }[trend.sentiment];

        const metrics = trend.keyMetrics
            .map(m => `${m.name}: ${m.value} (${m.trend})`)
            .join(", ");

        return `${sentimentEmoji} **Significance: ${trend.significance}/10**
- Original Context: ${trend.originalMessage}
- Key Metrics: ${metrics}
- Insights: ${trend.insights.join(" | ")}
${trend.actionItems ? `- Action Items: ${trend.actionItems.join(" | ")}` : ""}`;
    }).join("\n\n");
}

export const marketSummaryAction: Action = {
    name: "SUMMARIZE_MARKET",
    description: "Summarizes recent market trends and provides actionable insights",
    similes: ["MARKET_SUMMARY", "TREND_OVERVIEW", "MARKET_UPDATE"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are the key market trends we should know about?",
                    action: "SUMMARIZE_MARKET"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Three significant market trends have emerged in the last 24 hours..."
                }
            }
        ]
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
        // Get market trends from memory
        const lookbackHours = 24;
        const lookbackTime = Date.now() - lookbackHours * 60 * 60 * 1000;

        const marketTrends = await runtime.messageManager.getMemories({
            roomId: stringToUuid("market-trends-" + runtime.agentId),
            count: 100,
            unique: true,
            start: lookbackTime,
        });

        if (!marketTrends.length) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "No recent market trends available",
                { error: "No data available" }
            );
        }

        // Clean and process trends
        const cleanedTrends = marketTrends
            .filter(msg => msg.content.marketTrend)
            .map(msg => cleanMarketTrend(msg));

        // Group trends by category
        const trendsByCategory = groupTrendsByCategory(cleanedTrends);

        // Format categories
        const formattedCategories = Object.entries(trendsByCategory)
            .map(([category, trends]) => `## ${category.toUpperCase()}\n${formatCategoryTrends(trends)}`)
            .join("\n\n");

        const template = `Analyze recent market trends and provide strategic insights:

Market Activity by Category:
{{marketTrends}}

Price Data:
{{priceData}}

Guidelines:
- Prioritize high-significance trends first
- Group related patterns across categories
- Highlight actionable opportunities
- Note potential risks and mitigation strategies
- Consider cross-chain correlations
- Track sentiment shifts and volume patterns

Focus Areas:
- Price movements and volume trends
- Holder behavior patterns
- Cross-chain dynamics
- Market sentiment shifts
- Actionable opportunities
- Risk factors`;

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                marketTrends: formattedCategories,
                priceData: JSON.stringify(cleanedTrends
                    .filter(t => t.category === "token_price")
                    .map(t => t.keyMetrics), null, 2),
                timeframe: `${lookbackHours} hours`
            },
            template,
            { model: ModelClass.LARGE }
        );
    }
};