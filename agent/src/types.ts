import type { Token } from "@lifi/types";
import type {
    Account,
    Address,
    Chain,
    Hash,
    HttpTransport,
    PublicClient,
    WalletClient,
} from "viem";
import { z } from "zod";

export type SupportedChain = "berachain";

// Transaction types
export interface Transaction {
    hash: Hash;
    from: Address;
    to: Address;
    value: bigint;
    data?: `0x${string}`;
    chainId?: number;
}

// Token types
export interface TokenWithBalance {
    token: Token;
    balance: bigint;
    formattedBalance: string;
    priceUSD: string;
    valueUSD: string;
}

export interface WalletBalance {
    chain: SupportedChain;
    address: Address;
    totalValueUSD: string;
    tokens: TokenWithBalance[];
}

// Chain configuration
export interface ChainMetadata {
    chainId: number;
    name: string;
    chain: Chain;
    rpcUrl: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    blockExplorerUrl: string;
}

export interface ChainConfig {
    chain: Chain;
    publicClient: PublicClient<HttpTransport, Chain, Account | undefined>;
    walletClient?: WalletClient;
}

// Action parameters
export interface TransferParams {
    fromChain: SupportedChain;
    toAddress: Address;
    amount: string;
    data?: `0x${string}`;
}

export const SwapSchema = z.object({
    fromToken: z.string().min(1, "Token name required"),
    toToken: z.string().min(1, "Token name required"),
    amount: z
        .string()
        .nullable()
        .transform((val) => {
            if (!val) return null;
            const num = Number(val);
            if (isNaN(num) || num <= 0) return null;
            return val;
        }),
});

export type SwapContent = z.infer<typeof SwapSchema>;

export function isSwapContent(content: unknown): content is SwapContent {
    return SwapSchema.safeParse(content).success;
}

export function isCompleteSwapContent(content: SwapContent): boolean {
    return !!(content.fromToken && content.toToken && content.amount);
}

export interface BridgeParams {
    fromChain: SupportedChain;
    toChain: SupportedChain;
    fromToken: Address;
    toToken: Address;
    amount: string;
    toAddress?: Address;
}

// Plugin configuration
export interface EvmPluginConfig {
    rpcUrl?: {
        ethereum?: string;
        base?: string;
    };
    secrets?: {
        EVM_PRIVATE_KEY: string;
    };
    testMode?: boolean;
    multicall?: {
        batchSize?: number;
        wait?: number;
    };
}

// LiFi types
export type LiFiStatus = {
    status: "PENDING" | "DONE" | "FAILED";
    substatus?: string;
    error?: Error;
};

export type LiFiRoute = {
    transactionHash: Hash;
    transactionData: `0x${string}`;
    toAddress: Address;
    status: LiFiStatus;
};

// Provider types
export interface TokenData extends Token {
    symbol: string;
    decimals: number;
    address: Address;
    name: string;
    logoURI?: string;
    chainId: number;
}

export interface TokenPriceResponse {
    priceUSD: string;
    token: TokenData;
}

export interface TokenListResponse {
    tokens: TokenData[];
}

export interface ProviderError extends Error {
    code?: number;
    data?: unknown;
}

// Context System Types
export interface CommunityContext {
    name: string;
    description: string;
    customTerminology: Record<string, string>;
    roles: CommunityRole[];
    guidelines: string[];
}

export interface CommunityRole {
    name: string;
    description: string;
    permissions: string[];
}

// Social Sharing Types
export interface TradeShare {
    id: string;
    userId: string;
    timestamp: number;
    tradeType: "swap" | "liquidity" | "stake";
    fromToken: string;
    toToken: string;
    fromAmount: string;
    toAmount: string;
    profitPercentage?: number;
    comment?: string;
    likes: number;
    replies: ShareReply[];
}

export interface ShareReply {
    id: string;
    userId: string;
    timestamp: number;
    content: string;
    likes: number;
}

// Social Activity Types
export interface CommunityActivity {
    trades: TradeShare[];
    topTraders: string[];
    recentMilestones: Milestone[];
}

export interface Milestone {
    id: string;
    type: "trading_volume" | "community_achievement" | "user_achievement";
    description: string;
    timestamp: number;
    achieved: boolean;
}
