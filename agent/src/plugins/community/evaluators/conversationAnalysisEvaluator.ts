import {
    composeContext,
    elizaLogger,
    Evaluator,
    generateObjectV2,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
} from "@ai16z/eliza";
import { z } from "zod";

const ConversationAnalysisSchema = z.object({
    topic: z.string(),
    sentiment: z.enum(["positive", "negative", "neutral"]),
    engagement_level: z.number().min(1).max(10),
    key_points: z.array(z.string()),
    participants: z.array(z.string()),
    significance: z.number().min(1).max(10),
    context: z.string(),
});

const conversationTemplate = `Analyze this conversation and provide structured insights:

Message Content:
{{messageContent}}

Recent Context:
{{recentContext}}

Guidelines:
- Identify main topic and subtopics
- Assess sentiment and engagement
- Extract key discussion points
- Note participant dynamics
- Evaluate conversation significance

Response Format:
{
    "topic": "main discussion topic",
    "sentiment": "positive/negative/neutral",
    "engagement_level": 1-10,
    "key_points": [
        "important point from discussion"
    ],
    "participants": [
        "participant ids"
    ],
    "significance": 1-10,
    "context": "explanation of conversation context"
}`;

export const conversationAnalysisEvaluator: Evaluator = {
    name: "CONVERSATION_ANALYSIS",
    description: "Analyzes community conversations for patterns and insights",
    similes: [
        "ANALYZE_DISCUSSION",
        "PROCESS_CONVERSATION",
        "EVALUATE_DIALOGUE",
    ],
    examples: [
        {
            context: "Technical discussion",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "The new feature implementation looks good, but we should add more test coverage.",
                    },
                },
            ],
            outcome: `{
                "topic": "code_quality",
                "sentiment": "positive",
                "engagement_level": 7,
                "key_points": [
                    "Feature implementation approved",
                    "Need more test coverage"
                ],
                "participants": ["user1"],
                "significance": 6,
                "context": "Code review discussion with constructive feedback"
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
            // Skip agent's own messages
            if (message.userId === runtime.agentId) return true;

            elizaLogger.info("Conversation analysis evaluator triggered");

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
                template: conversationTemplate,
            });

            const result = await generateObjectV2({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
                schema: ConversationAnalysisSchema,
            });

            const analysis = result.object as z.infer<
                typeof ConversationAnalysisSchema
            >;

            // Only store conversations with significance >= 5
            if (analysis.significance >= 5) {
                // Store conversation analysis in memory
                const conversationMemory: Memory = {
                    id: message.id,
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: stringToUuid("community-" + runtime.agentId),
                    content: {
                        text: message.content.text,
                        analysis,
                        originalRoomId: message.roomId,
                        significance: analysis.significance,
                    },
                    createdAt: Date.now(),
                };

                await runtime.messageManager.createMemory(conversationMemory);
                elizaLogger.info("Stored significant conversation:", {
                    topic: analysis.topic,
                    significance: analysis.significance,
                });
            } else {
                elizaLogger.debug("Skipping low significance conversation:", {
                    topic: analysis.topic,
                    significance: analysis.significance,
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in conversation analysis:", error);
            return false;
        }
    },
};
