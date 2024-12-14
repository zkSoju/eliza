import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza";

interface TokenPrice {
    fungible_id: string;
    price_usd: number;
    timestamp: string;
    volume_usd_24h: number;
    market_cap_usd: number;
}

interface MarketplaceStats {
    opensea?: {
        floor_price?: number;
        volume_24h?: number;
        sales_24h?: number;
    };
    blur?: {
        floor_price?: number;
        volume_24h?: number;
        sales_24h?: number;
    };
    looksrare?: {
        floor_price?: number;
        volume_24h?: number;
        sales_24h?: number;
    };
    magiceden?: {
        floor_price?: number;
        volume_24h?: number;
        sales_24h?: number;
    };
    tensor?: {
        floor_price?: number;
        volume_24h?: number;
        sales_24h?: number;
    };
    x2y2?: {
        floor_price?: number;
        volume_24h?: number;
        sales_24h?: number;
    };
}

interface CollectionActivity {
    collection_id: string;
    volume_usd: number;
    market_cap_usd: number;
    floor_price_usd: number;
    sales_count: number;
    holders_count: number;
    marketplace_stats?: MarketplaceStats;
}

interface CollectionStats {
    distinct_owner_count: number;
    distinct_nft_count: number;
    total_quantity: number;
    floor_prices: {
        marketplace_id: string;
        marketplace_name: string;
        value: number;
        payment_token: {
            payment_token_id: string;
            name: string;
            symbol: string;
            decimals: number;
        };
    }[];
}

interface TokenConfig {
    id: string;
    name: string;
    chain: string;
    generation?: number;
    contractAddress: string;
}

interface SimpleHashCache {
    prices: Record<string, TokenPrice[]>;
    collections: Record<string, CollectionActivity>;
    lastUpdated: number;
    ttl: number;
}

interface PaginatedResponse<T> {
    next_cursor?: string;
    previous?: string;
    data: T[];
}

export class SimpleHashProvider {
    private runtime: IAgentRuntime;
    private static CACHE_TTL = 300000; // 5 minutes
    private apiKey: string;
    private tokens: TokenConfig[];

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.apiKey = process.env.SIMPLEHASH_API_KEY || "";
        this.tokens = [
            {
                id: "0xcb0477d1af5b8b05795d89d59f4667b59eae9244",
                name: "Honeycomb",
                chain: "ethereum",
                contractAddress: "0xcb0477d1af5b8b05795d89d59f4667b59eae9244",
            },
            {
                id: "0xa20CF9B0874c3E46b344DEAEEa9c2e0C3E1db37d",
                name: "HoneyJar",
                chain: "ethereum",
                generation: 1,
                contractAddress: "0xa20CF9B0874c3E46b344DEAEEa9c2e0C3E1db37d",
            },
            {
                id: "0x1b2751328F41D1A0b91f3710EDcd33E996591B72",
                name: "HoneyJar",
                chain: "arbitrum",
                generation: 2,
                contractAddress: "0x1b2751328F41D1A0b91f3710EDcd33E996591B72",
            },
            {
                id: "0xe798c4d40bc050bc93c7f3b149a0dfe5cfc49fb0",
                name: "HoneyJar",
                chain: "zora",
                generation: 3,
                contractAddress: "0xe798c4d40bc050bc93c7f3b149a0dfe5cfc49fb0",
            },
            {
                id: "0xe1d16cc75c9f39a2e0f5131eb39d4b634b23f301",
                name: "HoneyJar",
                chain: "optimism",
                generation: 4,
                contractAddress: "0xe1d16cc75c9f39a2e0f5131eb39d4b634b23f301",
            },
            {
                id: "0xbad7b49d985bbfd3a22706c447fb625a28f048b4",
                name: "HoneyJar",
                chain: "base",
                generation: 5,
                contractAddress: "0xbad7b49d985bbfd3a22706c447fb625a28f048b4",
            },
        ];
    }

    private getTokenPath(token: TokenConfig): string {
        return `${token.chain}.${token.id}`;
    }

    private async fetchTokenPrices(tokens: TokenConfig[]) {
        try {
            const prices: Record<string, TokenPrice[]> = {};

            for (const token of tokens) {
                const tokenPath = this.getTokenPath(token);
                elizaLogger.info(
                    `Fetching price for ${token.name} (Gen ${token.generation || "-"}) on ${token.chain}`
                );

                const response = await fetch(
                    `https://api.simplehash.com/api/v0/fungibles/prices_v2/${tokenPath}?time_interval=1h&include_top_contract_details=true`,
                    {
                        headers: {
                            "X-API-KEY": this.apiKey,
                            Accept: "application/json",
                        },
                    }
                );

                if (!response.ok) {
                    elizaLogger.error(
                        `Error fetching price for ${token.name} on ${token.chain}: ${response.statusText}`
                    );
                    continue;
                }

                const data = await response.json();
                prices[tokenPath] = data.prices.map((price) => ({
                    ...price,
                    tokenName: token.name,
                    generation: token.generation,
                    chain: token.chain,
                }));
            }

            return prices;
        } catch (error) {
            elizaLogger.error("Error fetching SimpleHash data:", error);
            throw error;
        }
    }

    private async fetchCollectionActivity(tokens: TokenConfig[]) {
        try {
            const collections: Record<string, CollectionActivity> = {};

            // Fetch activity for each collection separately
            await Promise.all(
                tokens.map(async (token) => {
                    try {
                        // First try collection activity endpoint
                        const url = `https://api.simplehash.com/api/v0/nfts/collections/${token.chain}/${token.contractAddress}/activity`;
                        let response = await fetch(url, {
                            headers: {
                                "X-API-KEY": this.apiKey,
                                Accept: "application/json",
                            },
                        });

                        // If collection not found, try collections by contract endpoint
                        if (response.status === 404) {
                            elizaLogger.info(
                                `Collection not found for ${token.name}, trying collections by contract endpoint`
                            );

                            const contractUrl = `https://api.simplehash.com/api/v0/nfts/collections/${token.chain}/${token.contractAddress}`;
                            response = await fetch(contractUrl, {
                                headers: {
                                    "X-API-KEY": this.apiKey,
                                    Accept: "application/json",
                                },
                            });

                            if (!response.ok) {
                                elizaLogger.error(
                                    `Error fetching contract data for ${token.name}:`,
                                    {
                                        status: response.status,
                                        statusText: response.statusText,
                                        chain: token.chain,
                                        contract: token.contractAddress
                                    }
                                );
                                return;
                            }

                            const contractData = await response.json();

                            // Convert contract data to activity format
                            collections[token.contractAddress] = {
                                collection_id: token.contractAddress,
                                volume_usd: 0, // Default values since not available in contract endpoint
                                market_cap_usd: 0,
                                floor_price_usd: contractData.floor_prices?.[0]?.value || 0,
                                sales_count: 0,
                                holders_count: contractData.distinct_owner_count || 0,
                                marketplace_stats: {
                                    opensea: contractData.opensea_stats,
                                    blur: contractData.blur_stats,
                                    looksrare: contractData.looksrare_stats,
                                    magiceden: contractData.magiceden_stats,
                                    tensor: contractData.tensor_stats,
                                    x2y2: contractData.x2y2_stats
                                }
                            };
                            return;
                        }

                        if (!response.ok) {
                            elizaLogger.error(
                                `Error fetching activity for ${token.name}:`,
                                {
                                    status: response.status,
                                    statusText: response.statusText,
                                    chain: token.chain,
                                    contract: token.contractAddress
                                }
                            );
                            return;
                        }

                        const data = await response.json();
                        collections[token.contractAddress] = {
                            collection_id: token.contractAddress,
                            volume_usd: data.volume_usd || 0,
                            market_cap_usd: data.market_cap_usd || 0,
                            floor_price_usd: data.floor_price_usd || 0,
                            sales_count: data.sales_count || 0,
                            holders_count: data.holders_count || 0
                        };
                    } catch (error) {
                        elizaLogger.error(`Error processing ${token.name}:`, {
                            error: error instanceof Error ? error.message : String(error),
                            chain: token.chain,
                            contract: token.contractAddress
                        });
                    }
                })
            );

            return collections;
        } catch (error) {
            elizaLogger.error("Error in fetchCollectionActivity:", {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async refreshCache(
        tokens: TokenConfig[]
    ): Promise<SimpleHashCache> {
        elizaLogger.info("Refreshing SimpleHash cache");

        try {
            const [prices, collections] = await Promise.all([
                this.fetchTokenPrices(tokens),
                this.fetchCollectionActivity(tokens),
            ]);

            const cachedData: SimpleHashCache = {
                prices,
                collections,
                lastUpdated: Date.now(),
                ttl: SimpleHashProvider.CACHE_TTL,
            };

            await this.runtime.cacheManager?.set(
                `${this.runtime.character.name}/simplehash-data`,
                cachedData
            );

            return cachedData;
        } catch (error) {
            elizaLogger.error("Error refreshing SimpleHash cache:", error);
            throw error;
        }
    }

    private isStale(data: SimpleHashCache): boolean {
        return Date.now() - data.lastUpdated > data.ttl;
    }

    async getPrices(tokens: TokenConfig[]): Promise<SimpleHashCache | null> {
        const cacheKey = `${this.runtime.character.name}/simplehash-data`;
        const cachedData =
            await this.runtime.cacheManager?.get<SimpleHashCache>(cacheKey);

        if (!cachedData || this.isStale(cachedData)) {
            try {
                return await this.refreshCache(tokens);
            } catch (error) {
                elizaLogger.error("Error refreshing SimpleHash cache:", error);
                return null;
            }
        }

        return cachedData;
    }

    async getAllTokenPrices(): Promise<Record<string, TokenPrice[]> | null> {
        const data = await this.getPrices(this.tokens);
        if (!data) return null;
        return data.prices;
    }

    async getTokenPricesByChain(
        chain: string
    ): Promise<Record<string, TokenPrice[]> | null> {
        const data = await this.getAllTokenPrices();
        if (!data) return null;

        return Object.fromEntries(
            Object.entries(data).filter(([key]) => key.startsWith(chain))
        );
    }

    async getHoneyJarPrices(): Promise<Record<number, TokenPrice[]> | null> {
        const data = await this.getAllTokenPrices();
        if (!data) return null;

        const honeyJarPrices: Record<number, TokenPrice[]> = {};

        for (const token of this.tokens) {
            if (token.name === "HoneyJar" && token.generation) {
                const tokenPath = this.getTokenPath(token);
                honeyJarPrices[token.generation] = data[tokenPath];
            }
        }

        return honeyJarPrices;
    }

    async getCollectionActivity(
        collectionId: string,
        options: {
            from_timestamp?: string;
            to_timestamp?: string;
            marketplace_id?: string;
        } = {}
    ): Promise<CollectionActivity | null> {
        try {
            const queryParams = new URLSearchParams();
            if (options.from_timestamp) queryParams.append('from_timestamp', options.from_timestamp);
            if (options.to_timestamp) queryParams.append('to_timestamp', options.to_timestamp);
            if (options.marketplace_id) queryParams.append('marketplace_id', options.marketplace_id);

            const url = `https://api.simplehash.com/api/v0/nfts/collections_activity/${collectionId}?${queryParams}`;
            const data = await this.fetchPaginatedData<CollectionActivity>(url);
            return data[0] || null;
        } catch (error) {
            elizaLogger.error("Error fetching collection activity:", error);
            return null;
        }
    }

    async getAllCollectionActivity(): Promise<Record<
        string,
        CollectionActivity
    > | null> {
        const data = await this.getPrices(this.tokens);
        if (!data) return null;
        return data.collections;
    }

    private async fetchCollectionStats(token: TokenConfig) {
        try {
            elizaLogger.info(
                `Fetching collection stats for ${token.name} on ${token.chain}`
            );

            const response = await fetch(
                `https://api.simplehash.com/api/v0/nfts/collections/${token.chain}/${token.contractAddress}`,
                {
                    headers: {
                        "X-API-KEY": this.apiKey,
                        Accept: "application/json",
                    },
                }
            );

            if (!response.ok) {
                elizaLogger.error(
                    `Error fetching collection stats for ${token.name}: ${response.statusText}`
                );
                return null;
            }

            const data = await response.json();
            return {
                distinct_owner_count: data.distinct_owner_count,
                distinct_nft_count: data.distinct_nft_count,
                total_quantity: data.total_quantity,
                floor_prices: data.floor_prices,
                marketplace_stats: {
                    opensea: data.opensea_stats,
                    blur: data.blur_stats,
                    looksrare: data.looksrare_stats,
                    magiceden: data.magiceden_stats,
                    tensor: data.tensor_stats,
                    x2y2: data.x2y2_stats
                },
                spam_score: data.spam_score,
                top_bids: data.top_bids,
                collection_royalties: data.collection_royalties
            };
        } catch (error) {
            elizaLogger.error("Error fetching collection stats:", error);
            return null;
        }
    }

    private async fetchPaginatedData<T>(
        url: string,
        cursor?: string
    ): Promise<T[]> {
        const results: T[] = [];
        let nextCursor = cursor;

        do {
            const urlWithCursor = nextCursor
                ? `${url}&cursor=${nextCursor}`
                : url;

            const response = await fetch(urlWithCursor, {
                headers: {
                    "X-API-KEY": this.apiKey,
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }

            const data: PaginatedResponse<T> = await response.json();
            results.push(...data.data);
            nextCursor = data.next_cursor;
        } while (nextCursor);

        return results;
    }

    private async fetchAllCollectionStats() {
        const stats: Record<string, CollectionStats> = {};

        await Promise.all(
            this.tokens.map(async (token) => {
                const tokenStats = await this.fetchCollectionStats(token);
                if (tokenStats) {
                    stats[`${token.chain}.${token.contractAddress}`] =
                        tokenStats;
                }
            })
        );

        return stats;
    }

    async getCollectionStats(
        chain: string,
        contractAddress: string
    ): Promise<CollectionStats | null> {
        const token = this.tokens.find(
            (t) => t.chain === chain && t.contractAddress === contractAddress
        );
        if (!token) return null;

        return this.fetchCollectionStats(token);
    }

    async getAllCollectionStats(): Promise<Record<string, CollectionStats>> {
        return this.fetchAllCollectionStats();
    }
}

export const simpleHashProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        if (!process.env.SIMPLEHASH_API_KEY) {
            elizaLogger.error("SimpleHash API key not configured");
            return null;
        }

        try {
            const provider = new SimpleHashProvider(runtime);
            const [prices, stats] = await Promise.all([
                provider.getAllTokenPrices(),
                provider.getAllCollectionStats(),
            ]);

            if (!prices) return null;

            // Enhanced metrics with collection stats
            const metrics = {
                prices,
                collections: stats,
                summary: {
                    honeycomb: {
                        price: prices[
                            "ethereum.0xcb0477d1af5b8b05795d89d59f4667b59eae9244"
                        ]?.[0]?.price_usd,
                        volume_24h:
                            prices[
                                "ethereum.0xcb0477d1af5b8b05795d89d59f4667b59eae9244"
                            ]?.[0]?.volume_usd_24h,
                        stats: stats[
                            "ethereum.0xcb0477d1af5b8b05795d89d59f4667b59eae9244"
                        ],
                    },
                    honeyJars: Object.entries(prices)
                        .filter(([key]) => key.includes("HoneyJar"))
                        .map(([key, data]) => {
                            const [chain, address] = key.split(".");
                            return {
                                chain,
                                generation: this.tokens.find(
                                    (t) => t.contractAddress === address
                                )?.generation,
                                price: data[0]?.price_usd,
                                volume_24h: data[0]?.volume_usd_24h,
                                stats: stats[key],
                            };
                        }),
                },
                timestamp: new Date().toISOString(),
            };

            return JSON.stringify(metrics);
        } catch (error) {
            elizaLogger.error("Error in SimpleHash provider:", error);
            return null;
        }
    },
};
