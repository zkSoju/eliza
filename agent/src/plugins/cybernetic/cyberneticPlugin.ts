import { Plugin } from "@ai16z/eliza";
import { cyberneticProvider } from "./providers/cyberneticProvider";

export const cyberneticPlugin: Plugin = {
    name: "CYBERNETIC",
    description:
        "Provides background organizational context and knowledge to help agents understand their environment",
    evaluators: [],
    providers: [cyberneticProvider],
    actions: [],
};

export default cyberneticPlugin;
