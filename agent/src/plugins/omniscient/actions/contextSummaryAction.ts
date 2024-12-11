import {
    Action,
    elizaLogger,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    UUID,
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
    timestamp: string;
    text: string;
    user: string;
    userName: string;
    roles: string[];
    action?: string;
    replyTo?: string;
    url?: string;
    channelPath: string;
    channelInfo?: DiscordContent['channelInfo'];
}

function getChannelPath(content: DiscordContent): string {
    if (!content.channelInfo) return "Unknown Channel";

    const parts = [];
    if (content.channelInfo.categoryName) parts.push(content.channelInfo.categoryName);
    if (content.channelInfo.parentName && content.channelInfo.parentName !== content.channelInfo.categoryName) {
        parts.push(content.channelInfo.parentName);
    }
    parts.push(content.channelInfo.name);

    if (content.channelInfo.isThread) return `${parts.join(" > ")} (thread)`;
    return parts.join(" > ");
}

function cleanMessageForSummary(memory: Memory): CleanedMessage {
    const content = memory.content as DiscordContent;
    const roles = (content.roles || []).filter(r => r.name !== "@everyone");

    return {
        timestamp: new Date(memory.createdAt || Date.now()).toISOString(),
        text: content.text,
        user: content.user || memory.userId,
        userName: content.userName || "Unknown User",
        roles: roles.map((r) => r.name),
        url: content.url,
        channelPath: getChannelPath(content),
        channelInfo: content.channelInfo,
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

function groupMessagesByCategory(messages: CleanedMessage[]): { [key: string]: CleanedMessage[] } {
    return messages.reduce((acc: { [key: string]: CleanedMessage[] }, message) => {
        const categoryName = message.channelInfo?.categoryName || 'Uncategorized';
        if (!acc[categoryName]) {
            acc[categoryName] = [];
        }
        acc[categoryName].push(message);
        return acc;
    }, {});
}

function formatCategoryMessages(messages: CleanedMessage[]): string {
    return messages.map(m => {
        if ('importance' in m) {
            const importance = (m as any).importance;
            const category = (m as any).category ? `[${(m as any).category}] ` : "";
            return `- ${category}${m.text} (${m.channelPath}) ${m.url ? `[Link]` : ''}`;
        }
        return `- ${m.text} (${m.channelPath}) ${m.url ? `[Link]` : ''}`;
    }).join('\n');
}

function generateRoleSpecificTemplate(
    userRoles: Array<{ id: string; name: string }>
) {
    const roleNames = userRoles
        .filter(r => r.name !== "@everyone")
        .map((r) => r.name)
        .join(", ");
    return `Given the following context from various channels, provide a brief, focused summary for a team member with roles: ${roleNames || "General Member"}

Recent Activity by Category:
{{categoryMessages}}

Guidelines:
- Keep summaries extremely concise; expand only if there's substantial content
- Focus on actionable information and key updates
- Group by category/channel only if there are multiple active discussions
- Include message links for important items
- Match summary length to amount of actual content

Provide a clear, concise summary of recent activity.`;
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
        // Get user's roles from the message, excluding @everyone
        const content = message.content as DiscordContent;
        const userRoles = (content.roles || []).filter(r => r.name !== "@everyone");

        // First, get important messages from agent's global memory
        const importantMessages = await runtime.messageManager.getMemories({
            roomId: runtime.agentId, // Get from agent's global memory
            count: 100,
            unique: true,
        });

        elizaLogger.info("Important messages:", importantMessages);

        // Then get recent messages from current channel for immediate context
        const recentMessages = await runtime.messageManager.getMemories({
            roomId: message.roomId,
            count: 50, // Reduced count since we're combining with important messages
            unique: false,
        });

        // Clean and process messages
        const cleanedImportantMessages = importantMessages
            .filter((msg) => msg.content.text?.trim())
            .map((msg) => ({
                ...cleanMessageForSummary(msg),
                importance: (msg.content.importance as any)?.importance || 0,
                category: (msg.content.importance as any)?.category || "general_chat",
                originalRoomId: msg.content.originalRoomId,
            }));

        const cleanedRecentMessages = recentMessages
            .filter((msg) => msg.content.text?.trim())
            .map((msg) => cleanMessageForSummary(msg));

        // Group messages by channel
        const groupedMessages = groupMessagesByChannel([
            ...recentMessages,
            ...importantMessages.map((msg) => ({
                ...msg,
                roomId: (msg.content.originalRoomId || msg.roomId) as UUID,
            })),
        ]);

        // Format channel summaries with importance indicators and usernames
        const channelSummaries = Object.entries(groupedMessages)
            .map(([channelId, data]) => {
                const messages = data.messages
                    .map((m) => {
                        const content = m.content as DiscordContent;
                        const importance = (m.content.importance as any)?.importance;
                        const prefix = importance ? `[Priority: ${importance}] ` : "";
                        const userName = content.userName || "Unknown User";
                        const messageLink = content.url ? ` (${content.url})` : "";
                        return `${prefix}@${userName}: ${content.text}${messageLink}`;
                    })
                    .join("\n");
                const channelPath = getChannelPath(data.messages[0]?.content as DiscordContent);
                return `# ${channelPath}\n${messages}`;
            })
            .join("\n\n");

        // Format important messages with usernames and links
        const formattedImportantMessages = cleanedImportantMessages
            .map((m) => {
                const category = m.category ? `[${m.category}] ` : "";
                const messageLink = m.url ? ` (${m.url})` : "";
                return `[Priority: ${m.importance}] ${category}@${m.userName} in ${m.channelPath}: ${m.text}${messageLink}`;
            })
            .join("\n");

        // Format recent messages with usernames and links
        const formattedRecentMessages = cleanedRecentMessages
            .map((m) => {
                const messageLink = m.url ? ` (${m.url})` : "";
                return `@${m.userName} in ${m.channelPath}: ${m.text}${messageLink}`;
            })
            .join("\n");

        elizaLogger.info("Channel summaries:", channelSummaries);
        elizaLogger.info("Important messages:", formattedImportantMessages);
        elizaLogger.info("Recent messages:", formattedRecentMessages);
        elizaLogger.info("User roles:", userRoles);

        // Group and format messages by category
        const importantByCategory = groupMessagesByCategory(cleanedImportantMessages);
        const recentByCategory = groupMessagesByCategory(cleanedRecentMessages);

        // Combine and format all categories
        const allCategories = new Set([
            ...Object.keys(importantByCategory),
            ...Object.keys(recentByCategory)
        ]);

        const formattedCategories = Array.from(allCategories).map(category => {
            const importantMsgs = importantByCategory[category] || [];
            const recentMsgs = recentByCategory[category] || [];

            if (importantMsgs.length === 0 && recentMsgs.length === 0) return '';

            return `## ${category}
${importantMsgs.length > 0 ? 'Important Updates:\n' + formatCategoryMessages(importantMsgs) + '\n' : ''}${recentMsgs.length > 0 ? 'Recent Messages:\n' + formatCategoryMessages(recentMsgs) : ''}`;
        }).filter(Boolean).join('\n\n');

        // Generate the summary
        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                categoryMessages: formattedCategories,
                userRoles: userRoles.map((r) => r.name).join(", "),
            },
            generateRoleSpecificTemplate(userRoles)
        );
    },
};
