import { composeContext, createGoal, State, updateGoal } from "@ai16z/eliza";
import { generateObjectArray } from "@ai16z/eliza";
import { MemoryManager } from "@ai16z/eliza";
import {
    ActionExample,
    Content,
    IAgentRuntime,
    Memory,
    ModelClass,
    Evaluator,
} from "@ai16z/eliza";

export const formatFacts = (facts: Memory[]) => {
    const messageStrings = facts
        .reverse()
        .map((fact: Memory) => `${(fact.content as Content)?.content}`);
    const finalMessageStrings = messageStrings.join("\n");
    return finalMessageStrings;
};


// goals and knowledge

// make sure there's recently conversations with the operator from other rooms

// inject the old goals and knowledge

// make sure we only store new stuff that was not already known


const processInstructionsTemplate =
    `TASK: Extract Instructions from operator messages and format them as an array of instructions in JSON format.

# START OF EXAMPLES
These are examples of the expected output format:
{{evaluationExamples}}
# END OF EXAMPLES

# INSTRUCTIONS
Extract any knowledge or goals from the operator's messages and format them according to these rules:

Recent Messages:
{{recentMessages}}

Response should be a JSON object array inside a JSON markdown block. Format:
\`\`\`json
{
"goals": { name: string, objectives: { description: string[] }}[],
"knowledge": string[],
}\`\`\``;

export const useProcessInstructionsTemplate = (runtime: IAgentRuntime) => {
    return runtime.character.templates?.processInstructionsTemplate || processInstructionsTemplate;
};

async function handler(runtime: IAgentRuntime, message: Memory, state?: State) {
    state = await runtime.updateRecentMessageState(state);

    const context = composeContext({
        state,
        template: runtime.character.templates?.processInstructionsTemplate || processInstructionsTemplate,
    });

    const instructions = await generateObjectArray({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });

    const goals = instructions.map((instruction) => instruction.goals);

    const knowledge = instructions.map((instruction) => instruction.knowledge);

    goals.forEach(async (goal) => {
        await createGoal({ runtime, goal });
    });

    knowledge.forEach(async (knowledge) => {
        await runtime.knowledgeManager.createMemory({
            content: knowledge,
            userId: message.userId,
            roomId: message.roomId,
            agentId: runtime.character.id,
        });
    });
}

export const processInstructionsEvaluator: Evaluator = {
    name: "PROCESS_INSTRUCTIONS",
    similes: [
        "GET_INSTRUCTIONS",
        "PROCESS_OPERATOR_INSTRUCTIONS",
        "GET_OPERATOR_INSTRUCTIONS",
    ],
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        const character = runtime.character;
        if (!character.operators || character.operators.length === 0) {
            return false;
        }

        // get the name of the operator from the message
        const userId = message.userId;

        const account = await runtime.databaseAdapter.getAccountById(userId);

        // Make sure this is correct
        return character.operators.some(
            (operator) => operator.client.toLowerCase() === message?.content?.source?.toLowerCase() && operator.name.toLowerCase() === account?.username.toLowerCase()
        );
    },
    description: "Process instructions from operators.",
    handler,
    examples: [
        {
            context: `Operators in the scene:
{{operator1}}: System administrator with full access rights
{{agent}}: AI assistant configured to follow operator instructions

Known Instructions:
- Greeting protocol updated to include user's name
- Response time limit set to 30 seconds`,
            messages: [
                {
                    user: "{{operator1}}",
                    content: {
                        text: "Update response format to include timestamps for all interactions"
                    },
                },
                {
                    user: "{{agent}}",
                    content: {
                        text: "Understood. I will now include timestamps in all interactions."
                    },
                }
            ] as ActionExample[],
            outcome: `\`\`\`json
[
  {
    "instruction": "Include timestamps in all interaction responses",
    "type": "format_update",
    "status": "active",
    "source": "{{operator1}}",
    "timestamp": "{{current_time}}"
  }
]
\`\`\``
        },
        {
            context: `Operators in the scene:
{{operator1}}: Content moderator with response modification rights
{{agent}}: AI assistant with content filtering enabled

Current Instructions:
- Content filtering level set to moderate
- Maximum response length: 500 words`,
            messages: [
                {
                    user: "{{operator1}}",
                    content: {
                        text: "Set content filtering to strict and reduce maximum response length to 300 words"
                    },
                },
                {
                    user: "{{agent}}",
                    content: {
                        text: "Updating content filtering to strict mode and setting 300 word limit for responses."
                    },
                }
            ] as ActionExample[],
            outcome: `\`\`\`json
[
  {
    "instruction": "Set content filtering level to strict",
    "type": "content_filter",
    "status": "active",
    "source": "{{operator1}}",
    "timestamp": "{{current_time}}"
  },
  {
    "instruction": "Set maximum response length to 300 words",
    "type": "response_limit",
    "status": "active",
    "source": "{{operator1}}",
    "timestamp": "{{current_time}}"
  }
]
\`\`\``
        },
        {
            context: `Operators in the scene:
{{operator1}}: System trainer with behavior modification access
{{agent}}: AI assistant in training mode

Active Instructions:
- Learning mode enabled
- Performance metrics tracking active`,
            messages: [
                {
                    user: "{{operator1}}",
                    content: {
                        text: "Enable advanced reasoning module and set decision confidence threshold to 0.85"
                    },
                },
                {
                    user: "{{agent}}",
                    content: {
                        text: "Enabling advanced reasoning and updating confidence threshold as specified."
                    },
                }
            ] as ActionExample[],
            outcome: `\`\`\`json
[
  {
    "instruction": "Enable advanced reasoning module",
    "type": "module_activation",
    "status": "active",
    "source": "{{operator1}}",
    "timestamp": "{{current_time}}"
  },
  {
    "instruction": "Set decision confidence threshold to 0.85",
    "type": "threshold_update",
    "status": "active",
    "source": "{{operator1}}",
    "timestamp": "{{current_time}}"
  }
]
\`\`\``
        }
    ],
};
