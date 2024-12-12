import type { Plugin } from "@ai16z/eliza";
import { sendAction } from "./actions/sendAction";
import { socialManagementAction } from "./actions/socialManagementAction";
import { swapAction } from "./actions/swapAction";
import { sendEvaluator } from "./evaluators/sendEvaluator";
import { swapEvaluator } from "./evaluators/swapEvaluator";
import { balanceAction } from "./providers/balanceProvider";
import { berachainSocialProvider } from "./providers/socialProvider";
import { checkUserBalanceAction } from "./providers/userBalancesProvider";
import { berachainWalletProvider } from "./providers/walletProvider";
import { walletAction } from "./actions/walletAction";

export const berachainPlugin: Plugin = {
    name: "berachain",
    description:
        "Berachain integration plugin for onchain actions and token management",
    providers: [berachainWalletProvider, berachainSocialProvider],
    evaluators: [swapEvaluator, sendEvaluator],
    services: [],
    actions: [
        swapAction,
        balanceAction,
        checkUserBalanceAction,
        socialManagementAction,
        sendAction,
        walletAction,
    ],
};

export default berachainPlugin;
