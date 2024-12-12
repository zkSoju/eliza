import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    generateText,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../providers/omniscientProvider";

interface ContextSwitch {
    from: string;
    to: string;
    timestamp: number;
    impact: "high" | "medium" | "low";
}

interface ContextMetrics {
    switches: ContextSwitch[];
    focusTime: number;
    switchFrequency: number;
    recommendations: string[];
}

const SWITCH_THRESHOLD = 5; // Max recommended context switches per day
const MIN_FOCUS_TIME = 90; // Recommended minimum focus time in minutes

const switchTemplate = `Analyze recent activity and provide context switching insights:

Recent Messages:
{{recentMessages}}

Activity Data:
{{activityData}}

Current Context:
- Active Tasks: {{activeTasks}}
- Recent Switches: {{recentSwitches}}
- Focus Time: {{focusTime}} minutes

Guidelines:
- Identify context switching patterns
- Suggest task batching opportunities
- Recommend focus time blocks
- Provide context preservation tips
- Flag excessive switching
- Consider meeting impact`;

export const contextSwitchAction: Action = {
    name: "CHECK_CONTEXT_SWITCHES",
    description:
        "Detects context switching patterns and provides focus recommendations",
    similes: ["CHECK_FOCUS", "ANALYZE_SWITCHES", "GET_FOCUS_TIPS"],
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
        const provider = new OmniscientProvider(runtime);
        const data = await provider.getData();

        if (!data) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {
                    error: "No data available",
                },
                switchTemplate
            );
        }

        // Analyze recent issues and updates for context switches
        const recentActivity = data.issues
            .filter(
                (i) =>
                    new Date(i.updatedAt) >
                    new Date(Date.now() - 24 * 60 * 60 * 1000)
            )
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
            );

        // Detect context switches by project/team changes
        const switches: ContextSwitch[] = [];
        let lastContext = "";

        recentActivity.forEach((activity) => {
            const currentContext =
                activity.project?.id || activity.team?.id || "";
            if (lastContext && currentContext !== lastContext) {
                switches.push({
                    from: lastContext,
                    to: currentContext,
                    timestamp: new Date(activity.updatedAt).getTime(),
                    impact:
                        switches.length > SWITCH_THRESHOLD ? "high" : "medium",
                });
            }
            lastContext = currentContext;
        });

        // Calculate focus metrics
        const metrics: ContextMetrics = {
            switches,
            focusTime: calculateFocusTime(switches),
            switchFrequency: switches.length,
            recommendations: generateRecommendations(switches),
        };

        const switchContext = composeContext({
            state: {
                ...state,
                activeTasks: recentActivity.length,
                recentSwitches: switches.length,
                focusTime: metrics.focusTime,
                activityData: JSON.stringify(
                    {
                        metrics,
                        activeProjects: data.projects.filter(
                            (p) => p.state === "active"
                        ),
                        criticalIssues: data.issues.filter(
                            (i) => i.priority >= 2
                        ),
                    },
                    null,
                    2
                ),
            },
            template: switchTemplate,
        });

        const analysis = await generateText({
            runtime,
            context: switchContext,
            modelClass: ModelClass.SMALL,
        });

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                success: true,
                data: {
                    metrics,
                    lastUpdated: data.lastUpdated,
                },
            },
            switchTemplate
        );
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How's my context switching today?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Analyzing your task switches and focus patterns...",
                    action: "CHECK_CONTEXT_SWITCHES",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Am I task switching too much?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Looking at your context switching patterns...",
                    action: "CHECK_CONTEXT_SWITCHES",
                },
            },
        ],
    ],
};

function calculateFocusTime(switches: ContextSwitch[]): number {
    if (switches.length === 0) return MIN_FOCUS_TIME;

    // Calculate average time between switches
    let totalTime = 0;
    for (let i = 1; i < switches.length; i++) {
        totalTime += switches[i].timestamp - switches[i - 1].timestamp;
    }

    return Math.floor(totalTime / (switches.length * 60000)); // Convert to minutes
}

function generateRecommendations(switches: ContextSwitch[]): string[] {
    const recommendations: string[] = [];

    if (switches.length > SWITCH_THRESHOLD) {
        recommendations.push("Consider batching similar tasks together");
        recommendations.push("Block out focused development time");
    }

    if (switches.some((s) => s.impact === "high")) {
        recommendations.push("Too many context switches detected");
        recommendations.push("Try the Pomodoro Technique for better focus");
    }

    if (calculateFocusTime(switches) < MIN_FOCUS_TIME) {
        recommendations.push("Increase continuous focus time");
        recommendations.push(
            "Schedule meetings in blocks to preserve focus time"
        );
    }

    return recommendations;
}
