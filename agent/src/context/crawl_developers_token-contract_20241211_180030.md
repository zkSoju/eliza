---
title: Token Contract – ApiologyDAODiscordXSunMoonDiscordXMenuChevron RightArrow LeftArrow Right
source_url: https://docs.apiologydao.xyz/developers/token-contract
date_scraped: 2024-12-11 18:00:30
---

[Skip to content](/developers/token-contract#vocs-content)

Search

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar)

[X](https://x.com/apiologydao)

Sun

Moon

[![Logo](/logo.png)](/)

[Discord](https://discord.com/invite/thehoneyjar) [X](https://x.com/apiologydao)

Menu

Token Contract

On this page
Chevron Right

## Overview

The ApiologyDAO Token (APDAO) is an ERC721A-based NFT contract that implements membership tokens for ApiologyDAO. It features advanced claiming mechanics, governance token integration, and specialized transfer restrictions to maintain the DAO's economic model.

## Core Features

- ERC721A implementation for gas-efficient minting
- Merkle-tree based token claiming system
- Integration with deposit contract for additional claiming rights
- Station X governance token minting/burning mechanics
- Restricted transfer system with authorized transferors
- Liquid Backing Treasury (LBT) and Auction House integration

## How It Works

### Token Distribution

Tokens can be acquired through three main mechanisms:

- Pre-reserved claims (verified via Merkle proof)
- Deposit contract claims
- Auction House minting

### Transfer Restrictions

The contract implements a controlled transfer system where tokens can only be transferred:

- To/from the Liquid Backing Treasury
- To/from the Auction House
- By authorized transferors

### Governance Token Integration

Each APDAO token is linked to Station X governance tokens:

- Governance tokens are minted when claiming or receiving tokens.
- Governance tokens are burned when transferring to LBT/Auction House.
- Multiple governance token contracts can be supported simultaneously.

### Audits

We had an audit performed by the [Pashov Audit Group](https://twitter.com/PashovAuditGrp). The final report will be released shortly.