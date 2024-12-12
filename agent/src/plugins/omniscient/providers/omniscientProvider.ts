import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza";
import * as cron from "node-cron";
interface Project {
    id: string;
    name: string;
    description: string | null;
    state: string;
    progress: number;
    updatedAt: string;
}

interface Team {
    id: string;
    name: string;
    description: string | null;
    key: string;
}

interface Issue {
    id: string;
    title: string;
    description: string | null;
    state: string;
    priority: number;
    project: Project | null;
    team: Team | null;
    updatedAt: string;
}

export interface OmniscientCache {
    projects: Project[];
    issues: Issue[];
    teams: Team[];
    lastUpdated: number;
    ttl: number;
}

const QUERY = `
query GetProjectData($initiativeId: ID!) {
    projects(
        first: 50,
        filter: {
            state: { in: ["started"] }
            initiatives: { id: { eq: $initiativeId } }
        }
    ) {
        nodes {
            id
            name
            description
            status {
                name
            }
            progress
            updatedAt
        }
    }
    teams(first: 50) {
        nodes {
            id
            name
            description
            key
        }
    }
    issues(
        first: 50,
        filter: {
            state: { type: { in: ["started", "inProgress"] } }
            project: { initiatives: { id: { eq: $initiativeId } } }
        }
    ) {
        nodes {
            id
            title
            description
            state {
                name
            }
            priority
            updatedAt
            project {
                id
                name
            }
            team {
                id
                name
                key
            }
        }
    }
}`;

export class OmniscientProvider {
    private runtime: IAgentRuntime;
    private static CACHE_TTL = 3600000; // 1 hour in milliseconds

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
    }

    private async fetchLinearData() {
        const apiKey =
            process.env[
                `${this.runtime.character.name.toUpperCase()}_LINEAR_API_KEY`
            ];
        if (!apiKey) {
            elizaLogger.error("LINEAR_API_KEY not configured");
            throw new Error("LINEAR_API_KEY not configured");
        }

        try {
            const response = await fetch("https://api.linear.app/graphql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: apiKey,
                },
                body: JSON.stringify({
                    query: QUERY,
                    variables: {
                        initiativeId: "fbb090ad-5415-4464-b804-4f07dde16cc5",
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                elizaLogger.error(
                    `Linear API error: ${response.status} ${response.statusText} - ${errorText}`
                );
                throw new Error(
                    `Linear API error: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();

            // elizaLogger.info("Linear API response:", JSON.stringify(data));

            if (data.errors) {
                elizaLogger.error(
                    "GraphQL Errors:",
                    JSON.stringify(data.errors)
                );
                throw new Error(`GraphQL errors: ${data.errors[0].message}`);
            }

            return data.data;
        } catch (error) {
            elizaLogger.error("Error in fetchLinearData:", error);
            if (error instanceof Error) {
                elizaLogger.error("Error stack:", error.stack);
            }
            throw error;
        }
    }

    private async refreshCache(): Promise<OmniscientCache> {
        elizaLogger.info("Refreshing Omniscient cache");

        try {
            const data = await this.fetchLinearData();

            if (!data || !data.projects || !data.issues || !data.teams) {
                elizaLogger.error("Invalid data structure received:", data);
                throw new Error(
                    "Invalid data structure received from Linear API"
                );
            }

            const cachedData: OmniscientCache = {
                projects: data.projects.nodes,
                issues: data.issues.nodes,
                teams: data.teams.nodes,
                lastUpdated: Date.now(),
                ttl: OmniscientProvider.CACHE_TTL,
            };

            this.runtime.cacheManager?.set(
                `${this.runtime.character.name}/omniscient-data`,
                cachedData
            );

            return cachedData;
        } catch (error) {
            elizaLogger.error("Error refreshing Omniscient cache:", error);
            throw error;
        }
    }

    private isStale(data: OmniscientCache): boolean {
        return Date.now() - data.lastUpdated > data.ttl;
    }

    async getData(): Promise<OmniscientCache | null> {
        const cacheKey = `${this.runtime.character.name}/omniscient-data`;
        const cachedData =
            await this.runtime.cacheManager?.get<OmniscientCache>(cacheKey);

        if (!cachedData || this.isStale(cachedData)) {
            try {
                return await this.refreshCache();
            } catch (error) {
                elizaLogger.error("Error refreshing Omniscient cache:", error);
                return null;
            }
        }

        return cachedData;
    }

    async getProjectContext(projectId: string): Promise<string> {
        const data = await this.getData();
        if (!data) return "No project data available";

        const project = data.projects.find((p) => p.id === projectId);
        if (!project) return "Project not found";

        const projectIssues = data.issues.filter(
            (i) => i.project?.id === projectId
        );
        const criticalIssues = projectIssues.filter((i) => i.priority >= 2);

        return `Project: ${project.name}
Progress: ${project.progress}%
State: ${project.state}
Critical Issues: ${criticalIssues.length}
Total Issues: ${projectIssues.length}`;
    }

    async getTeamContext(teamId: string): Promise<string> {
        const data = await this.getData();
        if (!data) return "No team data available";

        const team = data.teams.find((t) => t.id === teamId);
        if (!team) return "Team not found";

        const teamIssues = data.issues.filter((i) => i.team?.id === teamId);
        const activeProjects = new Set(
            teamIssues.map((i) => i.project?.id).filter(Boolean)
        ).size;

        return `Team: ${team.name}
Key: ${team.key}
Active Projects: ${activeProjects}
Open Issues: ${teamIssues.length}`;
    }

    async clearCache(): Promise<void> {
        const cacheKey = `${this.runtime.character.name}/omniscient-data`;
        await this.runtime.cacheManager?.delete(cacheKey);
    }
}

export const omniscientProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        if (!runtime.getSetting("LINEAR_API_KEY")) {
            return null;
        }

        cron.schedule("0 9 * * *", async () => {
            elizaLogger.info("Running daily summary");

            try {
                await runtime.processActions(
                    {
                        ...message,
                        content: {
                            action: "DAILY_SUMMARY",
                            text: "What is the daily summary?",
                        },
                    }, // no trigger message needed
                    [], // no response messages
                    state // empty state
                );
            } catch (error) {
                console.error("Failed to generate daily summary:", error);
            }
        });

        try {
            const provider = new OmniscientProvider(runtime);
            const data = await provider.getData();
            if (!data) return null;

            const activeProjects = data.projects.filter(
                (p) => p.state === "active"
            );
            const criticalIssues = data.issues.filter((i) => i.priority >= 2);
            return `Overview:

Active Projects: ${activeProjects.length}
Critical Issues: ${criticalIssues.length}
Teams: ${data.teams.length}
Total Issues: ${data.issues.length}

Last Updated: ${new Date(data.lastUpdated).toLocaleString()}`;
        } catch (error) {
            elizaLogger.error("Error in Omniscient provider:", error);
            return null;
        }
    },
};
