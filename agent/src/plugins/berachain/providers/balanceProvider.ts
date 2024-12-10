import type {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import {
    composeContext,
    elizaLogger,
    generateObjectV2,
    ModelClass,
} from "@ai16z/eliza";
import { z } from "zod";
import { generateActionResponse } from "../../../utils/messageGenerator";
import { TokenBalanceWithPrice, WalletProvider } from "./walletProvider";

// Define schema for balance check
export const BalanceSchema = z.object({
    token: z.string().nullable().optional(), // Optional and can be null for general balance check
});

export type BalanceContent = z.infer<typeof BalanceSchema>;

const balanceTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "token": null
}
\`\`\`

{{recentMessages}}

Given the recent messages, determine if the user is asking about a specific token balance.
If they mention a specific token (like BERA, HONEY, etc.), extract it.
If they're asking about all balances or their general portfolio, return null.

Common patterns for specific token:
- "how much BERA do you have"
- "check HONEY balance"
- "what's your USDC balance"

Common patterns for general balance check:
- "what's in your pouch"
- "show me your balance"
- "check balance"
- "what's your balance looking like"
- "how's your portfolio"

Respond with a JSON markdown block containing only the extracted values.`;

function logError(error: unknown) {
    if (error instanceof Error) {
        elizaLogger.error("Balance action error:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
        });
    } else {
        elizaLogger.error("Unknown balance action error:", error);
    }
}

export const balanceAction: Action = {
    name: "CHECK_BALANCE",
    description: "Check wallet balances and portfolio value",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            elizaLogger.log("Starting balance check...");

            // Compose balance context
            const balanceContext = composeContext({
                state,
                template: balanceTemplate,
            });

            // Generate and validate balance content
            const content = await generateObjectV2({
                runtime,
                context: balanceContext,
                modelClass: ModelClass.SMALL,
                schema: BalanceSchema,
            });

            const balanceContent = content.object as z.infer<
                typeof BalanceSchema
            >;

            const walletProvider = new WalletProvider(runtime);
            const walletClient = walletProvider.getWalletClient();

            if (!walletClient) {
                return await generateActionResponse(
                    runtime,
                    "Wallet not initialized or accessible",
                    state,
                    callback,
                    { error: "Wallet client not initialized" }
                );
            }

            // Get cached pouch data
            const pouchData = await walletProvider.getRuggyPouchWithPrices();

            if (!pouchData) {
                return await generateActionResponse(
                    runtime,
                    "Unable to access wallet data",
                    state,
                    callback,
                    { error: "No pouch data found" }
                );
            }

            // Check if asking for specific token (BERA)
            if (balanceContent.token?.toUpperCase() === "BERA") {
                const beraBalance = BigInt(pouchData.bera);
                const formattedBera = formatUnits(beraBalance, 18);
                const beraValueUSD =
                    pouchData.totalValueUSD -
                    pouchData.tokens.reduce((sum, t) => sum + t.valueUSD, 0);

                return await generateActionResponse(
                    runtime,
                    `Current BERA: ${formattedBera} ($${beraValueUSD.toFixed(2)})`,
                    state,
                    callback,
                    {
                        success: true,
                        data: {
                            bera: formattedBera,
                            valueUSD: beraValueUSD,
                        },
                    }
                );
            }

            // Check if asking for specific token (not BERA)
            if (balanceContent.token) {
                const token = pouchData.tokens.find(
                    (t) =>
                        t.symbol.toUpperCase() ===
                        balanceContent.token?.toUpperCase()
                ) as TokenBalanceWithPrice;

                if (!token) {
                    return await generateActionResponse(
                        runtime,
                        `Token ${balanceContent.token.toUpperCase()} not found in wallet`,
                        state,
                        callback,
                        { error: "Token not found" }
                    );
                }

                return await generateActionResponse(
                    runtime,
                    `${token.symbol}: ${token.formattedBalance} ($${token.valueUSD.toFixed(2)})`,
                    state,
                    callback,
                    {
                        success: true,
                        data: {
                            token: token.symbol,
                            balance: token.formattedBalance,
                            valueUSD: token.valueUSD,
                            decimals: token.decimals,
                        },
                    }
                );
            } else {
                // Show all balances with USD values
                const beraBalance = formatUnits(BigInt(pouchData.bera), 18);
                const beraValueUSD =
                    pouchData.totalValueUSD -
                    pouchData.tokens.reduce((sum, t) => sum + t.valueUSD, 0);

                let balanceText = `BERA: ${beraBalance} ($${beraValueUSD.toFixed(2)}) Total: $${pouchData.totalValueUSD.toFixed(2)}`;

                const nonZeroTokens = pouchData.tokens
                    .filter((token) => Number(token.formattedBalance) > 0)
                    .map(
                        (token) =>
                            `${token.symbol}: ${token.formattedBalance} ($${token.valueUSD.toFixed(2)})`
                    );

                if (nonZeroTokens.length > 0) {
                    balanceText +=
                        "\n\nOther tokens:\n" + nonZeroTokens.join("\n");
                    balanceText += `\n\nTotal portfolio value: $${pouchData.totalValueUSD.toFixed(2)}`;
                }

                return await generateActionResponse(
                    runtime,
                    balanceText,
                    state,
                    callback,
                    {
                        success: true,
                        data: {
                            bera: beraBalance,
                            beraValueUSD,
                            totalValueUSD: pouchData.totalValueUSD,
                            tokens: pouchData.tokens
                                .filter(
                                    (token) =>
                                        Number(token.formattedBalance) > 0
                                )
                                .map((token) => ({
                                    symbol: token.symbol,
                                    balance: token.formattedBalance,
                                    valueUSD: token.valueUSD,
                                    decimals: token.decimals,
                                })),
                        },
                    }
                );
            }
        } catch (error) {
            logError(error);
            return await generateActionResponse(
                runtime,
                "Error occurred while checking balances",
                state,
                callback,
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }
            );
        }
    },
    validate: async (runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "how much BERA do you have?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Current BERA balance: 19.8672 ($1,234.56)",
                    action: "CHECK_BALANCE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "check your HONEY balance",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Current HONEY balance: 500,039 ($50,003.90)",
                    action: "CHECK_BALANCE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "what's in your wallet?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `Current balances:
BERA: 19.8672 ($1,234.56)

Other tokens:
HONEY: 500,039 ($50,003.90)

Total portfolio value: $51,238.46`,
                    action: "CHECK_BALANCE",
                },
            },
        ],
    ],
    similes: [
        "CHECK_BALANCE",
        "VIEW_BALANCE",
        "SHOW_BALANCE",
        "GET_BALANCE",
        "CHECK_POUCH",
        "VIEW_POUCH",
        "SHOW_POUCH",
        "LIST_POUCH",
        "POUCH_CHECK",
        "WHATS_IN_POUCH",
    ],
};

function formatUnits(value: bigint, decimals: number): string {
    return (Number(value) / 10 ** decimals).toFixed(4);
}
