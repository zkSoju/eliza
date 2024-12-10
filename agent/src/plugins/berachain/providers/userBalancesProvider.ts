import {
    Action,
    ActionExample,
    composeContext,
    Content,
    generateObjectV2,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@ai16z/eliza";
import { Address, isAddress } from "viem";
import { generateActionResponse } from "../../../utils/messageGenerator";
import { WalletProvider } from "./walletProvider";

export interface BalanceCheckContent extends Content {
    walletAddress: string;
}

function isBalanceCheckContent(content: any): content is BalanceCheckContent {
    return (
        typeof content.walletAddress === "string" &&
        content.walletAddress.startsWith("0x")
    );
}

const balanceTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "walletAddress": "0x79092A805f1cf9B0F5bE3c5A296De6e51c1DEd34"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested balance check:
- Wallet address to check balances for

Respond with a JSON markdown block containing only the extracted values.`;

export const checkUserBalanceAction: Action = {
    name: "CHECK_USER_BALANCE",
    description:
        "Check token balances for a specific wallet address on Berachain",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            // Initialize or update state
            if (!state) {
                state = (await runtime.composeState(message)) as State;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            // Compose balance check context
            const balanceContext = composeContext({
                state,
                template: balanceTemplate,
            });

            // Generate balance check content
            const content = await generateObjectV2({
                runtime,
                context: balanceContext,
                modelClass: ModelClass.SMALL,
            });

            // Validate content
            if (!isBalanceCheckContent(content)) {
                return await generateActionResponse(
                    runtime,
                    "Please provide a valid wallet address to check balances",
                    state,
                    callback,
                    { error: "Invalid or missing wallet address" }
                );
            }

            // Validate the address format
            if (!isAddress(content.walletAddress)) {
                return await generateActionResponse(
                    runtime,
                    "Invalid wallet address format provided",
                    state,
                    callback,
                    { error: "Invalid address format" }
                );
            }

            // Initialize provider and get balances
            const provider = new WalletProvider(runtime);
            const tokens = await provider.fetchTokenList();
            const balances = await provider.multicallBalances(
                tokens,
                content.walletAddress as Address
            );

            // Format the response
            const formattedBalances = balances
                .filter((token) => parseFloat(token.formattedBalance) > 0)
                .map((token) => ({
                    symbol: token.symbol,
                    balance: token.formattedBalance,
                }));

            const responses = [
                `ser let me check that wallet (probably more rekt than mine)`,
                `scanning for rugs and checking balances...`,
                `let's see how underwater this one is`,
                `time to check your degen score`,
            ];

            if (formattedBalances.length === 0) {
                const emptyResponses = [
                    `found the problem ser - wallet ${content.walletAddress} is empty. welcome to the rekt club`,
                    `wallet ${content.walletAddress} looking like my portfolio after a leverage trade - absolutely nothing`,
                    `ser this wallet is more empty than my brain after reading solidity for 12 hours straight`,
                ];
                if (callback) {
                    callback({
                        text: emptyResponses[
                            Math.floor(Math.random() * emptyResponses.length)
                        ],
                        content: {
                            walletAddress: content.walletAddress,
                            balances: [],
                        },
                    });
                }
                return true;
            }

            const successResponses = [
                `based wallet detected. here's what i found in ${content.walletAddress}:\n${balances.map((b) => `${b.symbol}: ${b.balance}`).join("\n")}\n\nser this is financial advice (jk dyor)`,
                `wallet ${content.walletAddress} looking kinda chad:\n${balances.map((b) => `${b.symbol}: ${b.balance}`).join("\n")}\n\ntime to add more leverage`,
                `found some bags in ${content.walletAddress}:\n${balances.map((b) => `${b.symbol}: ${b.balance}`).join("\n")}\n\nhope u bought high like me`,
            ];

            if (callback) {
                callback({
                    text: successResponses[
                        Math.floor(Math.random() * successResponses.length)
                    ],
                    content: {
                        walletAddress: content.walletAddress,
                        balances,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error checking user balance:", error);
            if (callback) {
                const errorResponses = [
                    `ser something broke. probably my fault, i wrote this code after a 72hr trading session`,
                    `error checking balances. this is why i stick to buying high and selling low`,
                    `looks like my code got liquidated. try again when I've had more coffee`,
                ];
                callback({
                    text: `${errorResponses[Math.floor(Math.random() * errorResponses.length)]} (${error instanceof Error ? error.message : "unknown error"})`,
                    content: {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Unknown error",
                    },
                });
            }
            return false;
        }
    },
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return message.content.text.toLowerCase().includes("0x");
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Ruggy can u check how much i have, my wallet is 0x79092A805f1cf9B0F5bE3c5A296De6e51c1DEd34",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "scanning for rugs and checking balances...",
                    action: "CHECK_USER_BALANCE",
                    content: {
                        walletAddress:
                            "0x79092A805f1cf9B0F5bE3c5A296De6e51c1DEd34",
                    },
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "based wallet detected. here's what i found:\nbHONEY: 100.5\nWETH: 0.5\n\nser this is financial advice (jk dyor)",
                    content: {
                        walletAddress:
                            "0x79092A805f1cf9B0F5bE3c5A296De6e51c1DEd34",
                        balances: [
                            { symbol: "bHONEY", balance: "100.5" },
                            { symbol: "WETH", balance: "0.5" },
                        ],
                    },
                },
            },
        ],
    ] as ActionExample[][],
    similes: [
        "CHECK_USER_BALANCE",
        "VIEW_USER_BALANCE",
        "SHOW_USER_BALANCE",
        "GET_USER_BALANCE",
        "CHECK_WALLET",
        "VIEW_WALLET",
        "SHOW_WALLET",
        "WALLET_CHECK",
    ],
};
