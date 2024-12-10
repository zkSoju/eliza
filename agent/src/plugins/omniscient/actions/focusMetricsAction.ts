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

interface TimeBlock {
    start: number;
    end: number;
    activity: string;
    intensity: number;
}

interface FocusMetrics {
    deepWorkBlocks: TimeBlock[];
    interruptionRate: number;
    peakHours: number[];
    meetingImpact: number;
    focusScore: number;
}

const FOCUS_THRESHOLD = 0.7; // 70% focus time target
const MEETING_IMPACT_THRESHOLD = 0.3; // 30% meeting time max

const metricsTemplate = `Analyze team focus patterns and provide optimization insights:

Recent Messages:
{{recentMessages}}

Focus Data:
{{focusData}}

Current Metrics:
- Deep Work Blocks: {{deepWorkCount}}
- Focus Score: {{focusScore}}%
- Peak Hours: {{peakHours}}
- Meeting Impact: {{meetingImpact}}%

Guidelines:
- Identify optimal meeting times
- Suggest focus block scheduling
- Highlight interruption patterns
- Recommend team sync times
- Track progress on focus goals
- Consider timezone impacts`;

export const focusMetricsAction: Action = {
    name: "ANALYZE_FOCUS_METRICS",
    description: "Measures team focus patterns and suggests improvements",
    similes: ["CHECK_PRODUCTIVITY", "MEASURE_FOCUS", "TRACK_INTERRUPTIONS"],
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
                metricsTemplate
            );
        }

        // Analyze activity patterns over the last week
        const weekActivity = data.issues
            .filter(
                (i) =>
                    new Date(i.updatedAt) >
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            )
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
            );

        // Build focus blocks from activity
        const timeBlocks: TimeBlock[] = [];
        let currentBlock: TimeBlock | null = null;

        weekActivity.forEach((activity) => {
            const timestamp = new Date(activity.updatedAt).getTime();
            const hour = new Date(timestamp).getHours();

            if (
                !currentBlock ||
                timestamp - currentBlock.end > 30 * 60 * 1000
            ) {
                // 30 min gap
                if (currentBlock) timeBlocks.push(currentBlock);
                currentBlock = {
                    start: timestamp,
                    end: timestamp + 30 * 60 * 1000,
                    activity: activity.project?.name || "Unknown",
                    intensity: calculateIntensity(hour),
                };
            } else {
                currentBlock.end = timestamp;
            }
        });

        if (currentBlock) timeBlocks.push(currentBlock);

        // Calculate focus metrics
        const metrics: FocusMetrics = {
            deepWorkBlocks: timeBlocks.filter((b) => b.intensity > 0.7),
            interruptionRate: calculateInterruptionRate(timeBlocks),
            peakHours: findPeakHours(timeBlocks),
            meetingImpact: calculateMeetingImpact(data),
            focusScore: calculateFocusScore(timeBlocks),
        };

        const metricsContext = composeContext({
            state: {
                ...state,
                deepWorkCount: metrics.deepWorkBlocks.length,
                focusScore: Math.round(metrics.focusScore * 100),
                peakHours: metrics.peakHours.join(", "),
                meetingImpact: Math.round(metrics.meetingImpact * 100),
                focusData: JSON.stringify(
                    {
                        metrics,
                        activeProjects: data.projects.filter(
                            (p) => p.state === "active"
                        ),
                        teamActivity: data.teams.map((t) => ({
                            team: t.name,
                            activeIssues: weekActivity.filter(
                                (i) => i.team?.id === t.id
                            ).length,
                        })),
                    },
                    null,
                    2
                ),
            },
            template: metricsTemplate,
        });

        const analysis = await generateText({
            runtime,
            context: metricsContext,
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
            metricsTemplate
        );
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How's our team's focus this week?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Analyzing team focus patterns and productivity metrics...",
                    action: "ANALYZE_FOCUS_METRICS",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "When are our peak productivity hours?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Looking at the team's focus patterns and optimal times...",
                    action: "ANALYZE_FOCUS_METRICS",
                },
            },
        ],
    ],
};

function calculateIntensity(hour: number): number {
    // Higher intensity during typical focus hours
    if (hour >= 9 && hour <= 11) return 0.9; // Morning focus
    if (hour >= 14 && hour <= 16) return 0.8; // Afternoon focus
    if (hour >= 12 && hour <= 13) return 0.4; // Lunch dip
    if (hour >= 17) return 0.6; // Late day
    return 0.7; // Default
}

function calculateInterruptionRate(blocks: TimeBlock[]): number {
    if (blocks.length < 2) return 0;

    let interruptions = 0;
    for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].start - blocks[i - 1].end > 15 * 60 * 1000) {
            // 15 min gap
            interruptions++;
        }
    }

    return interruptions / blocks.length;
}

function findPeakHours(blocks: TimeBlock[]): number[] {
    const hourCounts = new Array(24).fill(0);

    blocks.forEach((block) => {
        const hour = new Date(block.start).getHours();
        hourCounts[hour] += block.intensity;
    });

    // Return top 3 productive hours
    return hourCounts
        .map((count, hour) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((x) => x.hour);
}

function calculateMeetingImpact(data: any): number {
    // Estimate meeting impact from issue labels and descriptions
    const meetingRelated = data.issues.filter(
        (i) =>
            i.labels?.some((l: string) =>
                l.toLowerCase().includes("meeting")
            ) || i.description?.toLowerCase().includes("meeting")
    ).length;

    return meetingRelated / data.issues.length;
}

function calculateFocusScore(blocks: TimeBlock[]): number {
    if (blocks.length === 0) return 0;

    const totalTime = blocks.reduce(
        (sum, block) => sum + (block.end - block.start),
        0
    );
    const focusTime = blocks
        .filter((b) => b.intensity > FOCUS_THRESHOLD)
        .reduce((sum, block) => sum + (block.end - block.start), 0);

    return focusTime / totalTime;
}
