import {
    settings,
    Character,
    Client,
    IAgentRuntime,
    elizaLogger,
} from "@ai16z/eliza";
import readline from "readline";

export function chat(character: Character) {
    const agentId = character.name ?? "Agent";
    rl.question("You: ", async (input) => {
        await handleUserInput(input, agentId);
        if (input.toLowerCase() !== "exit") {
            chat(character); // Loop back to ask another question
        }
    });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function handleUserInput(input: string, agentId: string) {
    if (input.toLowerCase() === "exit") {
        elizaLogger.warn("TerminalClientInterface stop");
        rl.close();
        return;
    }

    try {
        const serverPort = parseInt(settings.SERVER_PORT || "3000");

        const response = await fetch(
            `http://localhost:${serverPort}/${agentId}/message`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: input,
                    userId: "user",
                    userName: "User",
                }),
            }
        );

        const data = await response.json();
        data.forEach((message) => console.log(`${"Agent"}: ${message.text}`));
    } catch (error) {
        console.error("Error fetching response:", error);
    }
}

export const TerminalClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        elizaLogger.log("TerminalClientInterface start");
        elizaLogger.log("Chat started. Type 'exit' to quit.");
        chat(runtime.character)
        return true
    },
    stop: async (runtime: IAgentRuntime) => {
        elizaLogger.warn("TerminalClientInterface stop");
        rl.close();
        return;
    },
};

export default TerminalClientInterface;
