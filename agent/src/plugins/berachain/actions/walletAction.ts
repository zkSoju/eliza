import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateActionResponse } from "../../../utils/messageGenerator";
import { WalletProvider } from "../providers/walletProvider";

export const walletAction: Action = {
    name: "SHARE_WALLET",
    description: "Share wallet address with other users",
    similes: [
        "GET_WALLET",
        "SHOW_WALLET",
        "SHARE_ADDRESS",
        "MY_ADDRESS",
        "WALLET_ADDRESS",
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: unknown,
        callback: HandlerCallback
    ): Promise<boolean> => {
        try {
            const walletProvider = new WalletProvider(runtime);
            const walletClient = walletProvider.getWalletClient();

            if (!walletClient) {
                return await generateActionResponse(
                    runtime,
                    "Wallet not found or not initialized. Unable to share wallet address.",
                    state,
                    callback,
                    { error: "Wallet not initialized" }
                );
            }

            const address = walletClient.account.address;

            return await generateActionResponse(
                runtime,
                `Sharing wallet address: ${address}. Ready to receive tokens.`,
                state,
                callback,
                {
                    success: true,
                    data: { address },
                }
            );
        } catch (error) {
            return await generateActionResponse(
                runtime,
                "Error occurred while trying to access wallet address.",
                state,
                callback,
                { error: "Failed to get wallet address" }
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "what's your wallet address?" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Here's my wallet address: 0x4CA921d8686D86fDD85234667c98806f004E2EAB",
                    action: "SHARE_WALLET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "where can i send you tokens?" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "You can send tokens to: 0x4CA921d8686D86fDD85234667c98806f004E2EAB",
                    action: "SHARE_WALLET",
                },
            },
        ],
    ],
};
