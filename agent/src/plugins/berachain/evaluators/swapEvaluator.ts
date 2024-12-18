import {
    Evaluator,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    generateObjectV2,
} from "@ai16z/eliza";
import { z } from "zod";
import { SwapContent, SwapSchema } from "../../../types";
import { getSwapCacheKey } from "../actions/swapAction";

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "fromToken": "BERA",
    "toToken": "HONEY",
    "amount": "10"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about a token swap request:
- Source token (fromToken) - The token they want to swap from (remove any "token" suffix)
- Destination token (toToken) - The token they want to swap to (remove any "token" suffix)
- Amount to swap (must be a positive number)

Look for phrases like:
- "grab/get/ape into X"
- "swap/trade/convert X for/to Y"
- "let me get some X"
- "can you get me X"
- "need/want some X"
- "send it into X"
- "let's get some X"
- "do X more" - Use exact number specified
- "X more" - Use exact number specified

Common patterns:
- "swap 10 BERA for HONEY"
- "grab some JANITOOR"
- "ape into HONEY"
- "get me 5 HONEY ser"
- "25 more"
- "let's do 10 more"
- "do another 50"

Notes:
- For "X more" requests, use the exact amount specified (don't use previous amount)
- Remove words like "token(s)", "coin(s)" from token names
- Handle common variations like "ser", "pls", "please"
- Convert token symbols to uppercase
- Ignore emojis and extra punctuation

If amount is missing but required, return null.
Respond with a JSON markdown block containing only the extracted values.`;

// Add interface for swap guidance
export interface SwapGuidance {
    missingFields: string[];
    guidance: {
        field: string;
        description: string;
        examples: string[];
    }[];
}

// Add helper to generate guidance
function generateSwapGuidance(content: SwapContent): SwapGuidance {
    const missing: SwapGuidance = {
        missingFields: [],
        guidance: [],
    };

    if (!content.fromToken) {
        missing.missingFields.push("fromToken");
        missing.guidance.push({
            field: "fromToken",
            description: "Which token would you like to swap from?",
            examples: ["BERA", "USDC", "HONEY"],
        });
    }

    if (!content.toToken) {
        missing.missingFields.push("toToken");
        missing.guidance.push({
            field: "toToken",
            description: "Which token would you like to receive?",
            examples: ["HONEY", "BERA", "YEET"],
        });
    }

    if (!content.amount) {
        missing.missingFields.push("amount");
        missing.guidance.push({
            field: "amount",
            description: "How much would you like to swap?",
            examples: ["50", "100", "10.5"],
        });
    }

    return missing;
}

// Add interface for conversation state
interface SwapConversationState {
    fromToken?: string;
    toToken?: string;
    amount?: string;
    lastUpdate: number;
}

const confirmationTemplate = `Given the recent messages, determine if the user is confirming or denying a swap request.

Look for confirmation phrases like:
- "yes", "yeah", "sure", "confirm"
- "do it", "send it", "lets go", "lfg"
- "ok", "okay", "alright", "fine"

Look for denial phrases like:
- "no", "nah", "cancel", "stop"
- "wait", "hold on", "nevermind"
- "don't", "dont", "not now"

Respond with a JSON markdown block containing only the extracted values.

Example response:
\`\`\`json
{
    "type": "confirm",
    "content": {
        "fromToken": "BERA",
        "toToken": "HONEY",
        "amount": "10"
    }
}
\`\`\`

{{recentMessages}}`;

// Update schema to single object
const ConfirmationSchema = z.object({
    type: z.enum(["confirm", "deny"]),
    content: SwapSchema,
});

export const swapEvaluator: Evaluator = {
    name: "SWAP_EVALUATOR",
    description: "Evaluates swap requests for completeness and validity",
    similes: [
        "VALIDATE_SWAP",
        "CHECK_SWAP",
        "VERIFY_SWAP",
        "EVALUATE_SWAP",
        "VALIDATE_TRADE",
        "CHECK_TRADE",
    ],
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        // Handler is required but not used for evaluators
        return [];
    },
    examples: [
        {
            context: `Actors in the scene:
{{user1}}: A DeFi trader looking to swap tokens on Berachain.
{{user2}}: Ruggy, a degen bear who loves to trade tokens and provide liquidity.

Initial swap request - missing amount`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "ape into honey" },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "ser, how much USDC should i swap for HONEY? *curious bear noises* 🐻",
                    },
                },
                {
                    user: "{{user1}}",
                    content: { text: "50" },
                },
            ],
            outcome: `[{"content": {"fromToken": "USDC", "toToken": "HONEY", "amount": "50"}}]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A DeFi trader interested in yield farming on Berachain.
{{user2}}: Ruggy, a bear market survivor who provides liquidity and swaps tokens.

Multi-step swap request - building up parameters`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "swap honey" },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "ser, what do you want to swap that HONEY for? let's get those gains! 🐻",
                    },
                },
                {
                    user: "{{user1}}",
                    content: { text: "yeet" },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "how much HONEY would you like to swap for YEET? *excited bear noises* 🐻",
                    },
                },
                {
                    user: "{{user1}}",
                    content: { text: "100" },
                },
            ],
            outcome: `[{"content": {"fromToken": "HONEY", "toToken": "YEET", "amount": "100"}}]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A new trader exploring Berachain's ecosystem.
{{user2}}: Ruggy, a helpful bear who guides users through token swaps.

Default amount for grab/ape requests`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "grab some janitoor" },
                },
            ],
            outcome: `[{"content": {"fromToken": "USDC", "toToken": "JANITOOR", "amount": "50"}}]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: An experienced DeFi trader making precise swaps.
{{user2}}: Ruggy, a bear who loves to facilitate token swaps on Berachain.

Complete swap request in one message`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "swap 50 usdc for honey" },
                },
            ],
            outcome: `[{"content": {"fromToken": "USDC", "toToken": "HONEY", "amount": "50"}}]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A DeFi trader doing multiple swaps.
{{user2}}: Ruggy, a bear who helps with precise token swaps.

Follow-up swap request with new amount`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "let's do 25 more" },
                },
            ],
            outcome: `[{"content": {"fromToken": null, "toToken": null, "amount": "25"}}]`,
        },
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            const cacheKey = getSwapCacheKey(runtime, message.userId);
            const cachedData = await runtime.cacheManager?.get<{
                content: SwapContent;
                guidance: SwapGuidance;
                timestamp: number;
                awaitingConfirmation?: boolean;
            }>(cacheKey);

            // If awaiting confirmation, check for confirmation response
            if (cachedData?.awaitingConfirmation) {
                const confirmContext = composeContext({
                    state,
                    template: confirmationTemplate,
                });

                const confirmation = await generateObjectV2({
                    runtime,
                    context: confirmContext,
                    modelClass: ModelClass.SMALL,
                    schema: ConfirmationSchema,
                });

                const response = confirmation.object as z.infer<
                    typeof ConfirmationSchema
                >;

                if (response.type === "confirm") {
                    // Store confirmed state
                    await runtime.cacheManager?.set(cacheKey, {
                        ...cachedData,
                        confirmed: true,
                        awaitingConfirmation: false,
                        timestamp: Date.now(),
                    });
                    return true;
                }

                // If denied, clear the cache
                await runtime.cacheManager?.delete(cacheKey);
                return false;
            }

            // Get existing conversation state
            const conversationKey = `${runtime.character.name}/swap-conversation/${message.userId}`;
            const existingState =
                await runtime.cacheManager?.get<SwapConversationState>(
                    conversationKey
                );

            // Generate new content
            const swapContext = composeContext({
                state,
                template: swapTemplate,
            });

            const content = await generateObjectV2({
                runtime,
                context: swapContext,
                modelClass: ModelClass.SMALL,
                schema: SwapSchema,
            });

            const swapContent = content.object as SwapContent;

            // Merge with existing state
            const mergedContent = {
                fromToken: swapContent.fromToken || existingState?.fromToken,
                toToken: swapContent.toToken || existingState?.toToken,
                amount: swapContent.amount || existingState?.amount,
            };

            // Store conversation state
            await runtime.cacheManager?.set<SwapConversationState>(
                conversationKey,
                {
                    ...mergedContent,
                    lastUpdate: Date.now(),
                }
            );

            // Store merged content in swap cache
            const guidance = generateSwapGuidance(mergedContent);

            await runtime.cacheManager?.set<{
                content: SwapContent;
                guidance: SwapGuidance;
                timestamp: number;
            }>(cacheKey, {
                content: mergedContent,
                guidance,
                timestamp: Date.now(),
            });

            // Only validate if all fields are present
            return !guidance.missingFields.length;
        } catch (error) {
            console.error("Error in swap evaluator:", error);
            return false;
        }
    },
};
