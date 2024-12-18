import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../providers/omniscientProvider";

interface ProjectRequest {
    projectName: string;
    projectId: string;
    timestamp: number;
}

interface FormattedIssue {
    id: string;
    title: string;
    state: string;
    priority: number;
    assignees?: string[];
    team?: string;
    updatedAt: string;
}

interface FormattedProjectData {
    name: string;
    description: string | null;
    state: string;
    progress: number;
    issues: {
        critical: FormattedIssue[];
        inProgress: FormattedIssue[];
        backlog: FormattedIssue[];
        all: FormattedIssue[];
    };
    teams: {
        name: string;
        key: string;
        issueCount: number;
    }[];
    metrics: {
        totalIssues: number;
        criticalIssues: number;
        inProgressIssues: number;
        completedIssues: number;
    };
}

function formatProjectData(
    project: any,
    issues: any[],
    teams: any[]
): FormattedProjectData {
    const projectIssues = issues.filter((i) => i.project?.id === project.id);
    const criticalIssues = projectIssues.filter((i) => i.priority >= 2);
    const inProgressIssues = projectIssues.filter(
        (i) => i.state?.name === "In Progress"
    );
    const completedIssues = projectIssues.filter(
        (i) => i.state?.name === "Done"
    );

    // Group issues by team
    const teamIssues = new Map<string, number>();
    projectIssues.forEach((issue) => {
        if (issue.team) {
            const count = teamIssues.get(issue.team.id) || 0;
            teamIssues.set(issue.team.id, count + 1);
        }
    });

    // Format issues
    const formatIssue = (issue: any): FormattedIssue => ({
        id: issue.id,
        title: issue.title,
        state: issue.state?.name || "Unknown",
        priority: issue.priority,
        team: issue.team?.name,
        updatedAt: new Date(issue.updatedAt).toLocaleString(),
    });

    return {
        name: project.name,
        description: project.description,
        state: project.state,
        progress: project.progress,
        issues: {
            critical: criticalIssues.map(formatIssue),
            inProgress: inProgressIssues.map(formatIssue),
            backlog: projectIssues
                .filter((i) => !completedIssues.includes(i))
                .map(formatIssue),
            all: projectIssues.map(formatIssue),
        },
        teams: teams
            .filter((t) => teamIssues.has(t.id))
            .map((team) => ({
                name: team.name,
                key: team.key,
                issueCount: teamIssues.get(team.id) || 0,
            })),
        metrics: {
            totalIssues: projectIssues.length,
            criticalIssues: criticalIssues.length,
            inProgressIssues: inProgressIssues.length,
            completedIssues: completedIssues.length,
        },
    };
}

const projectSummaryTemplate = `Given the following project data, provide a focused summary for {{projectName}}:

Project Details:
{{projectDetails}}

Issues Overview:
- Total Issues: {{totalIssues}}
- Critical Issues: {{criticalIssues}}
- In Progress: {{inProgressIssues}}
- Completed: {{completedIssues}}
- Progress: {{progress}}%

Current Critical Issues:
{{criticalIssuesList}}

In Progress Issues:
{{inProgressIssuesList}}

Team Workload:
{{teamWorkload}}

Last Updated: {{lastUpdated}}

Guidelines:
- Focus on current project status and progress
- Highlight critical issues and blockers
- Note team assignments and workload
- Identify risks and dependencies
- Keep response concise and actionable
- Prioritize by impact and urgency`;

export const projectSummaryAction: Action = {
    name: "PROJECT_SUMMARY",
    description: "Provides detailed summary for a specific project",
    similes: ["PROJECT_STATUS", "CHECK_PROJECT", "PROJECT_DETAILS"],
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: unknown,
        callback: HandlerCallback
    ) => {
        const cacheKey = `${runtime.character.name}/project-query/${message.userId}`;
        const projectRequest =
            await runtime.cacheManager?.get<ProjectRequest>(cacheKey);

        if (!projectRequest) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "Please specify a valid project name to get details.",
                { error: "No project request found" }
            );
        }

        const provider = new OmniscientProvider(runtime);
        const data = await provider.getData();

        if (!data) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "No project data available",
                { error: "No project data available" }
            );
        }

        // Find project by ID (more reliable than name matching)
        const project = data.projects.find(
            (p) => p.id === projectRequest.projectId
        );

        if (!project) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                { searchedName: projectRequest.projectName },
                "Could not find the project anymore. It might have been deleted or moved.",
                { error: "Project not found" }
            );
        }

        const formattedData = formatProjectData(
            project,
            data.issues,
            data.teams
        );

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                projectName: formattedData.name,
                projectDetails: JSON.stringify(
                    {
                        name: formattedData.name,
                        description: formattedData.description,
                        state: formattedData.state,
                        progress: formattedData.progress,
                    },
                    null,
                    2
                ),
                totalIssues: formattedData.metrics.totalIssues,
                criticalIssues: formattedData.metrics.criticalIssues,
                inProgressIssues: formattedData.metrics.inProgressIssues,
                completedIssues: formattedData.metrics.completedIssues,
                progress: Math.round(formattedData.progress * 100),
                criticalIssuesList: JSON.stringify(
                    formattedData.issues.critical,
                    null,
                    2
                ),
                inProgressIssuesList: JSON.stringify(
                    formattedData.issues.inProgress,
                    null,
                    2
                ),
                teamWorkload: JSON.stringify(
                    formattedData.teams.map(
                        (t) => `${t.name} (${t.key}): ${t.issueCount} issues`
                    ),
                    null,
                    2
                ),
                lastUpdated: new Date(data.lastUpdated).toLocaleString(),
            },
            projectSummaryTemplate,
            {
                success: true,
                data: {
                    formattedData,
                },
            }
        );
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the status of Set project?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Let me check the details for the Set project...",
                    action: "PROJECT_SUMMARY",
                },
            },
        ],
    ],
};
