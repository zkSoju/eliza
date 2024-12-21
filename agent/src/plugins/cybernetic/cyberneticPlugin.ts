import { Plugin } from "@ai16z/eliza";
import { strategicInsightAction } from "../omniscient/actions/strategicInsightAction";
import { teamAlignmentAction } from "../omniscient/actions/teamAlignmentAction";
import { marketDataRefreshAction } from "./actions/marketDataRefreshAction";
import { marketSummaryAction } from "./actions/marketSummaryAction";
import { cyberneticProvider } from "./providers/cyberneticProvider";
import { helpRulesProvider } from "./providers/helpProvider";
import { rulesProvider } from "./providers/rulesProvider";
import { simpleHashProvider } from "./providers/simpleHashProvider";

export const cyberneticPlugin: Plugin = {
    name: "CYBERNETIC",
    description:
        "Provides organizational intelligence and team alignment capabilities",
    evaluators: [],
    providers: [
        simpleHashProvider,
        rulesProvider,
        cyberneticProvider,
        helpRulesProvider,
    ],
    actions: [
        teamAlignmentAction,
        strategicInsightAction,
        marketSummaryAction,
        marketDataRefreshAction,
    ],
};

export default cyberneticPlugin;
