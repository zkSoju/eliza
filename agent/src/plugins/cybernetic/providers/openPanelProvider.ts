import { elizaLogger, IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";

interface OpenPanelConfig {
    id: string;
    name: string;
    type: string;
    clientId: string;
    clientSecret: string;
}

interface OpenPanelEvent {
    id: string;
    event: string;
    timestamp: string;
    properties: Record<string, any>;
    profile?: Record<string, any>;
    meta?: Record<string, any>;
}

interface OpenPanelResponse {
    meta: {
        count: number;
        totalCount: number;
        pages: number;
        current: number;
    };
    data: OpenPanelEvent[];
}

export class OpenPanelProvider {
    private runtime: IAgentRuntime;
    private projects: OpenPanelConfig[];
    private baseUrl = 'https://api.openpanel.dev';

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        try {
            // Parse projects from env
            const projectsStr = process.env.OPENPANEL_PROJECTS;
            if (!projectsStr) {
                elizaLogger.error("OPENPANEL_PROJECTS environment variable is not set");
                this.projects = [];
                return;
            }

            this.projects = JSON.parse(projectsStr);
            elizaLogger.info("Loaded OpenPanel projects:",
                this.projects.map(p => ({
                    id: p.id,
                    name: p.name,
                    hasClientId: !!p.clientId,
                    hasClientSecret: !!p.clientSecret
                }))
            );
        } catch (error) {
            elizaLogger.error("Error parsing OPENPANEL_PROJECTS:", error);
            this.projects = [];
        }
    }

    private async fetchEvents(projectId: string, options: {
        event?: string | string[];
        start?: string;
        end?: string;
        page?: number;
        limit?: number;
        includes?: string[];
    }): Promise<OpenPanelResponse | null> {
        try {
            const project = this.projects.find(p => p.id === projectId);
            if (!project) {
                elizaLogger.error(`Project ${projectId} not found`);
                return null;
            }

            if (!project.clientId || !project.clientSecret) {
                elizaLogger.error(`Missing credentials for project ${project.name}`);
                return null;
            }

            const url = new URL(`${this.baseUrl}/export/events`);

            // Add query parameters
            url.searchParams.append('project_id', projectId);
            if (options.event) {
                const events = Array.isArray(options.event) ? options.event : [options.event];
                events.forEach(e => url.searchParams.append('event', e));
            }
            if (options.start) url.searchParams.append('start', options.start);
            if (options.end) url.searchParams.append('end', options.end);
            if (options.page) url.searchParams.append('page', options.page.toString());
            if (options.limit) url.searchParams.append('limit', options.limit.toString());
            if (options.includes) {
                options.includes.forEach(i => url.searchParams.append('includes', i));
            }

            elizaLogger.info('Fetching OpenPanel events:', {
                url: url.toString(),
                project: project.name,
                clientIdLength: project.clientId.length,
                clientSecretLength: project.clientSecret.length
            });

            const response = await fetch(url.toString(), {
                headers: {
                    'openpanel-client-id': project.clientId,
                    'openpanel-client-secret': project.clientSecret,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const responseText = await response.text();
                elizaLogger.error('OpenPanel API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    response: responseText,
                    headers: Object.fromEntries(response.headers.entries())
                });
                return null;
            }

            const data = await response.json();
            return data as OpenPanelResponse;
        } catch (error) {
            elizaLogger.error('Error fetching OpenPanel events:', error);
            return null;
        }
    }

    async getProjectEvents(projectId: string): Promise<OpenPanelEvent[] | null> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7); // Last 7 days

        const response = await this.fetchEvents(projectId, {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
            includes: ['profile', 'meta'],
            limit: 50
        });

        return response?.data || null;
    }
}

export const openPanelProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        if (!process.env.OPENPANEL_PROJECTS) {
            elizaLogger.error("OpenPanel projects not configured");
            return null;
        }

        try {
            const provider = new OpenPanelProvider(runtime);
            const allEvents: Record<string, OpenPanelEvent[]> = {};

            // Fetch events for all projects
            const projects = JSON.parse(process.env.OPENPANEL_PROJECTS);
            await Promise.all(
                projects.map(async (project: OpenPanelConfig) => {
                    const events = await provider.getProjectEvents(project.id);
                    if (events) {
                        allEvents[project.id] = events;
                    }
                })
            );

            return JSON.stringify({
                events: allEvents,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            elizaLogger.error("Error in OpenPanel provider:", error);
            return null;
        }
    },
};
