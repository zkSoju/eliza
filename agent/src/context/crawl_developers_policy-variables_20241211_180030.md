---
title: Policy Variables – ApiologyDAODiscordXSunMoonDiscordXMenuChevron RightArrow Left
source_url: https://docs.apiologydao.xyz/developers/policy-variables
date_scraped: 2024-12-11 18:00:30
---

[Skip to content](/developers/policy-variables#vocs-content)

Search

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar)

[X](https://x.com/apiologydao)

Sun

Moon

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar) [X](https://x.com/apiologydao)

Menu

Policy Variables

On this page
Chevron Right

## Overview

These policy parameters can be changed by a vote from the DAO members, allowing the Apiology DAO community to adjust the economic and functional rules of the system as needed or desired.

### Auction House Policy Parameters

1. `duration`
   - Description: The duration (in seconds) for each auction held in the ApiologyDAO Auction House.
   - Default Value: 1 day (86,400 seconds)
   - Functionality: This parameter controls how long each auction will run before it is settled. Shorter durations may increase the pace of auctions, while longer durations give users more time to participate.
2. `reservePriceBuffer`
   - Description: The buffer percentage added to the Real Floor Value (RFV) of a seat to determine the reserve price at auction creation.
   - Default Value: 10%
   - Functionality: This parameter ensures that the reserve price set for each auction is above the RFV, offering a buffer to prevent underpriced sales. For example, if the RFV is 1 ETH and the buffer is set to 10%, the reserve price will be 1.1 ETH.
3. `timeBuffer`
   - Description: The minimum time (in seconds) left in the auction after a new bid is placed, to prevent last-second "sniping" of auctions.
   - Default Value: 5 minutes (300 seconds)
   - Functionality: If a bid is placed close to the auction’s end, this buffer ensures that the auction will be extended to allow other participants time to respond, preventing unfair advantages for last-minute bidders.
4. `minBidIncrementPercentage`
   - Description: The minimum percentage by which a new bid must exceed the previous bid.
   - Default Value: 5%
   - Functionality: This parameter ensures that each successive bid in the auction is meaningfully higher than the last, preventing incremental bidding wars. For example, if the last bid was 1 ETH, the next bid must be at least 1.05 ETH with a 5% increment.
5. `feePercentage`
   - Description: The fee percentage taken from all auction sales, which is sent to the Liquid Backing Treasury.
   - Default Value: 10%
   - Functionality: A portion of each auction's sale proceeds will be deducted as a fee and sent to the DAO’s treasury to support its financial health and ongoing operations.
6. `randomRequestTimeout`
   - Description: The timeout duration (in seconds) after which a user can request a new random number if the Pyth entropy service fails to deliver.
   - Default Value: 5 minutes (300 seconds)
   - Functionality: This parameter ensures that if a request for randomness fails, the system allows users to reinitiate the request after the timeout period, maintaining fairness and functionality in auction operations.

### Treasury Contract Policy Parameters

1. `minLoanDuration`
   - Description: The minimum allowed duration (in seconds) for any new loans issued from the Liquid Backing Treasury.
   - Default Value: 1 day (86,400 seconds)
   - Functionality: This policy parameter controls the minimum time that funds can be borrowed from the treasury, ensuring that loans are not issued for excessively short terms, which could disrupt the treasury’s financial planning.
2. `termLimit`
   - Description: The maximum allowed duration (in seconds) for any loan issued by the Liquid Backing Treasury.
   - Default Value: 1 year (31,536,000 seconds)
   - Functionality: This parameter caps the length of time for which a loan can be held before repayment is required. By limiting loan terms, the DAO ensures liquidity is returned to the treasury within a reasonable timeframe to maintain operational flexibility.

### Audits

The final report will be released shortly.