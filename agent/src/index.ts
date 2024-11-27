import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { AutoClientInterface } from "@ai16z/client-auto";
import { DirectClientInterface } from "@ai16z/client-direct";
import { DiscordClientInterface } from "@ai16z/client-discord";
import { TelegramClientInterface } from "@ai16z/client-telegram";
import { TerminalClientInterface } from "@ai16z/client-terminal";
import { TwitterClientInterface } from "@ai16z/client-twitter";
import {
    AgentRuntime,
    CacheManager,
    Character,
    DbCacheAdapter,
    FsCacheAdapter,
    ICacheManager,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
    ModelProviderName,
    defaultCharacter,
    elizaLogger,
    settings,
    stringToUuid,
    validateCharacterConfig
} from "@ai16z/eliza";
import { zgPlugin } from "@ai16z/plugin-0g";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
import { buttplugPlugin } from "@ai16z/plugin-buttplug";
import {
    coinbaseCommercePlugin,
    coinbaseMassPaymentsPlugin,
} from "@ai16z/plugin-coinbase";
import { confluxPlugin } from "@ai16z/plugin-conflux";
import {
    createNodePlugin,
} from "@ai16z/plugin-node";
import { solanaPlugin } from "@ai16z/plugin-solana";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yargs from "yargs";

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

import { getTokenForProvider } from "./libs/utils.ts";

export function parseArguments(): {
    character?: string;
    characters?: string;
} {
    try {
        return yargs(process.argv.slice(2))
            .option("character", {
                type: "string",
                description: "Path to the character JSON file",
            })
            .option("characters", {
                type: "string",
                description:
                    "Comma separated list of paths to character JSON files",
            })
            .parseSync();
    } catch (error) {
        console.error("Error parsing arguments:", error);
        return {};
    }
}

export async function loadCharacters(
    charactersArg: string
): Promise<Character[]> {
    let characterPaths = charactersArg?.split(",").map((filePath) => {
        if (path.basename(filePath) === filePath) {
            filePath = "../characters/" + filePath;
        }
        return path.resolve(process.cwd(), filePath.trim());
    });

    const loadedCharacters = [];

    if (characterPaths?.length > 0) {
        for (const path of characterPaths) {
            try {
                const character = JSON.parse(fs.readFileSync(path, "utf8"));

                validateCharacterConfig(character);

                // is there a "plugins" field?
                if (character.plugins) {
                    console.log("Plugins are: ", character.plugins);

                    const importedPlugins = await Promise.all(
                        character.plugins.map(async (plugin) => {
                            // if the plugin name doesnt start with @eliza,

                            const importedPlugin = await import(plugin);
                            return importedPlugin;
                        })
                    );

                    character.plugins = importedPlugins;
                }

                loadedCharacters.push(character);
            } catch (e) {
                console.error(`Error loading character from ${path}: ${e}`);
                // don't continue to load if a specified file is not found
                process.exit(1);
            }
        }
    }

    if (loadedCharacters.length === 0) {
        console.log("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

function initializeDatabase(dataDir) {
    if (process.env.POSTGRES_URL) {
        const db = new PostgresDatabaseAdapter({
            connectionString: process.env.POSTGRES_URL,
            parseInputs: true,
        });
        return db;
    } else {
        const filePath =
            process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
        // ":memory:";
        const db = new SqliteDatabaseAdapter(new Database(filePath));
        return db;
    }
}

export async function initializeClients(
    character: Character,
    runtime: AgentRuntime,
    dc: any
) {
    const clients = [];
    const clientTypes =
        character.clients?.map((str) => str.toLowerCase()) || [];

    if (clientTypes.includes("direct")) {
        dc.registerAgent(runtime);
    }

    if (clientTypes.includes("terminal")) {
        // MARK: Launches multiple terminal clients when in multi-agent mode, confusing perhaps but not broken.
        const terminalClient = await TerminalClientInterface.start(runtime);
        if (terminalClient) clients.push(terminalClient);
    }

    if (clientTypes.includes("auto")) {
        const autoClient = await AutoClientInterface.start(runtime);
        if (autoClient) clients.push(autoClient);
    }

    if (clientTypes.includes("discord")) {
        clients.push(await DiscordClientInterface.start(runtime));
    }

    if (clientTypes.includes("telegram")) {
        const telegramClient = await TelegramClientInterface.start(runtime);
        if (telegramClient) clients.push(telegramClient);
    }

    if (clientTypes.includes("twitter")) {
        const twitterClients = await TwitterClientInterface.start(runtime);
        clients.push(twitterClients);
    }

    if (character.plugins?.length > 0) {
        for (const plugin of character.plugins) {
            if (plugin.clients) {
                for (const client of plugin.clients) {
                    clients.push(await client.start(runtime));
                }
            }
        }
    }

    return clients;
}

function getSecret(character: Character, secret: string) {
    return character.settings.secrets?.[secret] || process.env[secret];
}

let nodePlugin: any | undefined;

export function createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string
) {
    elizaLogger.success(
        elizaLogger.successesTitle,
        "Creating runtime for character",
        character.name
    );

    nodePlugin ??= createNodePlugin();

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [
            bootstrapPlugin,
            getSecret(character, "CONFLUX_CORE_PRIVATE_KEY")
                ? confluxPlugin
                : null,
            nodePlugin,
            getSecret(character, "WALLET_PUBLIC_KEY") ? solanaPlugin : null,
            getSecret(character, "ZEROG_PRIVATE_KEY") ? zgPlugin : null,
            getSecret(character, "COINBASE_COMMERCE_KEY")
                ? coinbaseCommercePlugin
                : null,
            getSecret(character, "COINBASE_API_KEY") &&
                getSecret(character, "COINBASE_PRIVATE_KEY")
                ? coinbaseMassPaymentsPlugin
                : null,
            getSecret(character, "BUTTPLUG_API_KEY") ? buttplugPlugin : null,
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
    });
}

function intializeFsCache(baseDir: string, character: Character) {
    const cacheDir = path.resolve(baseDir, character.id, "cache");

    const cache = new CacheManager(new FsCacheAdapter(cacheDir));
    return cache;
}

function intializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    const cache = new CacheManager(new DbCacheAdapter(db, character.id));
    return cache;
}

async function startAgent(character: Character, db: any, dc: any) {
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);

        const cache = intializeDbCache(character, db);
        const runtime = createAgent(character, db, cache, token);

        await runtime.initialize();

        const clients = await initializeClients(character, runtime, dc);

        return clients;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        console.error(error);
        throw error;
    }
}

const startAgents = async () => {
    const args = parseArguments();
    let charactersArg = args.characters || args.character;

    let characters = [defaultCharacter];

    if (charactersArg) {
        characters = await loadCharacters(charactersArg);
    }

    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);
    await db.init();

    const dc = await DirectClientInterface.start();

    try {
        for (const character of characters) {
            await startAgent(character, db, dc);
        }
    } catch (error) {
        elizaLogger.error("Error starting agents:", error);
    }
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1); // Exit the process after logging
});
