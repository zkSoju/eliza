import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
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
    channelInfo?: DiscordContent["channelInfo"];
}

function getChannelPath(content: DiscordContent): string {
    if (!content.channelInfo) return "Unknown Channel";

    const parts = [];
    if (content.channelInfo.categoryName)
        parts.push(content.channelInfo.categoryName);
    if (
        content.channelInfo.parentName &&
        content.channelInfo.parentName !== content.channelInfo.categoryName
    ) {
        parts.push(content.channelInfo.parentName);
    }
    parts.push(content.channelInfo.name);

    if (content.channelInfo.isThread) return `${parts.join(" > ")} (thread)`;
    return parts.join(" > ");
}

function cleanMessageForSummary(memory: Memory): CleanedMessage {
    const content = memory.content as DiscordContent;
    const roles = (content.roles || []).filter((r) => r.name !== "@everyone");

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

// function groupMessagesByChannel(messages: Memory[]): GroupedMessages {
//     return messages.reduce((acc: GroupedMessages, message: Memory) => {
//         const channelId = message.roomId;
//         if (!acc[channelId]) {
//             acc[channelId] = {
//                 channelName: `Channel-${channelId.slice(0, 8)}`,
//                 messages: [],
//             };
//         }
//         acc[channelId].messages.push(message);
//         return acc;
//     }, {});
// }

function groupMessagesByCategory(messages: CleanedMessage[]): {
    [key: string]: CleanedMessage[];
} {
    return messages.reduce(
        (acc: { [key: string]: CleanedMessage[] }, message) => {
            const categoryName =
                message.channelInfo?.categoryName || "Uncategorized";
            if (!acc[categoryName]) {
                acc[categoryName] = [];
            }
            acc[categoryName].push(message);
            return acc;
        },
        {}
    );
}

function formatCategoryMessages(messages: CleanedMessage[]): string {
    return messages
        .map((m) => {
            if ("importance" in m) {
                const importance = (m as any).importance;
                const category = (m as any).category
                    ? `[${(m as any).category}] `
                    : "";
                const messageLink = m.url ? ` [[Link](${m.url})]` : "";
                return `- ${category}${m.text} (${m.channelPath})${messageLink}`;
            }
            const messageLink = m.url ? ` [[Link](${m.url})]` : "";
            return `- ${m.text} (${m.channelPath})${messageLink}`;
        })
        .join("\n");
}

function generateRoleSpecificTemplate(
    userRoles: Array<{ id: string; name: string }>
) {
    const roleNames = userRoles
        .filter((r) => r.name !== "@everyone")
        .map((r) => r.name)
        .join(", ");
    return `Provide a focused summary of key updates for a team member with roles: ${roleNames || "General Member"}

Recent Activity by Category:
{{categoryMessages}}

Guidelines:
- Prioritize and highlight important updates first
- Use emojis to categorize major updates (e.g., 🚨 Critical, 🎯 Goals)
- Format key decisions and action items with bold text (**)
- Include message links for critical references
- Only include recent messages if they add significant context
- Keep summaries focused on what matters most
- Use clear headers for different areas of focus
- Maintain professional but engaging tone

Focus on delivering the most impactful updates first, then add context from recent discussions if relevant.`;
}

export const contextSummaryAction: Action = {
    name: "SUMMARIZE_CONTEXT",
    description:
        "Summarizes recent context across channels, tailored to user's role",
    similes: [
        "SUMMARIZE_ALL",
        "GET_OVERVIEW",
        "CHECK_UPDATES",
        "DAILY_SUMMARY",
    ],
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
        const content = message.content as DiscordContent;
        const userRoles = (content.roles || []).filter(
            (r) => r.name !== "@everyone"
        );

        // Check if this is a daily summary
        const isDaily = content.action === "DAILY_SUMMARY";
        const lookbackHours = isDaily ? 24 : 4;
        const lookbackTime = Date.now() - lookbackHours * 60 * 60 * 1000;

        // Get important messages from agent's global memory
        const importantMessages = await runtime.messageManager.getMemories({
            roomId: stringToUuid("important-messages-" + runtime.agentId),
            count: 100,
            unique: true,
            start: lookbackTime,
        });

        // Get recent messages from current channel for immediate context
        const recentMessages = await runtime.messageManager.getMemories({
            roomId: message.roomId,
            count: 50,
            unique: false,
            start: lookbackTime,
        });

        // Clean and process messages
        const cleanedImportantMessages = importantMessages
            .filter((msg) => msg.content.text?.trim())
            .map((msg) => ({
                ...cleanMessageForSummary(msg),
                importance: (msg.content.importance as any)?.importance || 0,
                category:
                    (msg.content.importance as any)?.category || "general_chat",
                originalRoomId: msg.content.originalRoomId,
            }));

        const cleanedRecentMessages = recentMessages
            .filter((msg) => msg.content.text?.trim())
            .map((msg) => cleanMessageForSummary(msg));

        // Group and format messages by category
        const importantByCategory = groupMessagesByCategory(
            cleanedImportantMessages
        );
        const recentByCategory = groupMessagesByCategory(cleanedRecentMessages);

        // Combine and format all categories
        const allCategories = new Set([
            ...Object.keys(importantByCategory),
            ...Object.keys(recentByCategory),
        ]);

        const formattedCategories = Array.from(allCategories)
            .map((category) => {
                const importantMsgs = importantByCategory[category] || [];
                const recentMsgs = recentByCategory[category] || [];

                if (importantMsgs.length === 0 && recentMsgs.length === 0)
                    return "";

                return `## ${category}
${importantMsgs.length > 0 ? "Important Updates:\n" + formatCategoryMessages(importantMsgs) + "\n" : ""}${recentMsgs.length > 0 ? "Recent Messages:\n" + formatCategoryMessages(recentMsgs) : ""}`;
            })
            .filter(Boolean)
            .join("\n\n");

        // Use appropriate template based on whether this is a daily summary
        const template = isDaily
            ? generateDailySummaryTemplate()
            : generateRoleSpecificTemplate(userRoles);

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                categoryMessages: formattedCategories,
                userRoles: userRoles.map((r) => r.name).join(", "),
                timeframe: `${lookbackHours} hours`,
            },
            template,
            isDaily
                ? {
                      model: ModelClass.LARGE,
                  }
                : {}
        );
    },
};

function generateDailySummaryTemplate(): string {
    return `Provide a daily summary focusing on key organizational developments.

Recent Activity by Category:
{{categoryMessages}}

Guidelines:
- Lead with critical updates and important decisions
- Use emojis to highlight priority (e.g., 🚨 Critical, 🎯 Goals)
- Bold (**) key decisions and important changes
- Include message links for major updates
- Group by impact/priority first, then by category
- Only include routine discussions if they impact key initiatives
- Keep focus on actionable information
- Format for easy scanning in Discord

Emphasize the important developments first, then add context from general discussions if needed.`;
}
