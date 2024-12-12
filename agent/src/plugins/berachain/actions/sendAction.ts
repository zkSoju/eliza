import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@ai16z/eliza";
import {
    erc20Abi,
    formatUnits,
    parseUnits,
    zeroAddress,
    type Hash,
} from "viem";
import { generateActionResponse } from "../../../utils/messageGenerator";
import { SendContent, SendGuidance } from "../evaluators/sendEvaluator";
import { WalletProvider } from "../providers/walletProvider";

interface SendResult {
    hash: Hash;
    token: string;
    amount: string;
    to: string;
    includeFee: boolean;
    feeHash?: Hash;
}

async function sendToken(
    runtime: IAgentRuntime,
    walletProvider: WalletProvider,
    token: string,
    amount: string,
    to: string,
    callback: HandlerCallback
): Promise<SendResult> {
    const walletClient = walletProvider.getWalletClient();
    const publicClient = walletProvider.getPublicClient(
        walletProvider.getCurrentChain()
    );

    if (!walletClient || !publicClient) {
        throw new Error("Wallet not initialized");
    }

    const pouchData = await walletProvider.getRuggyPouch();

    // Find token in pouch
    const tokenData =
        token.toUpperCase() === "BERA"
            ? {
                  symbol: "BERA",
                  decimals: 18,
                  address: zeroAddress,
                  balance: pouchData.bera, // Include balance for BERA
                  formattedBalance: formatUnits(BigInt(pouchData.bera), 18),
              }
            : pouchData.tokens.find(
                  (t) => t.symbol.toUpperCase() === token.toUpperCase()
              );

    if (!tokenData) {
        throw new Error(`Token ${token} not found in pouch`);
    }

    // Convert amount to proper decimals
    const amountWithDecimals = parseUnits(amount, tokenData.decimals);

    // Check balance
    if (token.toUpperCase() === "BERA") {
        const balance = BigInt(pouchData.bera);
        if (balance < amountWithDecimals) {
            throw new Error(
                `Insufficient BERA balance. Have ${formatUnits(balance, 18)}, need ${amount}`
            );
        }
    } else {
        const balance = BigInt(tokenData.balance);
        if (balance < amountWithDecimals) {
            throw new Error(
                `Insufficient ${token} balance. Have ${formatUnits(balance, tokenData.decimals)}, need ${amount}`
            );
        }
    }

    elizaLogger.info("Sending token", {
        token: tokenData.symbol,
        amount: amount,
        to: to,
    });

    let hash: Hash;

    if (token.toUpperCase() === "BERA") {
        // Send native token
        hash = await walletClient.sendTransaction({
            to: to as `0x${string}`,
            value: amountWithDecimals,
        } as any);
    } else {
        // Send ERC20 token
        hash = await walletClient.writeContract({
            address: tokenData.address,
            abi: erc20Abi,
            functionName: "transfer",
            args: [to as `0x${string}`, amountWithDecimals],
        } as any);
    }

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
    });

    return {
        hash,
        token: tokenData.symbol,
        amount: amount,
        to,
        includeFee: false,
    };
}

export const sendAction: Action = {
    name: "SEND_TOKEN",
    description: "Send tokens to specified wallet addresses",
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
            const cacheKey = `${runtime.character.name}/send/${message.userId}`;
            const cachedData = await runtime.cacheManager?.get<{
                content: SendContent;
                guidance: SendGuidance;
                timestamp: number;
            }>(cacheKey);

            if (!cachedData) {
                callback({
                    text: "oopsie! something went wrong... *confused bear noises* 🐻",
                    content: { error: "No send data found" },
                });
                return false;
            }

            if (cachedData.guidance?.missingFields.length) {
                const { guidance } = cachedData;
                const guidanceText = guidance.guidance
                    .map(
                        (g) =>
                            `${g.description}\nexamples: ${g.examples.join(", ")}`
                    )
                    .join("\n\n");

                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    `Need more details for token send: \n${guidanceText}`,
                    {
                        error: "Incomplete send details",
                        data: {
                            guidance: guidance.guidance,
                            missingFields: guidance.missingFields,
                        },
                    }
                );
            }

            const { content, guidance } = cachedData;

            if (!content.token || !content.address) {
                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    "Missing required token or address information",
                    { error: "Missing required fields" }
                );
            }

            await generateActionResponse(
                runtime,
                state,
                callback,
                "Checking token availability and preparing transfer",
                {
                    success: true,
                    data: { status: "checking" },
                }
            );

            const walletProvider = new WalletProvider(runtime);

            try {
                // Send main token
                const result = await sendToken(
                    runtime,
                    walletProvider,
                    content.token,
                    content.amount || "10", // Default amount if not specified
                    content.address,
                    callback
                );

                // Send BERA for fees if requested
                let feeResult;
                if (content.includeFee) {
                    try {
                        feeResult = await sendToken(
                            runtime,
                            walletProvider,
                            "BERA",
                            "0.1", // Default fee amount
                            content.address,
                            callback
                        );
                        result.feeHash = feeResult.hash;
                        result.includeFee = true;
                    } catch (feeError) {
                        elizaLogger.error("Failed to send fee:", feeError);
                        // Continue even if fee send fails
                    }
                }

                const feeText = feeResult
                    ? `Additional fee transfer: ${feeResult.amount} BERA`
                    : "";

                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    `Successfully transferred ${result.amount} ${result.token} to ${result.to}. ${feeText} Transaction hash: ${result.hash}`,
                    {
                        success: true,
                        data: {
                            ...result,
                            feeHash: feeResult?.hash,
                        },
                    }
                );

                // Clear cache after successful send
                await runtime.cacheManager?.delete(cacheKey);
                return true;
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : "Unknown error";
                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    `Transfer failed: ${errorMessage}`,
                    { error: errorMessage }
                );
            }
        } catch (error) {
            elizaLogger.error("Error in send action:", error);
            return await generateActionResponse(
                runtime,
                state,
                callback,
                "Failed to send tokens",
                { error: "Send failed" }
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Could you send some Honey and ETH as fee? 0x1234...",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Checking token availability and preparing transfer",
                    action: "SEND_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "send 100 BERA to 0x1234...",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Preparing to transfer 100 BERA",
                    action: "SEND_TOKEN",
                },
            },
        ],
    ],
    similes: ["SEND_TOKEN", "TRANSFER_TOKEN", "GIVE_TOKEN"],
};
