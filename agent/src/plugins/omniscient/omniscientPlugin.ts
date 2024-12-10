import { Plugin } from "@ai16z/eliza";
import { summaryAction } from "./actions/summaryAction";
import { omniscientProvider } from "./providers/omniscientProvider";

export const omniscientPlugin: Plugin = {
    name: "OMNISCIENT",
    description:
        "Maintains project overview and guides team focus by filtering noise and highlighting priorities",
    evaluators: [],
    providers: [omniscientProvider],
    actions: [
        summaryAction,
        // priorityFilterAction,
        // contextSwitchAction,
        // focusMetricsAction,
    ],
};

export default omniscientPlugin;
