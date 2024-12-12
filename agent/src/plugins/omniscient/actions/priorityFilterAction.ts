import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    generateText,
    Content,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../providers/omniscientProvider";
import { RoleContent } from "../evaluators/roleEvaluator";

interface CleanedMessage {
    id: string;
    timestamp: string;
    text: string;
    user: string;
    userName: string;
    roles: string[];
    room: string;
    action?: string;
    replyTo?: string;
}

interface MessageContent extends Content {
    user?: string;
    userName?: string;
    roles?: Array<{ name: string }>;
}

function cleanMessageForSummary(memory: Memory): CleanedMessage {
    const content = memory.content as MessageContent;
    const roles = content.roles || [];

    return {
        id: memory.id,
        timestamp: new Date(memory.createdAt || Date.now()).toISOString(),
        text: content.text,
        user: content.user || memory.userId,
        userName: content.userName || 'unknown',
        roles: roles.map((r) => r.name),
        room: memory.roomId,
        // Only include if present
        ...(content.action && { action: content.action }),
        ...(content.inReplyTo && { replyTo: content.inReplyTo }),
    };
}

const priorityTemplate = `Given the user's role and project data, provide a focused priority list:

Role Information:
{{roleInfo}}

Recent Messages:
{{recentMessages}}

Project Data:
{{projectData}}

Guidelines:
- Focus on the user's primary role and focus areas
- Prioritize based on impact and urgency
- Include relevant metrics and progress
- Highlight dependencies and blockers
- Keep it actionable and concise
- Filter out noise unrelated to role`;

export const priorityFilterAction: Action = {
    name: "FILTER_PRIORITIES",
    description: "Provides role-based priority filtering and insights",
    similes: ["GET_PRIORITIES", "CHECK_FOCUS", "VIEW_TASKS"],
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
        // Get cached role information
        const cacheKey = `${runtime.character.name}/user-role/${message.userId}`;
        const roleInfo = await runtime.cacheManager?.get<RoleContent & { guidance: any }>(cacheKey);

        if (!roleInfo) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "Unable to determine user role. Please try again in a moment.",
                {
                    error: "Role information not available",
                }
            );
        }

        // Fetch recent messages
        const recentMessages = await runtime.messageManager.getMemories({
            roomId: message.roomId,
            count: 100, // Fetch last 100 messages
            unique: false,
        });

        // Clean and process messages
        const cleanedMessages = recentMessages.map((msg) =>
            cleanMessageForSummary(msg)
        );

        const provider = new OmniscientProvider(runtime);
        const data = await provider.getData();

        if (!data) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "Unable to access project data",
                {
                    error: "No project data available",
                }
            );
        }

        const priorityContext = composeContext({
            state: {
                ...state,
                roleInfo: JSON.stringify({
                    primaryRole: roleInfo.primaryRole,
                    focusAreas: roleInfo.focusAreas,
                    responsibilities: roleInfo.responsibilities,
                    accessLevel: roleInfo.accessLevel
                }, null, 2),
                recentMessages: cleanedMessages.map(m => m.text).join("\n"),
                projectData: JSON.stringify(
                    {
                        criticalIssues: data.issues.filter(
                            (i) => i.priority >= 2
                        ),
                        activeProjects: data.projects.filter(
                            (p) => p.state === "active"
                        ),
                        recentUpdates: data.issues
                            .filter(
                                (i) =>
                                    new Date(i.updatedAt) >
                                    new Date(Date.now() - 24 * 60 * 60 * 1000)
                            )
                            .sort((a, b) => b.priority - a.priority),
                        teams: data.teams,
                    },
                    null,
                    2
                ),
            },
            template: priorityTemplate,
        });

        const priorities = await generateText({
            runtime,
            context: priorityContext,
            modelClass: ModelClass.SMALL,
        });

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                success: true,
                data: {
                    role: roleInfo.primaryRole,
                    focusAreas: roleInfo.focusAreas,
                    responsibilities: roleInfo.responsibilities,
                    lastUpdated: data.lastUpdated,
                    priorities
                },
            },
            priorities
        );
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What should I focus on today?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Based on your role as an engineering lead, here are your priorities...",
                    action: "FILTER_PRIORITIES",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show me the most important items for my team",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Looking at the priorities for product management...",
                    action: "FILTER_PRIORITIES",
                },
            },
        ],
    ],
};
