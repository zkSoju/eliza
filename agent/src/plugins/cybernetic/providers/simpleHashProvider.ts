import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza";

export interface TokenConfig {
    id: string;
    name: string;
    chain: string;
    contractAddress: string;
}

export interface TokenCollection {
    collection_id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    category: string;
    marketplace_pages: Array<{
        marketplace_id: string;
        marketplace_name: string;
        marketplace_collection_id: string;
        collection_url: string;
        verified: boolean | null;
    }>;
    floor_prices: Array<{
        marketplace_id: string;
        marketplace_name: string;
        value: number;
        payment_token: {
            payment_token_id: string;
            name: string;
            symbol: string;
            decimals: number;
        };
        value_usd_cents: number;
    }>;
    top_bids: Array<{
        marketplace_id: string;
        marketplace_name: string;
        value: number;
        payment_token: {
            payment_token_id: string;
            name: string;
            symbol: string;
            decimals: number;
        };
        value_usd_cents: number;
    }>;
    distinct_owner_count: number;
    distinct_nft_count: number;
    total_quantity: number;
    collection_royalties: Array<{
        source: string;
        total_creator_fee_basis_points: number;
        recipients: Array<{
            address: string;
            percentage: number;
            basis_points: number;
        }>;
    }>;
    token_config: TokenConfig;
    computed?: {
        floor_price_usd: number;
        volume_24h_usd: number;
        volume_7d_usd: number;
        volume_30d_usd: number;
        price_change_24h: number;
        price_change_7d: number;
    };
    activity?: CollectionActivity;
    historical_floors?: HistoricalFloorPrice[];
}

export interface CollectionActivity {
    collection_id: string;
    name: string;
    "1_day_volume": number;
    "1_day_volume_usd_cents": number;
    "1_day_prior_volume": number;
    "1_day_volume_change_percent": number;
    "1_day_transaction_count": number;
    "1_day_seller_count": number;
    "1_day_buyer_count": number;
    "7_day_volume": number;
    "7_day_volume_usd_cents": number;
    "7_day_volume_change_percent": number;
    "30_day_volume": number;
    "30_day_volume_usd_cents": number;
    "30_day_volume_change_percent": number;
}

export interface HistoricalFloorPrice {
    timestamp: string;
    floor_price_usd_cents: number;
    marketplace_id: string;
    marketplace_name: string;
}

export class SimpleHashProvider {
    private runtime: IAgentRuntime;
    private apiKey: string;
    private tokens: TokenConfig[];

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.apiKey = process.env.SIMPLEHASH_API_KEY || "";
        this.tokens = [
            {
                id: "honeycomb",
                name: "Honeycomb",
                chain: "ethereum",
                contractAddress: "0xcb0477d1af5b8b05795d89d59f4667b59eae9244",
            },
            {
                id: "honeyjar-gen1",
                name: "HoneyJar Gen 1",
                chain: "ethereum",
                contractAddress: "0xa20CF9B0874c3E46b344DEAEEa9c2e0C3E1db37d",
            },
            {
                id: "honeyjar-gen2",
                name: "HoneyJar Gen 2",
                chain: "arbitrum",
                contractAddress: "0x1b2751328F41D1A0b91f3710EDcd33E996591B72",
            },
            {
                id: "honeyjar-gen3",
                name: "HoneyJar Gen 3",
                chain: "zora",
                contractAddress: "0xe798c4d40bc050bc93c7f3b149a0dfe5cfc49fb0",
            },
            {
                id: "honeyjar-gen4",
                name: "HoneyJar Gen 4",
                chain: "optimism",
                contractAddress: "0xe1d16cc75c9f39a2e0f5131eb39d4b634b23f301",
            },
            {
                id: "honeyjar-gen5",
                name: "HoneyJar Gen 5",
                chain: "base",
                contractAddress: "0xbad7b49d985bbfd3a22706c447fb625a28f048b4",
            },
        ];
    }

    private getTokenIdentifier(token: TokenConfig): string {
        return `${token.chain}.${token.contractAddress}`;
    }

    async getCollectionActivity(collectionIds: string[]): Promise<Record<string, CollectionActivity> | null> {
        try {
            const url = new URL('https://api.simplehash.com/api/v0/nfts/collections_activity');
            url.searchParams.append('collection_ids', collectionIds.join(','));

            elizaLogger.info('Fetching collection activity:', collectionIds);

            const response = await fetch(url.toString(), {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                elizaLogger.error('Error fetching collection activity:', response.statusText);
                return null;
            }

            const data = await response.json();
            const activities: Record<string, CollectionActivity> = {};

            data.collections.forEach((activity: CollectionActivity) => {
                activities[activity.collection_id] = activity;
            });

            return activities;
        } catch (error) {
            elizaLogger.error('Error fetching collection activity:', error);
            return null;
        }
    }

    async getHistoricalFloorPrices(collectionId: string): Promise<HistoricalFloorPrice[] | null> {
        try {
            const url = `https://api.simplehash.com/api/v0/nfts/floor_prices_v2/collection/${collectionId}/daily`;

            elizaLogger.info('Fetching historical floor prices:', collectionId);

            const response = await fetch(url, {
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                elizaLogger.error('Error fetching historical floor prices:', response.statusText);
                return null;
            }

            const data = await response.json();
            return data.floor_prices;
        } catch (error) {
            elizaLogger.error('Error fetching historical floor prices:', error);
            return null;
        }
    }

    private formatCollectionData(collection: TokenCollection): TokenCollection {
        const floorPrice = collection.floor_prices?.[0];
        const activity = collection.activity;

        // Convert from wei/gwei to ETH if needed
        const formatPrice = (priceInCents: number): number => {
            const priceInUSD = priceInCents / 100;
            // Round to 2 decimal places for USD
            return Math.round(priceInUSD * 100) / 100;
        };

        return {
            ...collection,
            computed: {
                floor_price_usd: floorPrice ? formatPrice(floorPrice.value_usd_cents) : 0,
                volume_24h_usd: activity ? formatPrice(activity["1_day_volume_usd_cents"]) : 0,
                volume_7d_usd: activity ? formatPrice(activity["7_day_volume_usd_cents"]) : 0,
                volume_30d_usd: activity ? formatPrice(activity["30_day_volume_usd_cents"]) : 0,
                price_change_24h: activity ? Math.round(activity["1_day_volume_change_percent"] * 100) / 100 : 0,
                price_change_7d: activity ? Math.round(activity["7_day_volume_change_percent"] * 100) / 100 : 0,
            }
        };
    }

    async getMarketTrends(): Promise<Record<string, TokenCollection> | null> {
        try {
            const collections: Record<string, TokenCollection> = {};

            // Fetch collection data for each token
            await Promise.all(
                this.tokens.map(async (token) => {
                    const url = `https://api.simplehash.com/api/v0/nfts/collections/${token.chain}/${token.contractAddress}`;
                    const response = await fetch(url, {
                        headers: {
                            'X-API-KEY': this.apiKey,
                            'Accept': 'application/json',
                        }
                    });

                    if (!response.ok) return;

                    const data = await response.json();
                    if (data.collections?.[0]) {
                        collections[token.id] = {
                            ...data.collections[0],
                            token_config: token
                        };
                    }
                })
            );

            // Fetch activity data
            const collectionIds = Object.values(collections).map(c => c.collection_id);
            const activities = await this.getCollectionActivity(collectionIds);

            // Fetch historical data for each collection
            const historicalData: Record<string, HistoricalFloorPrice[]> = {};
            await Promise.all(
                Object.values(collections).map(async (collection) => {
                    const history = await this.getHistoricalFloorPrices(collection.collection_id);
                    if (history) {
                        historicalData[collection.collection_id] = history;
                    }
                })
            );

            // Enrich collections with activity and historical data
            Object.values(collections).forEach(collection => {
                collection.activity = activities?.[collection.collection_id];
                collection.historical_floors = historicalData[collection.collection_id];
                // Format and add computed properties
                collections[collection.token_config.id] = this.formatCollectionData(collection);
            });

            return collections;
        } catch (error) {
            elizaLogger.error('Error fetching market trends:', error);
            return null;
        }
    }

    // Method to add new tokens to track
    addToken(token: TokenConfig) {
        this.tokens.push(token);
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
            const collections = await provider.getMarketTrends();
            if (!collections) return null;

            return JSON.stringify({
                collections,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            elizaLogger.error("Error in SimpleHash provider:", error);
            return null;
        }
    },
};
