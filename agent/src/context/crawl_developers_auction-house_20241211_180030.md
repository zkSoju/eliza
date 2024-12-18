---
title: Auction House – ApiologyDAODiscordXSunMoonDiscordXMenuChevron RightArrow LeftArrow Right
source_url: https://docs.apiologydao.xyz/developers/auction-house
date_scraped: 2024-12-11 18:00:30
---

[Skip to content](/developers/auction-house#vocs-content)

Search

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar)

[X](https://x.com/apiologydao)

Sun

Moon

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar) [X](https://x.com/apiologydao)

Menu

Auction House

On this page
Chevron Right

## Overview

The ApiologyDAO Auction House is a fork of the Nouns DAO auction house that manages automated NFT auctions with dynamic pricing based on treasury backing. It supports both newly minted NFTs and existing NFTs submitted by members wanting to sell through a queue system, allowing members to sell their seats through the auction house. The contract implements a fair, transparent, and efficient auction mechanism with built-in randomization (VRF) for queue management.

## Core Features

- Continuous auction system where each auction runs for a preset duration. There will always be auctions as long as someone in the world wants to buy a seat
- Dynamic reserve pricing based on the Beramarket backing treasuries Real Floor Value (RFV)
- Support for both newly minted NFTs and existing NFTs from members
- Random selection from the auction queue using Pyth Network's Entropy
- Built-in fee mechanism for DAO sustainability
- Fallback WETH handling for failed ETH transfers
- Comprehensive auction state tracking and history

## How It Works

### Auction Creation

When a new auction is created, the contract either:

- Mints a new NFT if the queue is empty
- Randomly selects an NFT from the queue using Pyth's Entropy VRF
- Sets the reserve price based on the treasury RFV plus a configurable buffer
- Initiates the auction with a defined duration

### Bidding Process

- Users place bids
- Each bid must exceed the previous bid by a minimum increment percentage
- A time buffer extends the auction if a bid is placed near the end
- Previous bidders are automatically refunded

### Settlement Process

- The contract does not automatically settle. A user must call the `settleCurrentAndCreateNewAuction()` function to settle the previous auction and create a new one.
- The auction winner or the user whose NFT was auctioned is most incentivized to settle, as they either receive their NFT or their money. However, anyone can call the function.
- If no bids are placed:
  - Queued NFTs are redeemed for RFV minus a small fee, and minted NFTs are burned.
  - Proceeds from the auction go to the original owner (minus fees) or the backing treasury, depending on whether the NFT was minted or queued.

### Configuration Variables

- `duration`: Length of each auction
- `reservePrice`: Minimum acceptable bid
- `reservePriceBuffer`: Percentage added to RFV for reserve price
- `timeBuffer`: Extension time when late bids are received
- `minBidIncrementPercentage`: Required bid increase percentage
- `feePercentage`: Fee taken from successful auctions

### Audits

We had an audit performed by the [Pashov Audit Group](https://twitter.com/PashovAuditGrp). The final report will be released shortly.

### Auction House: Walkthrough for Users

(to be added shortly)