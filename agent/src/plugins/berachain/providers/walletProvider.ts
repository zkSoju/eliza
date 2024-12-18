import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza";
import {
    Account,
    Address,
    Chain,
    createPublicClient,
    createWalletClient,
    erc20Abi,
    formatUnits,
    http,
    HttpTransport,
    parseEther,
    PublicClient,
    WalletClient,
    zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { berachainTestnetbArtio } from "viem/chains";
import { ChainConfig, ChainMetadata, SupportedChain } from "../../../types";

interface Token {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
}

export interface TokenBalance {
    address: Address;
    symbol: string;
    balance: string;
    formattedBalance: string;
    decimals: number;
}

export interface RuggyPouch {
    tokens: TokenBalance[];
    bera: string;
    lastUpdated: number;
}

export const DEFAULT_CHAIN_CONFIGS: Record<SupportedChain, ChainMetadata> = {
    // ethereum: {
    //     chainId: 1,
    //     name: "Ethereum",
    //     chain: mainnet,
    //     rpcUrl: "https://eth.llamarpc.com",
    //     nativeCurrency: {
    //         name: "Ether",
    //         symbol: "ETH",
    //         decimals: 18,
    //     },
    //     blockExplorerUrl: "https://etherscan.io",
    // },
    // base: {
    //     chainId: 8453,
    //     name: "Base",
    //     chain: base,
    //     rpcUrl: "https://base.llamarpc.com",
    //     nativeCurrency: {
    //         name: "Ether",
    //         symbol: "ETH",
    //         decimals: 18,
    //     },
    //     blockExplorerUrl: "https://basescan.org",
    // },
    berachain: {
        chainId: 285,
        name: "Berachain bArtio",
        chain: berachainTestnetbArtio,
        rpcUrl: "http://141.95.85.219:8545/",
        nativeCurrency: {
            name: "Berachain",
            symbol: "Bera",
            decimals: 18,
        },
        blockExplorerUrl: "https://bartio.beratrail.io",
    },
} as const;

export const getChainConfigs = (runtime: IAgentRuntime) => {
    return (
        (runtime.character.settings.chains?.evm as ChainConfig[]) ||
        DEFAULT_CHAIN_CONFIGS
    );
};

// Add interfaces for price data
interface TokenPrice {
    address: string;
    price: number;
}

export interface TokenBalanceWithPrice extends TokenBalance {
    priceUSD: number;
    valueUSD: number;
}

export interface RuggyPouchWithPrices extends RuggyPouch {
    tokens: TokenBalanceWithPrice[];
    totalValueUSD: number;
}

export class WalletProvider {
    private chainConfigs: Record<SupportedChain, ChainConfig>;
    private currentChain: SupportedChain = "berachain";
    private address: Address;
    runtime: IAgentRuntime;
    private publicClient: PublicClient;
    private cache: Cache;
    private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor(runtime: IAgentRuntime) {
        const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
        if (!privateKey) throw new Error("EVM_PRIVATE_KEY not configured");

        this.runtime = runtime;

        const account = privateKeyToAccount(privateKey as `0x${string}`);
        this.address = account.address;

        const createClients = (chain: SupportedChain): ChainConfig => {
            const transport = http(getChainConfigs(runtime)[chain].rpcUrl);
            return {
                chain: getChainConfigs(runtime)[chain].chain,
                publicClient: createPublicClient<HttpTransport>({
                    chain: getChainConfigs(runtime)[chain].chain,
                    transport,
                }) as PublicClient<HttpTransport, Chain, Account | undefined>,
                walletClient: createWalletClient<HttpTransport>({
                    chain: getChainConfigs(runtime)[chain].chain,
                    transport,
                    account,
                }),
            };
        };

        this.chainConfigs = {
            berachain: createClients("berachain"),
        };
    }

    getAddress(): Address {
        return this.address;
    }

    async getWalletBalance(): Promise<string | null> {
        try {
            const client = this.getPublicClient(this.currentChain);
            const walletClient = this.getWalletClient();
            const balance = await client.getBalance({
                address: walletClient.account.address,
            });
            return formatUnits(balance, 18);
        } catch (error) {
            console.error("Error getting wallet balance:", error);
            return null;
        }
    }

    async connect(): Promise<`0x${string}`> {
        return this.runtime.getSetting("EVM_PRIVATE_KEY") as `0x${string}`;
    }

    async switchChain(
        runtime: IAgentRuntime,
        chain: SupportedChain
    ): Promise<void> {
        const walletClient = this.chainConfigs[this.currentChain].walletClient;
        if (!walletClient) throw new Error("Wallet not connected");

        try {
            await walletClient.switchChain({
                id: getChainConfigs(runtime)[chain].chainId,
            });
        } catch (error: any) {
            if (error.code === 4902) {
                console.log(
                    "[WalletProvider] Chain not added to wallet (error 4902) - attempting to add chain first"
                );
                await walletClient.addChain({
                    chain: {
                        ...getChainConfigs(runtime)[chain].chain,
                        rpcUrls: {
                            default: {
                                http: [getChainConfigs(runtime)[chain].rpcUrl],
                            },
                            public: {
                                http: [getChainConfigs(runtime)[chain].rpcUrl],
                            },
                        },
                    },
                });
                await walletClient.switchChain({
                    id: getChainConfigs(runtime)[chain].chainId,
                });
            } else {
                throw error;
            }
        }

        this.currentChain = chain;
    }

    getPublicClient(
        chain: SupportedChain
    ): PublicClient<HttpTransport, Chain, Account | undefined> {
        return this.chainConfigs[chain].publicClient;
    }

    getWalletClient(): WalletClient {
        const walletClient = this.chainConfigs[this.currentChain].walletClient;
        if (!walletClient) throw new Error("Wallet not connected");
        return walletClient;
    }

    getCurrentChain(): SupportedChain {
        return this.currentChain;
    }

    getChainConfig(chain: SupportedChain) {
        return getChainConfigs(this.runtime)[chain];
    }

    async fetchTokenList(): Promise<Token[]> {
        const cacheKey = "tokenList";
        const cached = await this.runtime.cacheManager?.get<Token[]>(cacheKey);
        if (cached) return cached;

        const OOGABOOGA_API_URL = this.runtime.getSetting("OOGABOOGA_API_URL");
        const OOGABOOGA_API_KEY = this.runtime.getSetting("OOGABOOGA_API_KEY");

        if (!OOGABOOGA_API_URL || !OOGABOOGA_API_KEY) {
            throw new Error("OogaBooga API configuration is missing");
        }

        const response = await fetch(`${OOGABOOGA_API_URL}/v1/tokens`, {
            headers: { Authorization: `Bearer ${OOGABOOGA_API_KEY}` },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch token list: ${response.statusText}`
            );
        }

        elizaLogger.log("Fetching token list from OogaBooga API");

        const tokens = await response.json();
        // const formattedTokens = tokens
        //     .filter((token: any) => token.address !== zeroAddress)
        //     .slice(0, 10)
        //     .map((token: any) => ({
        //         address: token.address as Address,
        //         symbol: token.symbol,
        //         name: token.name,
        //         decimals: token.decimals,
        //     }));

        const formattedTokens = tokens
            .filter((token: any) => token.address !== zeroAddress)
            .map((token: any) => ({
                address: token.address as Address,
                symbol: token.symbol,
                name: token.name,
                decimals: token.decimals,
            }));

        // console.log("Fetched token list:", formattedTokens);

        await this.runtime.cacheManager?.set(cacheKey, formattedTokens);
        return formattedTokens;
    }

    async multicallBalances(
        tokens: Token[],
        address?: Address
    ): Promise<TokenBalance[]> {
        const results = await Promise.all(
            tokens.map((token) =>
                this.getPublicClient(this.currentChain).readContract({
                    address: token.address,
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [address || this.address],
                })
            )
        );

        return tokens.map((token, i) => {
            const balance = results[i];
            return {
                address: token.address,
                symbol: token.symbol,
                balance: balance.toString(),
                formattedBalance: formatUnits(balance, token.decimals),
                decimals: token.decimals,
            };
        });
    }

    async getTopTokenBalances() {
        const tokens = await this.fetchTokenList();
        const balances = await this.multicallBalances(tokens);
        return balances;
    }

    async getRuggyPouch(): Promise<RuggyPouch> {
        const cacheKey = `ruggy-pouch-${this.address}`;
        // const cached =
        //     await this.runtime.cacheManager?.get<RuggyPouch>(cacheKey);

        // // Return cached data if it exists and is not expired
        // if (
        //     cached &&
        //     Date.now() - cached.lastUpdated < WalletProvider.CACHE_TTL
        // ) {
        //     return cached;
        // }

        const tokens = await this.fetchTokenList();
        const balances = await this.multicallBalances(tokens);
        const nativeBalance = await this.getWalletBalance();

        const pouch: RuggyPouch = {
            tokens: balances,
            bera: parseEther(nativeBalance).toString(),
            lastUpdated: Date.now(),
        };

        // Cache the results
        await this.runtime.cacheManager?.set(cacheKey, pouch);

        return pouch;
    }

    // Helper method to clear cache if needed
    async clearRuggyPouchCache(): Promise<void> {
        const cacheKey = `ruggy-pouch-${this.address}`;
        await this.runtime.cacheManager?.delete(cacheKey);
    }

    // Add price fetching method
    async fetchTokenPrices(): Promise<TokenPrice[]> {
        const cacheKey = "tokenPrices";
        const cached =
            await this.runtime.cacheManager?.get<TokenPrice[]>(cacheKey);
        if (cached) return cached;

        const OOGABOOGA_API_URL = this.runtime.getSetting("OOGABOOGA_API_URL");
        const OOGABOOGA_API_KEY = this.runtime.getSetting("OOGABOOGA_API_KEY");

        if (!OOGABOOGA_API_URL || !OOGABOOGA_API_KEY) {
            throw new Error("OogaBooga API configuration is missing");
        }

        const response = await fetch(
            `${OOGABOOGA_API_URL}/v1/prices?currency=USD`,
            {
                headers: { Authorization: `Bearer ${OOGABOOGA_API_KEY}` },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch prices: ${response.statusText}`);
        }

        elizaLogger.log("Fetching token prices from OogaBooga API");

        const data = (await response.json()) as TokenPrice[];
        await this.runtime.cacheManager?.set(cacheKey, data, {
            expires: 60 * 60 * 1000, // Cache for 1 hour
        }); // Cache for 1 minute
        return data;
    }

    // Update getRuggyPouchWithPrices method
    async getRuggyPouchWithPrices(): Promise<RuggyPouchWithPrices> {
        try {
            const pouch = await this.getRuggyPouch();
            const prices = await this.fetchTokenPrices();

            if (!prices || !Array.isArray(prices)) {
                elizaLogger.error(
                    "Failed to fetch prices or invalid price data"
                );
                // Return pouch without prices if price fetch fails
                return {
                    ...pouch,
                    tokens: pouch.tokens.map((token) => ({
                        ...token,
                        priceUSD: 0,
                        valueUSD: 0,
                    })),
                    totalValueUSD: 0,
                };
            }

            const tokensWithPrices = pouch.tokens.map((token) => {
                const price =
                    prices.find(
                        (p) =>
                            p?.address?.toLowerCase() ===
                            token.address.toLowerCase()
                    )?.price || 0;
                const valueUSD = Number(token.formattedBalance) * price;

                return {
                    ...token,
                    priceUSD: price,
                    valueUSD,
                };
            });

            // Calculate BERA value
            const beraPrice =
                prices.find(
                    (p) =>
                        p?.address?.toLowerCase() === zeroAddress.toLowerCase()
                )?.price || 0;
            const beraValueUSD =
                Number(formatUnits(BigInt(pouch.bera), 18)) * beraPrice;

            const totalValueUSD = tokensWithPrices.reduce(
                (sum, t) => sum + t.valueUSD,
                beraValueUSD
            );

            return {
                ...pouch,
                tokens: tokensWithPrices,
                totalValueUSD,
            };
        } catch (error) {
            elizaLogger.error("Error in getRuggyPouchWithPrices:", error);
            throw error;
        }
    }
}

export const berachainWalletProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        // Check if the user has an EVM wallet
        if (!runtime.getSetting("EVM_PRIVATE_KEY")) {
            return null;
        }

        try {
            const walletProvider = new WalletProvider(runtime);
            const pouch = await walletProvider.getRuggyPouch();
            const formattedBalances = pouch.tokens
                .map((token) => `${token.formattedBalance} ${token.symbol}`)
                .join(", ");
            // elizaLogger.log("Ruggy's pouch:", {
            //     tokens: pouch.tokens,
            //     bera: pouch.bera,
            // });

            const walletClient = walletProvider.getWalletClient();
            const address = walletClient?.account.address;
            return `Current balances: ${formattedBalances}\nWallet address: ${address}`;
        } catch (error) {
            console.error("Error in EVM wallet provider:", error);
            return null;
        }
    },
};
