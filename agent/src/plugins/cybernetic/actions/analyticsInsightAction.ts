import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OpenPanelProvider } from "../providers/openPanelProvider";

export const analyticsInsightAction: Action = {
    name: "ANALYTICS_INSIGHT",
    description: "Analyzes user behavior and engagement patterns",
    similes: ["ANALYZE_USERS", "USER_PATTERNS", "ENGAGEMENT"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are our user engagement trends?",
                    action: "ANALYTICS_INSIGHT",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the key engagement patterns across our projects...",
                },
            },
        ],
    ],
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        const provider = new OpenPanelProvider(runtime);
        const data = await provider.getData();
        return !!data;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: unknown,
        callback: HandlerCallback
    ) => {
        const provider = new OpenPanelProvider(runtime);
        const data = await provider.getData();

        if (!data) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "No analytics data available",
                { error: "No data available" }
            );
        }

        // Aggregate analytics across all projects
        const projectInsights = data.projects.map((project) => {
            const events = data.events[project.id] || [];
            const funnel = data.funnels[project.id];
            const charts = data.charts[project.id];

            return {
                project: project.name,
                type: project.type,
                recentEvents: events.slice(0, 5),
                conversion: funnel?.steps[0]?.percent || 0,
                sessions: funnel?.totalSessions || 0,
                metrics: charts?.metrics || {},
            };
        });

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                insights: projectInsights,
                timestamp: new Date().toISOString(),
            },
            `Analyze user behavior and engagement patterns across all projects:

Current Analytics Overview:
{{insights}}

Guidelines:
- Compare performance across projects
- Identify cross-project patterns
- Highlight successful engagement strategies
- Note areas needing improvement
- Suggest cross-project optimizations
- Track user journey across platforms

Focus on:
- Session trends: {{sessions}}
- Conversion patterns: {{conversion}}
- Event frequency: {{events}}
- Cross-platform behavior
- User retention metrics`
        );
    },
};
