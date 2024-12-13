import {
    Evaluator,
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

const ImportanceSchema = z.object({
    isImportant: z.boolean(),
    category: z.enum([
        "planning",
        "decision",
        "technical_detail",
        "requirement",
        "milestone",
        "blocker",
        "resolution",
        "general_chat",
    ]),
    importance: z.number().min(0).max(10),
    reason: z.string(),
    keyPoints: z.array(z.string()),
});

export type ImportanceAnalysis = z.infer<typeof ImportanceSchema>;

const importanceTemplate = `Analyze the importance of this message in the context of project planning and development.

Message Content:
{{messageContent}}

Recent Context:
{{recentContext}}

Guidelines for importance analysis:

Categories:
- planning: Project planning, roadmap discussions
- decision: Key decisions and approvals
- technical_detail: Important technical specifications
- requirement: Business or technical requirements
- milestone: Achievement of significant goals
- blocker: Issues blocking progress
- resolution: Solutions to problems
- general_chat: General conversation

Importance Scale (0-10):
0-2: General chat, greetings
3-4: Minor updates, clarifications
5-6: Useful information
7-8: Important decisions/information
9-10: Critical updates/blockers

Example response:
\`\`\`json
{
    "isImportant": true,
    "category": "technical_detail",
    "importance": 8,
    "reason": "Contains critical API specifications that affect multiple teams",
    "keyPoints": [
        "New authentication flow defined",
        "Rate limiting parameters specified",
        "Breaking changes identified"
    ]
}
\`\`\`

Analyze the message and provide a structured assessment of its importance.`;

export const importanceEvaluator: Evaluator = {
    name: "ANALYZE_IMPORTANCE",
    description:
        "Analyzes message importance and stores significant messages in global memory",
    similes: ["ASSESS_SIGNIFICANCE", "CHECK_RELEVANCE", "FILTER_IMPORTANCE"],
    examples: [
        {
            context: "Technical discussion about API changes",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "We need to update the authentication flow to use JWT tokens and implement rate limiting at 100 requests per minute per user.",
                        url: "https://discord.com/channels/1234/5678/9012",
                    },
                },
            ],
            outcome: `{
                "isImportant": true,
                "category": "technical_detail",
                "importance": 8,
                "reason": "Critical API security and performance specifications",
                "keyPoints": [
                    "Switch to JWT authentication",
                    "Rate limit: 100 req/min/user"
                ],
                "source": "https://discord.com/channels/1234/5678/9012"
            }`,
        },
        {
            context: "Product roadmap discussion",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "For Q2, we're prioritizing the analytics dashboard and user segmentation features. The mobile app will be pushed to Q3.",
                        url: "https://discord.com/channels/1234/5678/9013",
                    },
                },
            ],
            outcome: `{
                "isImportant": true,
                "category": "planning",
                "importance": 9,
                "reason": "Major product roadmap changes affecting multiple teams",
                "keyPoints": [
                    "Q2: Analytics dashboard priority",
                    "Q2: User segmentation features",
                    "Mobile app delayed to Q3"
                ],
                "source": "https://discord.com/channels/1234/5678/9013"
            }`,
        },
        {
            context: "Design system update",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "The new design system components are ready for review. Breaking changes: button variants are now primary/secondary instead of filled/outlined, and spacing units are standardized to 4px grid.",
                        url: "https://discord.com/channels/1234/5678/9014",
                    },
                },
            ],
            outcome: `{
                "isImportant": true,
                "category": "technical_detail",
                "importance": 7,
                "reason": "Design system changes affecting all frontend work",
                "keyPoints": [
                    "New button variant naming",
                    "Standardized 4px grid spacing",
                    "Breaking changes in design system"
                ],
                "source": "https://discord.com/channels/1234/5678/9014"
            }`,
        },
        {
            context: "Business development update",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Just closed the partnership with CloudCorp. They want API integration by end of month, minimum throughput requirement is 1M requests/day.",
                        url: "https://discord.com/channels/1234/5678/9015",
                    },
                },
            ],
            outcome: `{
                "isImportant": true,
                "category": "requirement",
                "importance": 9,
                "reason": "New partnership with critical technical requirements",
                "keyPoints": [
                    "CloudCorp partnership confirmed",
                    "End of month deadline",
                    "1M requests/day requirement"
                ],
                "source": "https://discord.com/channels/1234/5678/9015"
            }`,
        },
        {
            context: "General team chat",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Good morning everyone! Hope you all had a great weekend.",
                        url: "https://discord.com/channels/1234/5678/9016",
                    },
                },
            ],
            outcome: `{
                "isImportant": false,
                "category": "general_chat",
                "importance": 1,
                "reason": "General greeting without business impact",
                "keyPoints": [],
                "source": null
            }`,
        },
        {
            context: "Project blocker",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "The staging environment is down, CI pipeline is failing. All deployments are blocked until we fix the infrastructure issue.",
                        url: "https://discord.com/channels/1234/5678/9017",
                    },
                },
            ],
            outcome: `{
                "isImportant": true,
                "category": "blocker",
                "importance": 10,
                "reason": "Critical infrastructure issue blocking all teams",
                "keyPoints": [
                    "Staging environment down",
                    "CI pipeline failing",
                    "Deployments blocked"
                ],
                "source": "https://discord.com/channels/1234/5678/9017"
            }`,
        },
        {
            context: "Design feedback",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "User testing revealed major usability issues in the checkout flow. 60% of users fail to complete payment on first try. We need to redesign the credit card form.",
                        url: "https://discord.com/channels/1234/5678/9018",
                    },
                },
            ],
            outcome: `{
                "isImportant": true,
                "category": "requirement",
                "importance": 8,
                "reason": "Critical UX issue affecting business metrics",
                "keyPoints": [
                    "60% payment completion failure",
                    "Checkout flow usability issues",
                    "Credit card form needs redesign"
                ],
                "source": "https://discord.com/channels/1234/5678/9018"
            }`,
        },
    ],
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        return [];
    },
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            // If message is the agent's own message, skip
            if (message.userId === runtime.agentId) {
                return true;
            }

            elizaLogger.info("Importance evaluator triggered");

            // Get recent messages for context
            const recentMessages = await runtime.messageManager.getMemories({
                roomId: message.roomId,
                count: 10,
                unique: false,
            });

            const context = composeContext({
                state: {
                    ...state,
                    messageContent: message.content.text,
                    recentContext: recentMessages
                        .map((m) => m.content.text)
                        .join("\n"),
                },
                template: importanceTemplate,
            });

            const result = await generateObjectV2({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
                schema: ImportanceSchema,
            });

            elizaLogger.info(result.object);

            const analysis = result.object as ImportanceAnalysis;

            // If message is important, store it in agent's global memory
            if (analysis.importance >= 5) {
                const globalMemory: Memory = {
                    id: message.id,
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: stringToUuid(
                        "important-messages-" + runtime.agentId
                    ), // Store in agent's global memory
                    content: {
                        text: message.content.text,
                        source: message.content.source,
                        url: message.content.url,
                        channelInfo: message.content.channelInfo,
                        importance: analysis,
                        originalRoomId: message.roomId, // Keep track of original channel
                    },
                    createdAt: message.createdAt,
                };

                await runtime.messageManager.createMemory(globalMemory);

                // Cache the importance analysis
                const cacheKey = `${runtime.character.name}/message-importance/${message.id}`;
                await runtime.cacheManager?.set(cacheKey, analysis);
            }

            return true;
        } catch (error) {
            console.error("Error in importance evaluator:", error);
            return false;
        }
    },
};
