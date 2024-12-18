import {
    Action,
    HandlerCallback,
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
import { generateDirectResponse } from "../../../utils/messageGenerator";

const AnalyticsInsightSchema = z.object({
    project: z.object({
        name: z.string(),
        type: z.string(),
    }),
    metrics: z.object({
        engagement: z.object({
            daily_active_users: z.number(),
            retention_rate: z.number(),
            avg_session_duration: z.number(),
            bounce_rate: z.number(),
        }),
        conversion: z.object({
            conversion_rate: z.number(),
            key_actions_completed: z.number(),
            drop_off_points: z.array(z.string()),
        }),
    }),
    trends: z.array(
        z.object({
            metric: z.string(),
            direction: z.enum(["increasing", "decreasing", "stable"]),
            significance: z.number().min(1).max(10),
            context: z.string(),
        })
    ),
    insights: z.array(z.string()),
    recommendations: z.array(z.string()),
});

const analyticsTemplate = `Analyze the following analytics data and provide actionable insights:

Project Data:
{{projectData}}

Previous Analysis:
{{previousAnalysis}}

Guidelines:
- Focus on significant changes in user behavior
- Identify engagement patterns
- Note conversion funnel performance
- Highlight areas needing attention
- Suggest actionable improvements

Response Format:
{
    "project": {
        "name": "Project Name",
        "type": "website/app"
    },
    "metrics": {
        "engagement": {
            "daily_active_users": number,
            "retention_rate": number,
            "avg_session_duration": number,
            "bounce_rate": number
        },
        "conversion": {
            "conversion_rate": number,
            "key_actions_completed": number,
            "drop_off_points": ["step where users commonly leave"]
        }
    },
    "trends": [
        {
            "metric": "metric name",
            "direction": "increasing/decreasing/stable",
            "significance": 1-10,
            "context": "explanation of the trend"
        }
    ],
    "insights": [
        "key observation about the data"
    ],
    "recommendations": [
        "actionable suggestion for improvement"
    ]
}`;

export const analyticsInsightAction: Action = {
    name: "ANALYZE_ANALYTICS",
    description: "Analyzes user behavior and provides engagement insights",
    similes: ["ANALYTICS_INSIGHT", "USER_BEHAVIOR", "ENGAGEMENT_ANALYSIS"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How is user engagement trending?",
                    action: "ANALYZE_ANALYTICS",
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
            // Get latest analytics data
            const recentMemory = await runtime.messageManager.getMemories({
                roomId: stringToUuid("analytics-" + runtime.agentId),
                count: 1,
            });

            if (!recentMemory.length) {
                return generateDirectResponse(
                    runtime,
                    state,
                    callback,
                    {},
                    "No recent analytics data available",
                    { error: "No data available" }
                );
            }

            const { events } = recentMemory[0].content;

            // Process each project's analytics
            const processedInsights = await Promise.all(
                Object.entries(events).map(
                    async ([projectId, projectEvents]) => {
                        const context = composeContext({
                            state: {
                                ...state,
                                projectId,
                                projectData: JSON.stringify(
                                    projectEvents,
                                    null,
                                    2
                                ),
                                previousAnalysis:
                                    "No previous analysis available", // TODO: Implement historical comparison
                            },
                            template: analyticsTemplate,
                        });

                        const result = await generateObjectV2({
                            runtime,
                            context,
                            modelClass: ModelClass.SMALL,
                            schema: AnalyticsInsightSchema,
                        });

                        return {
                            projectId,
                            analysis: result.object,
                        };
                    }
                )
            );

            return generateDirectResponse(
                runtime,
                state,
                callback,
                {
                    insights: processedInsights,
                },
                `Analyze the following engagement metrics and provide insights:

{{insights}}

Focus on:
- Key engagement trends
- Conversion patterns
- User behavior changes
- Areas needing attention`,
                { model: ModelClass.LARGE }
            );
        } catch (error) {
            elizaLogger.error("Error in analytics insight action:", error);
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "Error analyzing analytics data",
                { error: "Processing error" }
            );
        }
    },
};
