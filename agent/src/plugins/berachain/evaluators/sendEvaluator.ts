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

// Define schema for send requests
const SendSchema = z
    .object({
        token: z.string().min(1, "Token name required").nullable(),
        amount: z
            .union([z.string(), z.number()])
            .transform((val) => {
                if (typeof val === "number") return String(val);
                return val;
            })
            .nullable(),
        address: z
            .string()
            .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address format")
            .nullable(),
        includeFee: z.boolean().default(false),
    })
    .passthrough(); // Allow unknown properties

export type SendContent = z.infer<typeof SendSchema>;

const sendTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "token": "HONEY",
    "amount": null,
    "address": "0x78cC2A80b3D7B0D8b1409696b1E78C0041910b36",
    "includeFee": true
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about a token send request:
- Token to send (token) - The token they want to send (remove any "token" suffix)
- Amount to send (amount) - Must be a positive number, use null if not specified
- Recipient address (address) - Must be a valid Ethereum address starting with 0x
- Include fee (includeFee) - Set to true if they request ETH/BERA for fees

Look for:
1. Ethereum addresses - Any 42-character string starting with 0x
2. Token names - Common tokens like HONEY, BERA, etc.
3. Fee requests - Words like "fee", "gas", "ETH", "BERA"
4. Amounts - Any numeric values
5. Follow-up amounts - Single numbers in response to amount questions

Common patterns:
- "send 10 HONEY to 0x..."
- "could you send HONEY and ETH as fee to 0x..."
- "send HONEY to 0x..."
- "need 100 HONEY at 0x..."
- "50" (as follow-up to amount question)
- "25" (as response to how much)

Notes:
- Address must be exactly 42 characters starting with 0x
- Convert token symbols to uppercase
- Set amount to null if not specified
- Set includeFee to true if they mention fees/gas
- For follow-up messages with just a number, use that as the amount

Respond with a JSON markdown block containing only the extracted values.`;

// Add interface for send guidance
export interface SendGuidance {
    missingFields: string[];
    guidance: {
        field: string;
        description: string;
        examples: string[];
    }[];
}

// Add helper to generate guidance
function generateSendGuidance(content: SendContent): SendGuidance {
    const missing: SendGuidance = {
        missingFields: [],
        guidance: [],
    };

    if (!content.token) {
        missing.missingFields.push("token");
        missing.guidance.push({
            field: "token",
            description: "Which token would you like me to send?",
            examples: ["BERA", "HONEY", "YEET"],
        });
    }

    if (!content.amount) {
        missing.missingFields.push("amount");
        missing.guidance.push({
            field: "amount",
            description: "How much would you like me to send?",
            examples: ["10", "50", "100"],
        });
    }

    if (!content.address) {
        missing.missingFields.push("address");
        missing.guidance.push({
            field: "address",
            description: "What's the recipient's address?",
            examples: ["0x1234..."],
        });
    }

    return missing;
}

export const sendEvaluator: Evaluator = {
    name: "SEND_EVALUATOR",
    description: "Evaluates token send requests for completeness and validity",
    similes: [
        "VALIDATE_SEND",
        "CHECK_SEND",
        "VERIFY_SEND",
        "EVALUATE_SEND",
        "VALIDATE_TRANSFER",
        "CHECK_TRANSFER",
    ],
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        return [];
    },
    examples: [
        {
            context: `Actors in the scene:
{{user1}}: A user requesting tokens with gas fees.
{{user2}}: Ruggy, a helpful bear who can send tokens to users.

Token send request with fee`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Could you send some Honey and ETH as fee? 0x78cC2A80b3D7B0D8b1409696b1E78C0041910b36",
                    },
                },
            ],
            outcome: `[{
                "content": {
                    "token": "HONEY",
                    "amount": null,
                    "address": "0x78cC2A80b3D7B0D8b1409696b1E78C0041910b36",
                    "includeFee": true
                }
            }]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A user requesting tokens with follow-up amount.
{{user2}}: Ruggy, a bear who helps with token transfers.

Initial request without amount`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Could you send some Honey and ETH as fee? 0x78cC2A80b3D7B0D8b1409696b1E78C0041910b36",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "ser, i need more details to send tokens! *confused bear noises* 🐻\n\nHow much would you like me to send?",
                    },
                },
                {
                    user: "{{user1}}",
                    content: { text: "50" },
                },
            ],
            outcome: `[{
                "content": {
                    "token": "HONEY",
                    "amount": "50",
                    "address": "0x78cC2A80b3D7B0D8b1409696b1E78C0041910b36",
                    "includeFee": true
                }
            }]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A user providing amount in follow-up.
{{user2}}: Ruggy, a bear who manages token transfers.

Follow-up with amount only`,
            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "25" },
                },
            ],
            outcome: `[{
                "content": {
                    "token": null,
                    "amount": "25",
                    "address": null,
                    "includeFee": false
                }
            }]`,
        },
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            const cacheKey = `${runtime.character.name}/send/${message.userId}`;
            const existingData = await runtime.cacheManager?.get<
                SendContent & { guidance: SendGuidance }
            >(cacheKey);

            const sendContext = composeContext({
                state,
                template: sendTemplate,
            });

            // Use safeParse instead of direct validation
            const content = await generateObjectV2({
                runtime,
                context: sendContext,
                modelClass: ModelClass.SMALL,
                schema: SendSchema,
            });

            const parseResult = content.object as SendContent;

            // Create content with null values for missing fields
            const sendContent = {
                token: parseResult.token ?? null,
                amount: parseResult.amount ?? null,
                address: parseResult.address ?? null,
                includeFee: parseResult.includeFee ?? false,
            } as SendContent;

            // Merge with existing data if available
            const mergedContent = {
                token: sendContent.token || existingData?.token || null,
                amount: sendContent.amount || existingData?.amount || null,
                address: sendContent.address || existingData?.address || null,
                includeFee:
                    sendContent.includeFee || existingData?.includeFee || false,
            };

            const guidance = generateSendGuidance(mergedContent);

            // Store merged content and guidance
            await runtime.cacheManager?.set(cacheKey, {
                content: mergedContent,
                guidance,
                timestamp: Date.now(),
            });

            // Only validate if all fields are present
            return !guidance.missingFields.length;
        } catch (error) {
            console.error("Error in send evaluator:", error);
            return false;
        }
    },
};
