import {
    elizaLogger,
    IAgentRuntime,
    Memory,
    Provider,
    State,
} from "@ai16z/eliza";

interface OpenPanelProject {
    id: string;
    name: string;
    type: 'app' | 'website' | 'docs';
    clientId: string;
    clientSecret: string;
}

interface OpenPanelEvent {
    id: string;
    name: string;
    timestamp: string;
    projectId: string;
    data: Record<string, any>;
}

interface OpenPanelChartData {
    projectId: string;
    series: any[];
    metrics: Record<string, number>;
    previousPeriod?: any;
}

interface OpenPanelFunnelStep {
    event: {
        name: string;
        displayName: string;
    };
    count: number;
    percent: number;
    dropoffCount: number;
    dropoffPercent: number;
    previousCount: number;
}

interface ProjectFunnel {
    projectId: string;
    totalSessions: number;
    steps: OpenPanelFunnelStep[];
}

export interface OpenPanelCache {
    projects: OpenPanelProject[];
    events: Record<string, OpenPanelEvent[]>;
    charts: Record<string, OpenPanelChartData>;
    funnels: Record<string, ProjectFunnel>;
    lastUpdated: number;
    ttl: number;
}

export class OpenPanelProvider {
    private runtime: IAgentRuntime;
    private static CACHE_TTL = 300000; // 5 minutes in milliseconds
    private projects: OpenPanelProject[];

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.projects = this.loadProjectConfigs();
    }

    private loadProjectConfigs(): OpenPanelProject[] {
        const projectConfigs = process.env.OPENPANEL_PROJECTS;
        if (!projectConfigs) return [];

        try {
            return JSON.parse(projectConfigs);
        } catch (error) {
            elizaLogger.error("Error parsing OPENPANEL_PROJECTS config:", error);
            return [];
        }
    }

    private async fetchOpenPanelData() {
        try {
            const projectData: {
                events: Record<string, OpenPanelEvent[]>;
                charts: Record<string, OpenPanelChartData>;
                funnels: Record<string, ProjectFunnel>;
            } = {
                events: {},
                charts: {},
                funnels: {},
            };

            // Fetch data for each project
            for (const project of this.projects) {
                const headers = {
                    'openpanel-client-id': project.clientId,
                    'openpanel-client-secret': project.clientSecret,
                };

                // Fetch events
                const eventsResponse = await fetch(
                    `https://api.openpanel.dev/export/events?project_id=${project.id}&limit=50`,
                    { headers }
                );
                const events = await eventsResponse.json();
                projectData.events[project.id] = events.data.map(event => ({
                    ...event,
                    projectId: project.id
                }));

                // Fetch chart data
                const chartsResponse = await fetch(
                    `https://api.openpanel.dev/export/charts?projectId=${project.id}&interval=day&range=last_30_days`,
                    { headers }
                );
                const charts = await chartsResponse.json();
                projectData.charts[project.id] = {
                    ...charts,
                    projectId: project.id
                };

                // Fetch funnel data
                const funnelResponse = await fetch(
                    `https://api.openpanel.dev/export/funnel?projectId=${project.id}&events=[{"name":"page_view"},{"name":"sign_up"}]&range=last_30_days`,
                    { headers }
                );
                const funnel = await funnelResponse.json();
                projectData.funnels[project.id] = {
                    ...funnel,
                    projectId: project.id
                };
            }

            return {
                projects: this.projects,
                ...projectData
            };
        } catch (error) {
            elizaLogger.error("Error fetching OpenPanel data:", error);
            throw error;
        }
    }

    private async refreshCache(): Promise<OpenPanelCache> {
        elizaLogger.info("Refreshing OpenPanel cache");

        try {
            const data = await this.fetchOpenPanelData();

            const cachedData: OpenPanelCache = {
                ...data,
                lastUpdated: Date.now(),
                ttl: OpenPanelProvider.CACHE_TTL,
            };

            await this.runtime.cacheManager?.set(
                `${this.runtime.character.name}/openpanel-data`,
                cachedData
            );

            return cachedData;
        } catch (error) {
            elizaLogger.error("Error refreshing OpenPanel cache:", error);
            throw error;
        }
    }

    private isStale(data: OpenPanelCache): boolean {
        return Date.now() - data.lastUpdated > data.ttl;
    }

    async getData(): Promise<OpenPanelCache | null> {
        const cacheKey = `${this.runtime.character.name}/openpanel-data`;
        const cachedData = await this.runtime.cacheManager?.get<OpenPanelCache>(cacheKey);

        if (!cachedData || this.isStale(cachedData)) {
            try {
                return await this.refreshCache();
            } catch (error) {
                elizaLogger.error("Error refreshing OpenPanel cache:", error);
                return null;
            }
        }

        return cachedData;
    }

    async getProjectData(projectId: string): Promise<{
        events: OpenPanelEvent[];
        charts: OpenPanelChartData;
        funnel: ProjectFunnel;
    } | null> {
        const data = await this.getData();
        if (!data) return null;

        return {
            events: data.events[projectId] || [],
            charts: data.charts[projectId],
            funnel: data.funnels[projectId]
        };
    }
}

export const openPanelProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        const projectConfigs = process.env.OPENPANEL_PROJECTS;
        if (!projectConfigs) {
            elizaLogger.error("OpenPanel projects not configured");
            return null;
        }

        elizaLogger.info("OpenPanel provider triggered");

        try {
            const provider = new OpenPanelProvider(runtime);
            const data = await provider.getData();
            if (!data) return null;

            return JSON.stringify(data);
        } catch (error) {
            elizaLogger.error("Error in OpenPanel provider:", error);
            return null;
        }
    },
};