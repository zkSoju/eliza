import {
    Evaluator,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    generateObject,
} from "@ai16z/eliza";
import { z } from "zod";
import { OmniscientProvider } from "../providers/omniscientProvider";

const ProjectQuerySchema = z.object({
    projectName: z.string().min(1, "Project name is required"),
});

type ProjectQuery = z.infer<typeof ProjectQuerySchema>;

const projectExtractTemplate = `Given the following message and list of available projects, identify which project is being asked about:

Message: {{text}}

Available Projects:
{{availableProjects}}

Guidelines:
- Find the closest matching project name from the available projects
- Return the exact project name as listed above
- If no close match is found, return nothing
- Consider partial matches and common variations
- Ignore case when matching

Project name:`;

export const projectEvaluator: Evaluator = {
    name: "PROJECT_EVALUATOR",
    description: "Evaluates and validates project names from user messages",
    similes: ["CHECK_PROJECT", "FIND_PROJECT", "GET_PROJECT"],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State
    ): Promise<boolean> => {
        try {
            const provider = new OmniscientProvider(runtime);
            const data = await provider.getData();
            if (!data) return false;

            const context = composeContext({
                state: {
                    ...state,
                    text: message.content.text,
                    availableProjects: JSON.stringify(data.projects),
                },
                template: projectExtractTemplate,
            });

            const content = await generateObject({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
                schema: ProjectQuerySchema,
            });

            const parsedContent = content.object as ProjectQuery;

            // Find exact project by name
            const project = data.projects.find(
                (p) => p.name === parsedContent.projectName
            );

            if (!project) return false;

            // Store project info in cache for the action to use
            const cacheKey = `${runtime.character.name}/project-query/${message.userId}`;
            await runtime.cacheManager?.set(cacheKey, {
                projectName: project.name,
                projectId: project.id,
                timestamp: Date.now(),
            });

            return true;
        } catch (error) {
            return false;
        }
    },
    examples: [
        {
            context: `Actors in the scene:
{{user1}}: A user asking about a specific project's status.
{{user2}}: Sage, a mystical guide who provides project insights.

Project status request`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "What's the status of Set project?",
                    },
                },
            ],
            outcome: `[{
                "content": {
                    "projectName": "Set"
                }
            }]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A user inquiring about project progress.
{{user2}}: Sage, a mystical guide who shares project knowledge.

Project progress inquiry`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "How is Forgetti doing?",
                    },
                },
            ],
            outcome: `[{
                "content": {
                    "projectName": "Forgetti"
                }
            }]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A user checking project development status.
{{user2}}: Sage, a mystical guide tracking project progress.

Project development check`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Can you check on the progress of Set?",
                    },
                },
            ],
            outcome: `[{
                "content": {
                    "projectName": "Set"
                }
            }]`,
        },
        {
            context: `Actors in the scene:
{{user1}}: A user requesting project update.
{{user2}}: Sage, a mystical guide sharing project insights.

Project update request`,
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Give me an update on Forgetti development",
                    },
                },
            ],
            outcome: `[{
                "content": {
                    "projectName": "Forgetti"
                }
            }]`,
        },
    ],
    handler: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        return [];
    },
};
