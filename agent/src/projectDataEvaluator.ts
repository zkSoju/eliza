import { Evaluator, IAgentRuntime, Memory, State } from "@ai16z/eliza";

export const projectDataEvaluator: Evaluator = {
    name: "SUMMARIZE_STRATEGY",
    description:
        "Evaluate and summarize organizational strategies and information",
    similes: ["STRATEGY_SUMMARY", "INFORMATION_DIGEST", "WEEKLY_RECAP"],
    handler: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        const strategies =
            await runtime.cacheManager?.get<string>("weekly_strategies");
        if (!strategies) {
            return "No strategies found for this week. Please add some strategies first.";
        }
        return strategies;
    },
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        // Check if it's a weekly summary request or contains strategy-related keywords
        const text = message.content.text.toLowerCase();
        return (
            text.includes("summary") ||
            text.includes("strategy") ||
            text.includes("recap") ||
            text.includes("digest")
        );
    },
    examples: [
        {
            context: "{{user1}} asks for a weekly strategy summary",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Can you give me a summary of our strategies this week?",
                    },
                },
            ],
            outcome:
                "Providing a concise weekly summary of organizational strategies",
        },
        {
            context: "{{user1}} wants to know about information management",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "How are we handling information overload?",
                    },
                },
            ],
            outcome:
                "Analyzing and summarizing information management approaches",
        },
    ],
};
