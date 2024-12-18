import {
    Action,
    elizaLogger,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import {
    erc20Abi,
    parseEther,
    parseUnits,
    PublicClient,
    WalletClient,
    zeroAddress,
} from "viem";
import { isCompleteSwapContent, type SwapContent } from "../../../types";
import { generateActionResponse } from "../../../utils/messageGenerator";
import { SwapGuidance } from "../evaluators/swapEvaluator";
import {
    RuggyPouch,
    TokenBalance,
    WalletProvider,
} from "../providers/walletProvider";

interface SwapResult {
    status: string;
    tokenFrom: number;
    tokenTo: number;
    price: number;
    priceImpact: number;
    amountIn: string;
    amountOutFee: string;
    assumedAmountOut: string;
    tokens: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
    }[];
    route: {
        poolAddress: string;
        poolType: string;
        poolName: string;
        poolFee: number;
        tokenFrom: number;
        tokenTo: number;
        share: number;
        assumedAmountIn: string;
        assumedAmountOut: string;
        liquiditySource: string;
    }[];
    tx: {
        to: string;
        data: string;
        value: string;
        hash?: string;
    };
}

async function swapWithOogaBooga(
    runtime: IAgentRuntime,
    walletClient: WalletClient,
    publicClient: PublicClient,
    tokenInAddress: string,
    tokenOutAddress: string,
    amount: string,
    to: string,
    callback: HandlerCallback,
    slippage: string = "0.05"
): Promise<SwapResult> {
    const PUBLIC_API_URL = runtime.getSetting("OOGABOOGA_API_URL");
    const API_KEY = runtime.getSetting("OOGABOOGA_API_KEY");
    const ROUTER_ADDRESS = runtime.getSetting("OOGABOOGA_ROUTER_ADDRESS");

    if (!PUBLIC_API_URL || !API_KEY || !ROUTER_ADDRESS) {
        throw new Error("Missing OogaBooga configuration");
    }

    try {
        // Construct the swap URL with parameters
        const swapUrl = new URL(`${PUBLIC_API_URL}/v1/swap`);
        swapUrl.searchParams.set("tokenIn", tokenInAddress);
        swapUrl.searchParams.set("tokenOut", tokenOutAddress);
        swapUrl.searchParams.set("amount", amount);
        swapUrl.searchParams.set("to", to);
        swapUrl.searchParams.set("slippage", slippage);

        elizaLogger.log("Swap URL:", swapUrl.toString());

        // Fetch swap data from the API
        const res = await fetch(swapUrl, {
            headers: { Authorization: `Bearer ${API_KEY}` },
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API request failed: ${errorText}`);
        }

        let swapData: SwapResult;
        try {
            swapData = await res.json();

            elizaLogger.log("Swap response:", swapData);
        } catch (parseError) {
            elizaLogger.error("Failed to parse swap response:", parseError);
            throw new Error("Invalid response from swap API");
        }

        if (swapData.status === "NoWay") {
            elizaLogger.error("No way to swap");
            throw new Error("No way to swap these tokens");
        }

        if (!swapData.tx || typeof swapData.tx !== "object") {
            throw new Error("Invalid swap transaction data");
        }

        elizaLogger.log("Preparing swap transaction:", {
            to: swapData.tx.to,
            value: amount || 0,
        });

        // Execute the swap transaction
        const hash = await walletClient.sendTransaction({
            to: swapData.tx.to as `0x${string}`,
            data: swapData.tx.data as `0x${string}`,
            value: BigInt(swapData.tx.value || 0),
        } as any);

        elizaLogger.log("Swap transaction executed:", { hash });

        return {
            ...swapData,
            tx: {
                ...swapData.tx,
                hash,
            },
        };
    } catch (error) {
        elizaLogger.error("Error in swapWithOogaBooga:", error);
        throw error;
    }
}

async function checkAndApproveToken(
    runtime: IAgentRuntime,
    state: State,
    walletClient: WalletClient,
    publicClient: PublicClient,
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
    callback: HandlerCallback
): Promise<boolean> {
    try {
        // Skip approval for native token
        if (tokenAddress === zeroAddress) return true;

        // Check current allowance
        const allowance = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "allowance",
            args: [
                walletClient.account.address,
                spenderAddress as `0x${string}`,
            ],
        });

        // If allowance is sufficient, no need to approve
        if (allowance >= amount) return true;

        await generateActionResponse(
            runtime,
            state,
            callback,
            "Token approval initiated",
            {
                success: true,
                data: { status: "approving" },
            }
        );

        // Send approval transaction
        const hash = await walletClient.writeContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "approve",
            args: [spenderAddress as `0x${string}`, amount],
        } as any);

        // Wait for approval confirmation
        await publicClient.waitForTransactionReceipt({ hash });

        await generateActionResponse(
            runtime,
            state,
            callback,
            "Token approval confirmed",
            {
                success: true,
                data: { status: "approved", hash },
            }
        );

        return true;
    } catch (error) {
        elizaLogger.error("Approval error:", error);
        return await generateActionResponse(
            runtime,
            state,
            callback,
            `Error approving token: ${error instanceof Error ? error.message : "Unknown error"}`,
            { error: "Approval failed" }
        );
    }
}

// Add helper function for token matching
function findTokenBySymbol(
    tokens: TokenBalance[],
    searchSymbol: string
): TokenBalance | undefined {
    const normalizedSearch = searchSymbol
        .toUpperCase()
        .replace(/\s+/g, "") // Remove spaces
        .replace(/TOKEN$/i, ""); // Remove "token" suffix if present

    return tokens.find((token) => {
        const normalizedSymbol = token.symbol
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/TOKEN$/i, "");

        return normalizedSymbol === normalizedSearch;
    });
}

// Add helper to get token decimals
function getTokenDecimals(token: string, pouchData: RuggyPouch): number {
    if (token.toUpperCase() === "BERA") return 18;
    return (
        pouchData.tokens.find(
            (t) => t.symbol.toUpperCase() === token.toUpperCase()
        )?.decimals || 18
    );
}

// Add helper function for cache key
export function getSwapCacheKey(
    runtime: IAgentRuntime,
    userId: string
): string {
    return `${runtime.character.name}/swap/${userId}`;
}

// Add field guidance for swap parameters
const SWAP_FIELD_GUIDANCE = {
    fromToken: {
        description: "Source token to swap from",
        valid: "BERA, HONEY, USDC, STGUSDC",
        invalid:
            "tokens not in Ruggy's pouch, made-up tokens, or non-existent tokens",
        instructions: "Extract only valid token symbols from user's request",
    },
    toToken: {
        description: "Destination token to swap to",
        valid: "BERA, HONEY, USDC, STGUSDC",
        invalid:
            "tokens not listed on Berachain, made-up tokens, or non-existent tokens",
        instructions: "Extract only valid token symbols from user's request",
    },
    amount: {
        description: "Amount of source token to swap",
        valid: "positive numbers like 10, 5.5, 100",
        invalid: "negative numbers, zero, or non-numeric values",
        instructions:
            "Extract only positive numeric values, default to 50 for grab/ape requests",
    },
} as const;

// Initialize empty swap data
const emptySwapData: SwapContent = {
    fromToken: null,
    toToken: null,
    amount: null,
};

// Add helper to get missing field guidance
function getMissingFieldGuidance(content: SwapContent): {
    field: keyof typeof SWAP_FIELD_GUIDANCE;
    guidance: (typeof SWAP_FIELD_GUIDANCE)[keyof typeof SWAP_FIELD_GUIDANCE];
}[] {
    const missing: {
        field: keyof typeof SWAP_FIELD_GUIDANCE;
        guidance: (typeof SWAP_FIELD_GUIDANCE)[keyof typeof SWAP_FIELD_GUIDANCE];
    }[] = [];

    if (!content.fromToken)
        missing.push({
            field: "fromToken",
            guidance: SWAP_FIELD_GUIDANCE.fromToken,
        });
    if (!content.toToken)
        missing.push({
            field: "toToken",
            guidance: SWAP_FIELD_GUIDANCE.toToken,
        });
    if (!content.amount)
        missing.push({ field: "amount", guidance: SWAP_FIELD_GUIDANCE.amount });

    return missing;
}

// Add helper to format swap preview
function formatSwapPreview(content: SwapContent, balance?: string): string {
    const baseText = `Preparing to swap ${content.amount} ${content.fromToken} for ${content.toToken}`;
    const balanceText = balance
        ? `\nCurrent balance: ${balance} ${content.fromToken}`
        : "";
    const confirmText = "\nPlease confirm this transaction.";

    return `${baseText}${balanceText}${confirmText}`;
}

export const swapAction: Action = {
    name: "SWAP_TOKEN",
    description: "Swap tokens between supported pairs",
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State
    ): Promise<boolean> => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback: HandlerCallback
    ): Promise<boolean> => {
        try {
            // Get cached swap data
            const cacheKey = getSwapCacheKey(runtime, message.userId);
            const cachedData = await runtime.cacheManager?.get<{
                content: SwapContent;
                guidance: SwapGuidance;
                timestamp: number;
                awaitingConfirmation?: boolean;
            }>(cacheKey);

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
                    `Need more details for swap: \n${guidanceText}`,
                    {
                        error: "Incomplete swap details",
                        data: {
                            guidance: guidance.guidance,
                            missingFields: guidance.missingFields,
                        },
                    }
                );
            }

            const swapContent = cachedData.content;

            // If using defaults or first attempt, show preview
            if (!cachedData.awaitingConfirmation && !swapContent.amount) {
                const walletProvider = new WalletProvider(runtime);
                const pouchData = await walletProvider.getRuggyPouch();

                let balance: string | undefined;
                if (swapContent.fromToken.toUpperCase() === "BERA") {
                    balance = formatUnits(BigInt(pouchData.bera), 18);
                } else {
                    const token = pouchData.tokens.find(
                        (t) =>
                            t.symbol.toUpperCase() ===
                            swapContent.fromToken.toUpperCase()
                    );
                    if (token) {
                        balance = token.formattedBalance;
                    }
                }

                // Store awaiting confirmation state
                await runtime.cacheManager?.set(cacheKey, {
                    ...cachedData,
                    awaitingConfirmation: true,
                    timestamp: Date.now(),
                });

                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    formatSwapPreview(swapContent, balance),
                    {
                        success: true,
                        data: {
                            status: "preview",
                            fromToken: swapContent.fromToken,
                            toToken: swapContent.toToken,
                            amount: swapContent.amount,
                            balance,
                            awaitingConfirmation: true,
                        },
                    }
                );
            }

            // Check for missing tokens first
            if (!swapContent.fromToken || !swapContent.toToken) {
                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    "Please specify which tokens you would like to swap. Available tokens include BERA, HONEY, STGUSDC and others.",
                    {
                        data: {
                            needsTokens: true,
                        },
                    }
                );
            }

            // Validate complete swap content
            if (!isCompleteSwapContent(swapContent)) {
                const missingFields = getMissingFieldGuidance(swapContent);
                const missingFieldNames = missingFields
                    .map((f) => f.field)
                    .join(", ");

                let responseText = `Please provide additional details for the swap:\n\n`;

                missingFields.forEach(({ field, guidance }) => {
                    responseText += `${field}: ${guidance.description}\n`;
                    responseText += `examples: ${guidance.valid}\n\n`;
                });

                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    responseText,
                    {
                        error: "Incomplete swap details",
                        data: {
                            missingFields: missingFieldNames,
                            guidance: missingFields.map((f) => ({
                                field: f.field,
                                description: f.guidance.description,
                                valid: f.guidance.valid,
                            })),
                        },
                    }
                );
            }

            const walletProvider = new WalletProvider(runtime);
            const walletClient = walletProvider.getWalletClient();
            const publicClient = walletProvider.getPublicClient(
                walletProvider.getCurrentChain()
            );

            if (!walletClient || !publicClient) {
                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    "Wallet not initialized or accessible",
                    { error: "Wallet client not initialized" }
                );
            }

            // Get cached pouch data
            const pouchData = await runtime.cacheManager?.get<RuggyPouch>(
                `ruggy-pouch-${walletClient.account?.address}`
            );

            if (!pouchData) {
                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    "Unable to access wallet data",
                    { error: "No pouch data found" }
                );
            }

            // Check balances first
            if (swapContent.fromToken.toUpperCase() === "BERA") {
                const balance = BigInt(pouchData.bera);
                const amountWei = BigInt(Number(swapContent.amount) * 1e18);
                if (balance < amountWei) {
                    return await generateActionResponse(
                        runtime,
                        state,
                        callback,
                        `Insufficient ${swapContent.fromToken.toUpperCase()} balance. Have ${formatUnits(balance, 18)}, need ${swapContent.amount}`,
                        { error: "Insufficient balance" }
                    );
                }
            } else {
                const token = pouchData.tokens.find(
                    (t) =>
                        t.symbol.toUpperCase() ===
                        swapContent.fromToken.toUpperCase()
                );
                if (!token) {
                    return await generateActionResponse(
                        runtime,
                        state,
                        callback,
                        `No ${swapContent.fromToken.toUpperCase()} found in wallet. Available tokens: ${pouchData.tokens.map((t) => t.symbol).join(", ")}`,
                        { error: "Token not found" }
                    );
                }
                const balance = BigInt(token.balance);
                const amountWei = BigInt(
                    Number(swapContent.amount) * 10 ** token.decimals
                );
                if (balance < amountWei) {
                    return await generateActionResponse(
                        runtime,
                        state,
                        callback,
                        `Insufficient ${swapContent.fromToken.toUpperCase()} balance. Have ${formatUnits(balance, token.decimals)}, need ${swapContent.amount}`,
                        { error: "Insufficient balance" }
                    );
                }
            }

            // elizaLogger.log("Pouch data:", {
            //     tokens: pouchData.tokens,
            //     fromToken: swapContent.fromToken,
            //     toToken: swapContent.toToken,
            //     amount: swapContent.amount,
            // });

            // Get token addresses
            const fromTokenAddress =
                swapContent.fromToken.toUpperCase() === "BERA"
                    ? zeroAddress
                    : findTokenBySymbol(pouchData.tokens, swapContent.fromToken)
                          ?.address;

            const toTokenAddress =
                swapContent.toToken.toUpperCase() === "BERA"
                    ? zeroAddress
                    : findTokenBySymbol(pouchData.tokens, swapContent.toToken)
                          ?.address;

            // elizaLogger.log("Token addresses:", {
            //     fromTokenAddress,
            //     toTokenAddress,
            //     fromToken: swapContent.fromToken,
            //     toToken: swapContent.toToken,
            //     availableTokens: pouchData.tokens.map((t) => ({
            //         symbol: t.symbol,
            //         address: t.address,
            //     })),
            // });

            if (!fromTokenAddress || !toTokenAddress) {
                const invalidToken = !fromTokenAddress
                    ? swapContent.fromToken
                    : swapContent.toToken;
                const fieldGuidance = !fromTokenAddress
                    ? SWAP_FIELD_GUIDANCE.fromToken
                    : SWAP_FIELD_GUIDANCE.toToken;

                const availableTokens = pouchData.tokens
                    .map((t) => t.symbol)
                    .concat(["BERA"])
                    .join(", ");

                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    `Invalid token ${invalidToken}. Valid tokens: ${availableTokens}`,
                    {
                        error: "Invalid token",
                        data: {
                            guidance: fieldGuidance,
                            availableTokens: pouchData.tokens
                                .map((t) => t.symbol)
                                .concat(["BERA"]),
                        },
                    }
                );
            }

            // Convert amount based on decimals
            const token = pouchData.tokens.find(
                (t) =>
                    t.symbol.toUpperCase() ===
                    swapContent.fromToken.toUpperCase()
            );

            const amountWithDecimals = token
                ? (Number(swapContent.amount) * 10 ** token.decimals).toString()
                : (Number(swapContent.amount) * 10 ** 18).toString(); // Default to 18 decimals for BERA

            await generateActionResponse(
                runtime,
                state,
                callback,
                "Preparing swap transaction",
                {
                    success: true,
                    data: { status: "preparing" },
                }
            );

            elizaLogger.info("Preparing swap transaction");

            // Check and approve if needed
            const ROUTER_ADDRESS = runtime.getSetting(
                "OOGABOOGA_ROUTER_ADDRESS"
            );

            if (!ROUTER_ADDRESS) {
                throw new Error("Missing OogaBooga router address");
            }

            // Convert amount to Wei based on token decimals
            const amountWei =
                swapContent.fromToken.toUpperCase() === "BERA"
                    ? parseEther(swapContent.amount.toString())
                    : parseUnits(
                          swapContent.amount.toString(),
                          pouchData.tokens.find(
                              (t) =>
                                  t.symbol.toUpperCase() ===
                                  swapContent.fromToken.toUpperCase()
                          )?.decimals || 18
                      );

            const approved = await checkAndApproveToken(
                runtime,
                state,
                walletClient,
                publicClient as PublicClient,
                fromTokenAddress,
                ROUTER_ADDRESS,
                amountWei,
                callback
            );

            if (!approved) {
                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    `Failed to approve ${swapContent.fromToken} for trading`,
                    { error: "Approval failed" }
                );
            }

            try {
                // Execute swap with addresses
                const swapResult = await swapWithOogaBooga(
                    runtime,
                    walletClient,
                    publicClient as PublicClient,
                    fromTokenAddress,
                    toTokenAddress,
                    amountWithDecimals,
                    walletClient.account.address,
                    callback
                );

                // Wait for transaction confirmation
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: swapResult.tx.hash as `0x${string}`,
                    timeout: 60_000,
                });

                const toTokenDecimals = getTokenDecimals(
                    swapContent.toToken,
                    pouchData
                );
                const amountOut = swapResult.assumedAmountOut
                    ? BigInt(swapResult.assumedAmountOut)
                    : 0n;

                return await generateActionResponse(
                    runtime,
                    state,
                    callback,
                    `Successfully swapped ${swapContent.amount} ${swapContent.fromToken} for ${formatUnits(amountOut, toTokenDecimals)} ${swapContent.toToken}. Transaction hash: ${receipt.transactionHash}`,
                    {
                        success: true,
                        data: {
                            fromToken: swapContent.fromToken,
                            toToken: swapContent.toToken,
                            amountIn: swapContent.amount,
                            amountOut: formatUnits(amountOut, toTokenDecimals),
                            txHash: receipt.transactionHash,
                        },
                    }
                );
            } catch (swapError) {
                elizaLogger.error("Swap execution error:", swapError);

                // Handle specific error cases
                if (swapError.message?.includes("insufficient")) {
                    return await generateActionResponse(
                        runtime,
                        state,
                        callback,
                        "Insufficient liquidity available for this swap",
                        { error: "Insufficient liquidity" }
                    );
                } else if (swapError.message?.includes("slippage")) {
                    return await generateActionResponse(
                        runtime,
                        state,
                        callback,
                        "Price impact too high for this swap",
                        { error: "High slippage" }
                    );
                } else {
                    return await generateActionResponse(
                        runtime,
                        state,
                        callback,
                        `Swap failed: ${swapError.message || "Unknown error"}`,
                        { error: swapError.message || "Swap failed" }
                    );
                }
            }
        } catch (error) {
            logError(error);
            return await generateActionResponse(
                runtime,
                state,
                callback,
                `Error occurred during swap: ${error instanceof Error ? error.message : "Unknown error"}`,
                {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }
            );
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "swap 50 usdc for honey" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Preparing to swap 50 USDC for HONEY",
                    action: "SWAP_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "can you get some honey" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swapping 50 USDC for HONEY",
                    action: "SWAP_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "ape into janitoor" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swapping 50 USDC for JANITOOR",
                    action: "SWAP_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "let's get some yeet" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swapping 50 USDC for YEET",
                    action: "SWAP_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "send it into honey" },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Swapping 50 USDC for HONEY",
                    action: "SWAP_TOKEN",
                },
            },
        ],
    ],
    similes: [
        "SWAP_TOKEN",
        "SWAP_TOKENS",
        "TRADE_TOKEN",
        "TRADE_TOKENS",
        "EXCHANGE_TOKEN",
        "EXCHANGE_TOKENS",
        "GET_TOKEN",
        "GRAB_TOKEN",
        "APE_INTO",
    ],
};

function formatUnits(value: bigint, decimals: number): string {
    return (Number(value) / 10 ** decimals).toFixed(4);
}

function logError(error: unknown) {
    if (error instanceof Error) {
        elizaLogger.error("Swap action error:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
        });
    } else {
        elizaLogger.error("Unknown swap action error:", error);
    }
}
