import {
    AgentRuntime,
    elizaLogger,
    IAgentRuntime,
    knowledge,
    Memory,
    Provider,
    State,
    stringToUuid,
} from "@ai16z/eliza";
import { createHash } from "crypto";
import fs from "fs/promises";
import { glob } from "glob";
import path from "path";

export interface CyberneticProviderConfig {
    contextPath: string; // Path to markdown files directory
}

export class CyberneticKnowledgeManager {
    private runtime: AgentRuntime;
    private config: CyberneticProviderConfig;

    constructor(runtime: AgentRuntime, config: CyberneticProviderConfig) {
        this.runtime = runtime;
        this.config = config;
        elizaLogger.log("CyberneticKnowledgeManager constructed");
    }

    async initialize(): Promise<void> {
        await this.loadMarkdownFiles();
    }

    private async loadMarkdownFiles() {
        const searchPath = path.join(this.config.contextPath, "**/*.md");

        try {
            const files = await glob(searchPath, { nodir: true });

            for (const file of files) {
                const relativePath = path.relative(
                    this.config.contextPath,
                    file
                );
                const content = await fs.readFile(file, "utf-8");
                const contentHash = createHash("sha256")
                    .update(content)
                    .digest("hex");

                const knowledgeId = stringToUuid(`cybernetic-${relativePath}`);

                const existingDocument =
                    await this.runtime.documentsManager.getMemoryById(
                        knowledgeId
                    );

                if (
                    existingDocument &&
                    existingDocument.content["hash"] === contentHash
                ) {
                    continue;
                }

                elizaLogger.log(
                    "Processing cybernetic knowledge: ",
                    relativePath
                );

                await knowledge.set(this.runtime, {
                    id: knowledgeId,
                    content: {
                        text: content,
                        hash: contentHash,
                        source: "cybernetic",
                        attachments: [],
                        metadata: {
                            path: relativePath,
                            type: "markdown",
                        },
                    },
                });
            }
        } catch (error) {
            elizaLogger.error("Error loading markdown files:", error);
            throw error;
        }
    }

    async getKnowledge(): Promise<any> {
        try {
            const memories = await this.runtime.documentsManager.getMemories({
                roomId: stringToUuid("cybernetic"),
            });
            return memories;
        } catch (error) {
            elizaLogger.error("Error getting cybernetic knowledge:", error);
            return null;
        }
    }
}

export const cyberneticProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        const manager = new CyberneticKnowledgeManager(
            runtime as AgentRuntime,
            {
                contextPath: "agent/src/context",
            }
        );

        await manager.initialize();
        const knowledge = await manager.getKnowledge();

        return;
    },
};

export default cyberneticProvider;
