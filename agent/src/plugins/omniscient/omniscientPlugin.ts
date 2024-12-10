import { Plugin } from "@ai16z/eliza";
import { contextSummaryAction } from "./actions/contextSummaryAction";
import { projectSummaryAction } from "./actions/projectSummaryAction";
import { summaryAction } from "./actions/summaryAction";
import { projectEvaluator } from "./evaluators/projectEvaluator";
import { omniscientProvider } from "./providers/omniscientProvider";

export const omniscientPlugin: Plugin = {
    name: "OMNISCIENT",
    description:
        "Maintains project overview and guides team focus by filtering noise and highlighting priorities",
    evaluators: [projectEvaluator],
    providers: [omniscientProvider],
    actions: [
        summaryAction,
        projectSummaryAction,
        contextSummaryAction,
        // priorityFilterAction,
        // contextSwitchAction,
        // focusMetricsAction,
    ],
};

export default omniscientPlugin;
