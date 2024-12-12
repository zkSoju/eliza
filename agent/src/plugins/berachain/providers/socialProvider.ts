import type { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";
import { elizaLogger } from "@ai16z/eliza";
import { v4 as uuidv4 } from "uuid";
import { CommunityContext, CommunityRole } from "../../../types";

export class BerachainSocialProvider {
    private context: CommunityContext | null = null;
    private trades: any[] = [];
    private milestones: any[] = [];
    private runtime: IAgentRuntime;

    name = "berachain-social";
    description = "Berachain social and community features provider";

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        elizaLogger.log("BerachainSocialProvider constructed");
        this.initializeSync();
    }

    private initializeSync() {
        // Initialize with default context
        this.context = {
            name: "Berachain Community",
            description: "A community of Berachain traders and enthusiasts",
            customTerminology: {
                HONEY: "🍯 Honey Token",
                BERA: "🐻 BERA",
                WBERA: "🐻 Wrapped BERA",
                BGT: "💰 Berachain Governance Token",
            },
            roles: [
                {
                    name: "trader",
                    description: "Regular community trader",
                    permissions: ["trade", "comment", "like"],
                },
                {
                    name: "moderator",
                    description: "Community moderator",
                    permissions: [
                        "trade",
                        "comment",
                        "like",
                        "delete_comments",
                        "pin_trades",
                    ],
                },
            ],
            guidelines: [
                "Be respectful to other traders",
                "Share your trading insights and strategies",
                "Help newcomers understand the Berachain ecosystem",
                "Don't spam or promote unauthorized tokens",
            ],
        };
    }

    // Required Provider interface method
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<any> {
        try {
            // Load cached data if available
            const cachedContext =
                await runtime.cacheManager?.get<CommunityContext>(
                    "community-context"
                );
            const cachedTrades =
                await runtime.cacheManager?.get<any[]>("community-trades");
            const cachedMilestones = await runtime.cacheManager?.get<any[]>(
                "community-milestones"
            );

            if (cachedContext) this.context = cachedContext;
            if (cachedTrades) this.trades = cachedTrades;
            if (cachedMilestones) this.milestones = cachedMilestones;

            // Return current social state
            return {
                context: this.context,
                trades: this.trades.slice(-10), // Last 10 trades
                milestones: this.milestones.slice(-5), // Last 5 milestones
                topTraders: this.getTopTraders(),
            };
        } catch (error) {
            elizaLogger.error("Error getting social data:", error);
            return null;
        }
    }

    // Social context methods
    async updateTerminology(newTerms: Record<string, string>): Promise<void> {
        if (!this.context) throw new Error("Context not initialized");

        this.context.customTerminology = {
            ...this.context.customTerminology,
            ...newTerms,
        };
        await this.runtime.cacheManager?.set("community-context", this.context);
        elizaLogger.log("Terminology updated:", newTerms);
    }

    async addRole(role: CommunityRole): Promise<void> {
        if (!this.context) throw new Error("Context not initialized");

        if (this.context.roles.some((r) => r.name === role.name)) {
            throw new Error(`Role ${role.name} already exists`);
        }

        this.context.roles.push(role);
        await this.runtime.cacheManager?.set("community-context", this.context);
        elizaLogger.log("New role added:", role);
    }

    async updateGuidelines(guidelines: string[]): Promise<void> {
        if (!this.context) throw new Error("Context not initialized");

        this.context.guidelines = guidelines;
        await this.runtime.cacheManager?.set("community-context", this.context);
        elizaLogger.log("Guidelines updated");
    }

    async addGuideline(guideline: string): Promise<void> {
        if (!this.context) throw new Error("Context not initialized");

        this.context.guidelines.push(guideline);
        await this.runtime.cacheManager?.set("community-context", this.context);
        elizaLogger.log("New guideline added:", guideline);
    }

    // Helper methods
    translateTerm(term: string): string {
        if (!this.context?.customTerminology) return term;
        return this.context.customTerminology[term] || term;
    }

    hasPermission(userRole: string, permission: string): boolean {
        if (!this.context?.roles) return false;
        const role = this.context.roles.find((r) => r.name === userRole);
        return role?.permissions.includes(permission) || false;
    }

    // Social features
    async shareSwap(params: {
        userId: string;
        fromToken: string;
        toToken: string;
        fromAmount: string;
        toAmount: string;
        comment?: string;
    }): Promise<void> {
        const trade = {
            id: uuidv4(),
            userId: params.userId,
            timestamp: Date.now(),
            tradeType: "swap",
            fromToken: this.translateTerm(params.fromToken),
            toToken: this.translateTerm(params.toToken),
            fromAmount: params.fromAmount,
            toAmount: params.toAmount,
            comment: params.comment,
            likes: 0,
            replies: [],
        };

        this.trades.push(trade);
        await this.runtime.cacheManager?.set("community-trades", this.trades);

        elizaLogger.log("New trade shared:", trade);
        await this.checkAndCreateMilestones(params.userId);
    }

    private async checkAndCreateMilestones(userId: string): Promise<void> {
        const userTrades = this.trades.filter((t) => t.userId === userId);

        if (userTrades.length === 1) {
            await this.createMilestone({
                type: "user_achievement",
                description: `${userId} made their first trade!`,
            });
        }

        if (userTrades.length === 10) {
            await this.createMilestone({
                type: "user_achievement",
                description: `${userId} completed 10 trades!`,
            });
        }

        if (this.trades.length === 100) {
            await this.createMilestone({
                type: "community_achievement",
                description: "Community reached 100 trades!",
            });
        }
    }

    private getTopTraders(): string[] {
        const traderStats = this.trades.reduce(
            (acc, trade) => {
                acc[trade.userId] = (acc[trade.userId] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>
        );

        return Object.entries(traderStats)
            .sort((a, b) => traderStats[b[0]] - traderStats[a[0]])
            .slice(0, 5)
            .map(([userId]) => userId);
    }

    private async createMilestone(params: {
        type: "trading_volume" | "community_achievement" | "user_achievement";
        description: string;
    }): Promise<void> {
        const milestone = {
            id: uuidv4(),
            type: params.type,
            description: params.description,
            timestamp: Date.now(),
            achieved: true,
        };

        this.milestones.push(milestone);
        await this.runtime.cacheManager?.set(
            "community-milestones",
            this.milestones
        );

        elizaLogger.log("New milestone created:", milestone);
    }
}

export const berachainSocialProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        const provider = new BerachainSocialProvider(runtime);

        return `here is the current social data: ${provider.get(
            runtime,
            message,
            state
        )}`;
    },
};
