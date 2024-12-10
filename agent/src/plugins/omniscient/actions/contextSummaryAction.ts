import {
    Action,
    elizaLogger,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { DiscordContent } from "../../../types";
import { generateDirectResponse } from "../../../utils/messageGenerator";

interface GroupedMessages {
    [key: string]: {
        channelName: string;
        messages: Memory[];
    };
}

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

function cleanMessageForSummary(memory: Memory): CleanedMessage {
    const content = memory.content as DiscordContent;
    const roles = content.roles || [];

    return {
        id: memory.id,
        timestamp: new Date(memory.createdAt || Date.now()).toISOString(),
        text: content.text,
        user: content.user || memory.userId,
        userName: content.userName,
        roles: roles.map((r) => r.name),
        room: memory.roomId,
        // Only include if present
        ...(content.action && { action: content.action }),
        ...(content.inReplyTo && { replyTo: content.inReplyTo }),
    };
}

function groupMessagesByChannel(messages: Memory[]): GroupedMessages {
    return messages.reduce((acc: GroupedMessages, message: Memory) => {
        const channelId = message.roomId;
        if (!acc[channelId]) {
            acc[channelId] = {
                channelName: `Channel-${channelId.slice(0, 8)}`,
                messages: [],
            };
        }
        acc[channelId].messages.push(message);
        return acc;
    }, {});
}

function generateRoleSpecificTemplate(
    userRoles: Array<{ id: string; name: string }>
) {
    const roleNames = userRoles.map((r) => r.name).join(", ");
    return `Given the following context from various channels, provide a focused summary for a team member with roles: ${roleNames || "General Member"}

Channel Activity:
{{channels}}

Recent Messages:
{{messages}}

Guidelines:
- Focus on information relevant to the user's roles
- Highlight key decisions and updates
- Note action items and deadlines
- Keep the summary concise and actionable
- Prioritize by impact and urgency

Provide a clear, role-focused summary of the recent activity.`;
}

export const contextSummaryAction: Action = {
    name: "SUMMARIZE_CONTEXT",
    description:
        "Summarizes recent context across channels, tailored to user's role",
    similes: ["SUMMARIZE_ALL", "GET_OVERVIEW", "CHECK_UPDATES"],
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's happened today across our channels?",
                    action: "SUMMARIZE_CONTEXT",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*reviews recent scrolls* Frontend team discussed auth changes, Design shared new mockups...",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Give me a recap of recent discussions",
                    action: "SUMMARIZE_CONTEXT",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*scans message crystals* Key updates: API specs finalized in #backend, deployment scheduled in #devops...",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What have I missed in the last few hours?",
                    action: "SUMMARIZE_CONTEXT",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*examines recent patterns* Marketing discussed campaign timing, Engineering resolved the cache issue...",
                },
            },
        ],
    ],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: unknown,
        callback: HandlerCallback
    ) => {
        // Get user's roles from the message
        const content = message.content as DiscordContent;
        const userRoles = content.roles || [];

        // Fetch recent messages across channels
        const recentMessages = await runtime.messageManager.getMemories({
            roomId: message.roomId,
            count: 1000,
            unique: false,
        });

        // Clean and process messages
        const cleanedMessages = recentMessages.map((msg) =>
            cleanMessageForSummary(msg)
        );

        // Group messages by channel
        const groupedMessages = groupMessagesByChannel(recentMessages);

        // Format channel summaries
        const channelSummaries = Object.entries(groupedMessages)
            .map(([channelId, data]) => {
                const messages = data.messages
                    .map((m) => `${(m.content as DiscordContent).text}`)
                    .join("\n");
                return `# ${data.channelName}\n${messages}`;
            })
            .join("\n\n");

        elizaLogger.info("Channel summaries:", channelSummaries);
        elizaLogger.info("Cleaned messages:", cleanedMessages);
        elizaLogger.info("User roles:", userRoles);

        // Generate the summary
        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                channels: channelSummaries,
                messages: cleanedMessages.map((m) => m.text).join("\n"),
                userRoles: userRoles.map((r) => r.name).join(", "),
            },
            generateRoleSpecificTemplate(userRoles)
        );
    },
};
