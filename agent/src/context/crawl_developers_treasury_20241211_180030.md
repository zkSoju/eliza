---
title: Treasury – ApiologyDAODiscordXSunMoonDiscordXMenuChevron RightArrow LeftArrow Right
source_url: https://docs.apiologydao.xyz/developers/treasury
date_scraped: 2024-12-11 18:00:30
---

[Skip to content](/developers/treasury#vocs-content)

Search

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar)

[X](https://x.com/apiologydao)

Sun

Moon

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar) [X](https://x.com/apiologydao)

Menu

Treasury

On this page
Chevron Right

## Overview

The APDAO Treasury is a smart contract that manages a treasury system for the NFT collection, providing both backing value and loan functionality. It allows NFT holders to use their tokens as collateral for loans. The contract maintains a backing pool of WETH, which determines the RFV of the collection. The treasury is set up in tandem with the auction house to provide up only tech for our members meaning every action members take (even defaulting on loans) actually increases the withdrawable backing for all other members.

An article describing the mechanism of the original system design upon which this contract is inspired by can be found here: [NFT Treasury and Liquidity Concept](https://hackmd.io/@ind-igo/ntlc?utm_source=preview-mode&utm_medium=rec).

## Core Features

- NFT-backed risk-free loans with customizable terms
- Dynamic Real Floor Value (RFV) calculation based on treasury backing
- Auction house integration with limited redemptions

## How It Works

- **Backing Added**: DAO operations will be streaming a constant flow of backing to be added to this treasury contract
- **Take Out Loans**: Users can borrow backing by using their NFTs as collateral.
- **Repay Loans**: Users can repay loans with interest to reclaim their NFTs.
- **Claim Expired Loans**: Anyone can settle expired loans and adjust the treasury’s backing, adding more backing to the entire collection.

## Audits

We had an audit performed by the [Pashov Audit Group](https://twitter.com/PashovAuditGrp). The final report will be released shortly.