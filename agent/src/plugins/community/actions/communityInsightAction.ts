import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    elizaLogger,
    generateObjectV2,
    composeContext,
    stringToUuid,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { z } from "zod";

const CommunityInsightSchema = z.object({
    overview: z.object({
        active_discussions: z.number(),
        participant_count: z.number(),
        engagement_score: z.number(),
        sentiment_summary: z.string(),
    }),
    topics: z.array(z.object({
        name: z.string(),
        frequency: z.number(),
        engagement_level: z.number(),
        sentiment: z.string(),
    })),
    patterns: z.array(z.object({
        type: z.string(),
        description: z.string(),
        significance: z.number().min(1).max(10),
    })),
    member_dynamics: z.array(z.object({
        pattern: z.string(),
        impact: z.string(),
        suggestion: z.string(),
    })),
    actionable_insights: z.array(z.string()),
});

const communityAnalysisTemplate = `Analyze community conversations and provide actionable insights:

Conversation Data:
{{conversationData}}

Previous Analysis:
{{previousAnalysis}}

Guidelines:
- Identify active discussion topics
- Analyze engagement patterns
- Detect sentiment trends
- Note member interaction patterns
- Suggest community improvements

Response Format:
{
    "overview": {
        "active_discussions": number,
        "participant_count": number,
        "engagement_score": number,
        "sentiment_summary": "overall community sentiment"
    },
    "topics": [
        {
            "name": "topic name",
            "frequency": number,
            "engagement_level": number,
            "sentiment": "topic sentiment"
        }
    ],
    "patterns": [
        {
            "type": "pattern type",
            "description": "pattern description",
            "significance": 1-10
        }
    ],
    "member_dynamics": [
        {
            "pattern": "interaction pattern",
            "impact": "impact on community",
            "suggestion": "improvement suggestion"
        }
    ],
    "actionable_insights": [
        "specific actionable recommendation"
    ]
}`;

export const communityInsightAction: Action = {
    name: "ANALYZE_COMMUNITY",
    description: "Analyzes community conversations and provides actionable insights",
    similes: ["COMMUNITY_INSIGHT", "CONVERSATION_ANALYSIS", "COMMUNITY_HEALTH"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are the key community trends?",
                    action: "ANALYZE_COMMUNITY",
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
            // Get recent conversation data
            const conversations = await runtime.messageManager.getMemories({
                roomId: stringToUuid("community-" + runtime.agentId),
                count: 100, // Analyze last 100 conversations
            });

            if (!conversations.length) {
                return generateDirectResponse(
                    runtime,
                    state,
                    callback,
                    {},
                    "No recent community conversations available",
                    { error: "No data available" }
                );
            }

            const context = composeContext({
                state: {
                    ...state,
                    conversationData: JSON.stringify(conversations, null, 2),
                    previousAnalysis: "No previous analysis available", // TODO: Implement historical comparison
                },
                template: communityAnalysisTemplate,
            });

            const result = await generateObjectV2({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
                schema: CommunityInsightSchema,
            });

            return generateDirectResponse(
                runtime,
                state,
                callback,
                {
                    insights: result.object,
                },
                `Analyze the following community metrics and provide insights:

{{insights}}

Focus on:
- Active discussion topics
- Engagement patterns
- Member interactions
- Areas for improvement`,
                { model: ModelClass.LARGE }
            );
        } catch (error) {
            elizaLogger.error("Error in community insight action:", error);
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "Error analyzing community data",
                { error: "Processing error" }
            );
        }
    },
};