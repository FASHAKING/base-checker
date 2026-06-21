# Base Verify Airdrop Demo

A Next.js mini app demonstrating Base Verify integration for social account verification and airdrop claiming. This demo shows how to verify users' social accounts (X/Twitter, Coinbase, Instagram, TikTok) without requiring them to share credentials, while preventing Sybil attacks through deterministic tokens.

## What is Base Verify?

Base Verify allows users to prove ownership of verified accounts on major platforms without sharing credentials. Your app receives a deterministic token that enables Sybil resistance—one verified account = one token = one claim, regardless of how many wallets a user connects.

**Why This Matters:**
Even if a wallet has few transactions, Base Verify reveals if the user is high-value through their verified social accounts (X Blue, Instagram followers, TikTok engagement) or Coinbase One subscription. This lets you identify quality users regardless of on-chain activity.

### Supported Providers

- **X (Twitter)**: Verify accounts, check verification status (blue checkmark), follower counts
- **Coinbase**: Check Coinbase One subscriptions
- **Instagram**: Verify accounts, check follower counts
- **TikTok**: Verify accounts, check followers, likes, video counts

### Key Benefits

- **🛡️ Sybil Resistance**: Deterministic tokens prevent duplicate claims across different wallets
- **🔐 Privacy-First**: Users never share credentials; OAuth handled by Base Verify
- **✅ Trait-Based Access**: Set requirements like "1000+ followers" or "verified account"
- **🌐 Multi-Platform**: Single integration supports multiple identity providers

## Features

- **🔐 Wallet Integration**: Connect via Coinbase Wallet or other Web3 wallets using OnchainKit
- **✅ Social Verification**: Verify X, Coinbase, Instagram, or TikTok accounts using Base Verify API
- **🎯 Trait Requirements**: Require specific account attributes (verified status, follower counts, etc.)
- **🛡️ Anti-Sybil Protection**: Prevent duplicate claims using verification tokens
- **🔒 Secure Flow**: SIWE signatures with backend validation

## Architecture

### Complete Verification Flow

1. **Wallet Connection**: User connects wallet via OnchainKit
2. **Signature Generation**: Frontend generates SIWE message with:
   - Wallet address
   - Provider (x, coinbase, instagram, tiktok)
   - Trait requirements (verified:true, followers:gte:1000, etc.)
   - Action (base_verify_token)
3. **User Signs**: User signs SIWE message with their wallet
4. **Backend Validation**: Your backend validates trait requirements match expectations
5. **Check Verification**: Backend calls Base Verify API with signature
6. **Response Handling**:
   - **200 OK**: User verified and meets traits → Store token and grant access ✅
   - **404 Not Found**: User hasn't verified → Redirect to Base Verify Mini App
   - **400 Bad Request**: User verified but doesn't meet traits → Show requirements not met
7. **OAuth Flow** (if 404): User completes OAuth in Base Verify Mini App
8. **Return & Verify**: User returns to your app → Check again (now 200 OK)
9. **Token Storage**: Store verification token to prevent duplicate claims
10. **Access Granted**: User gains access to airdrop/feature

### How Sybil Resistance Works

The verification token is the key to preventing duplicate claims:

- Wallet A verifies an X account → Base Verify returns `Token: abc123`
- Same X account tries with Wallet B → Base Verify returns `Token: abc123` (same token!)
- Your database sees the token already exists → Block duplicate claim

**Token Properties:**
- **Deterministic**: Same provider account always produces same token
- **Unique per provider**: X token ≠ Instagram token
- **Unique per app**: Your tokens are different from other apps (privacy)
- **Action-specific**: Different actions produce different tokens (e.g., `claim_airdrop` vs `join_allowlist`)
- **Persistent**: Don't expire unless user deletes verification

### Database Schema

```prisma
model VerifiedUser {
  id              String    @id @default(cuid())
  address         String    @unique           // Wallet address
  baseVerifyToken String?   @unique          // Verification token from Base Verify
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("verified_users")
}
```

**Why These Constraints Matter:**

1. **`address` is unique**: Prevents the same wallet from claiming multiple times
2. **`baseVerifyToken` is unique**: **This is the anti-sybil protection**
   - Even if a user connects 10 different wallets
   - The same X/Instagram/TikTok account produces the same token
   - Database rejects duplicate tokens → prevents multi-wallet abuse

**Example Sybil Attack Prevention:**
```
User connects Wallet A → verifies X account → gets Token: abc123 → Claims airdrop ✅
User connects Wallet B → verifies SAME X account → gets Token: abc123 → Database rejects (duplicate token) ❌
```

### Trait-Based Verification

Traits are specific attributes of provider accounts you can verify. Examples:

**X (Twitter):**
- `verified:eq:true` - Has blue checkmark
- `verified_type:eq:blue` - Specific verification type
- `followers:gte:1000` - 1000+ followers

**Coinbase:**
- `coinbase_one_active:eq:true` - Active Coinbase One subscription
- `coinbase_one_billed:eq:true` - User has been billed for Coinbase One

**Instagram:**
- `followers_count:gte:5000` - 5000+ followers
- `username:eq:john_doe` - Specific username

**TikTok:**
- `follower_count:gte:1000` - 1000+ followers
- `video_count:gte:50` - 50+ videos
- `likes_count:gte:10000` - 10000+ likes

**Combining Traits (AND logic):**
```typescript
resources: [
  'urn:verify:provider:x',
  'urn:verify:provider:x:verified:eq:true',
  'urn:verify:provider:x:followers:gte:10000'
]
// User must have verified X account AND 10k+ followers
```

### API Routes

- **POST `/api/verify-token`**: Verifies signature with Base Verify API and stores user
- **GET `/api/users`**: Fetches all verified users
- **POST `/api/delete-airdrop`**: Allows users to delete their claim (requires signature)

## Setup

### Prerequisites

- Node.js 20+ and npm
- PostgreSQL database
- Coinbase Developer Platform account
- Base Verify API access (secret key)

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory (see .env.example)

### 3. Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (for development)
npm run db:push

# Or run migrations (for production)
npx prisma migrate deploy
```

### 4. Run Development Server

```bash
npm run dev
```

The app will start on [http://localhost:3003](http://localhost:3003)

### 5. Open Prisma Studio (Optional)

To view/edit database records:

```bash
npm run db:studio
```

### SIWE Signature with Base Verify

The app uses Sign-In with Ethereum (SIWE) messages to communicate verification requirements. SIWE provides:

1. **Privacy Protection**: Only the wallet owner can check their verification status
2. **Security**: Proves the request comes from the actual wallet owner
3. **Trait Enforcement**: Encodes verification requirements in the signature

**Example SIWE Message:**
```typescript
{
  domain: "your-app.vercel.app",
  address: "0x123...",
  statement: "Verify your X account",
  uri: "https://your-app.vercel.app",
  chainId: 8453, // Base mainnet
  resources: [
    "urn:verify:provider:x",                     // Which provider to check
    "urn:verify:provider:x:verified:eq:true",    // Must be verified
    "urn:verify:provider:x:followers:gte:1000",  // Must have 1000+ followers
    "urn:verify:action:claim_airdrop"            // Your custom action name
  ]
}
```

**Resource URN Format:**
```
urn:verify:provider:{provider}:{trait_name}:{operation}:{value}
```

Examples:
- `urn:verify:provider:x:followers:gte:1000` - X account with 1000+ followers
- `urn:verify:provider:coinbase:coinbase_one_active:eq:true` - Active Coinbase One
- `urn:verify:provider:instagram:followers_count:gt:5000` - Instagram 5000+ followers

### Security Best Practices

**🔴 Critical: Backend Trait Validation**

Your backend MUST validate that trait requirements in the SIWE message match what your backend expects. This prevents users from modifying trait requirements on the frontend to bypass access controls.

```typescript
// Backend validation before calling Base Verify
import { validateTraits } from './lib/trait-validator';

const expectedTraits = {
  'verified': 'true',
  'followers': 'gte:1000'
};

const validation = validateTraits(message, 'x', expectedTraits);

if (!validation.valid) {
  return res.status(400).json({ error: 'Invalid trait requirements' });
}

// Now safe to forward to Base Verify API
```

**Example Attack Without Validation:**
1. App requires 1000 followers
2. User modifies frontend to only require 10 followers
3. User signs the modified message
4. Without validation, backend forwards to Base Verify
5. User gains access with only 10 followers ❌

**Secret Key Security:**
- ❌ Never expose secret key in frontend code
- ❌ Never use `NEXT_PUBLIC_*` environment variables for secrets
- ❌ Never commit secret keys to version control
- ✅ Always call Base Verify API from your backend
- ✅ Store secret key in backend-only environment variables

### Signature Caching

To improve UX, signatures are cached in localStorage for 5 minutes:
- Prevents repeated signature requests during verification flow
- Automatically cleared on address change or error
- Validates address and action match before reuse

### Base Verify Web App Redirect

When a user hasn't verified yet (404 response), redirect them to the Base Verify web app:

```typescript
function redirectToVerifyWebApp(provider: string) {
  const params = new URLSearchParams({
    redirect_uri: 'https://your-app.com',
    providers: provider, // 'x', 'coinbase', 'instagram', or 'tiktok'
  });
  
  const webAppUrl = `https://verify.base.dev?${params}`;
  window.location.href = webAppUrl;
}
```

User returns with `?success=true`, then check verification again (now returns 200 OK).

### API Response Codes

Understanding Base Verify API responses:

| Code | Meaning | Action |
|------|---------|--------|
| **200 OK** | User verified and meets all trait requirements | ✅ Store token, grant access |
| **404 Not Found** | User hasn't verified this provider yet | 🔄 Redirect to Base Verify Mini App |
| **400 Bad Request** | User verified but doesn't meet trait requirements | ⚠️ Show "Requirements not met" (don't redirect) |
| **401 Unauthorized** | Invalid or missing API key | 🔑 Check your secret key |

**Important:** Don't retry 400 errors. The user has the account but doesn't meet your requirements (e.g., not enough followers). Retrying won't help unless their account metrics change.

### Delete Functionality

Users can delete their own airdrop claim:
- Signs message: `"Delete airdrop for {address}"`
- Backend verifies signature using Viem (supports EOA & EIP-1271)
- Removes user from database
- Note: If user re-verifies the same account, they get the same token (can't claim again)

---

## Documentation

For more detailed information, see the `/docs` folder:

- **[Getting Started](/docs/index.md)** - Quick overview and contact information
- **[Core Concepts](/docs/core-concepts.md)** - Understanding providers, traits, tokens, and Sybil resistance
- **[Integration Guide](/docs/integration.md)** - Complete implementation walkthrough with code examples
- **[Trait Catalog](/docs/traits.md)** - All available traits for X, Coinbase, Instagram, and TikTok
- **[API Reference](/docs/api.md)** - Complete API endpoint documentation
- **[Security & Privacy](/docs/security.md)** - Security best practices and data handling

---

## Base Airdrop Checker (`/checker`)

A unified eligibility checker for **Base mainnet** wallets, synthesizing patterns from the four largest L2 airdrops plus the Base Verify identity layer in this repo.

### Criteria (six, 1–3 pts each, 18 pts max)

| # | Criterion | Category | Inspired by |
|---|---|---|---|
| 1 | Transaction count (≥5 / 25 / 100) | Activity | Arbitrum (≥4 txs), Optimism, zkSync (≥10 txs) |
| 2 | Distinct months active (≥2 / 6 / 12) | Activity | Arbitrum tiered months, Optimism repeat-user, zkSync (≥3 months) |
| 3 | Unique contracts touched (≥4 / 10 / 25) | Breadth | Arbitrum (≥4/≥10 contracts), zkSync breadth bonus |
| 4 | ETH held on Base (≥0.01 / 0.1 / 1) | Capital | zkSync hold ≥$50, Arbitrum bridged-volume tiers |
| 5 | Wallet age in days (≥30 / 180 / 365) | Longevity | Arbitrum Nitro snapshot, Optimism pre-snapshot bonus |
| 6 | Base Verify identity | Identity | **Base Verify (this repo)** + zkSync crypto-native bonus |

### Sybil flags (penalties)

| Flag | Severity | Inspired by |
|---|---|---|
| Zero txs on Base | Critical (-99) | Every L2 |
| Wallet < 7 days old on Base | Warning (-1) | LayerZero sniper, zkSync cluster |
| All activity within 1 calendar month despite ≥5 txs | Warning (-2) | Optimism repeat-user, zkSync pattern-similarity |
| Identity already claimed from another wallet | Critical (-99) | Base Verify deterministic token (this repo) |

### Bonus credit (optional, +6 pts max → 24 pts total)

These are **opt-in** and never penalize a user for not having them.

| # | Criterion | Tiers | How we detect |
|---|---|---|---|
| 7 | Linked Base App / Smart Wallet | detected (+1) · active 5+ txs (+2) · heavy 25+ txs (+3) | Optional second address field. Backend does `eth_getCode` — non-empty bytecode means it's a smart-contract wallet (Base App ships Coinbase Smart Wallet by default). |
| 8 | Base mini app engagement | 1+ (+1) · 3+ (+2) · 5+ (+3) | Curated registry in `lib/miniAppRegistry.ts` — counts distinct mini app contracts the primary address (and linked Smart Wallet) has interacted with. |

**Honest limitation on mini app tracking:** there is no public global signal for *"user X opened mini app Y."* The onchain registry approach only catches mini apps with onchain contracts the user actually transacts with. The registry ships empty so we don't fabricate addresses — populate it with the mini app contracts you want to credit users for. Future extension: accept a Farcaster FID and call Neynar API for off-chain mini app activity.

### Tiers

- `0 pts` → **Ineligible**
- `1–8 pts` → **Low** (minimal activity)
- `9–14 pts` → **Medium** (active user)
- `15–20 pts` → **High** (power user)
- `21–24 pts` → **Whale** (top-tier)

### Architecture

- **Frontend**: `pages/checker.tsx` — paste any address (or use the connected wallet) and run a check
- **API**: `GET /api/check-wallet?address=0x…` — returns a `CheckerResult` JSON
- **Scoring**: `lib/baseChecker.ts` + `lib/baseCheckerCriteria.ts`
- **Data sources**:
  - Base mainnet RPC (`viem` + `https://mainnet.base.org`) — balance, tx count fallback
  - BaseScan API — months active, unique contracts, wallet age, first-tx timestamp
  - Prisma DB — Base Verify identity check (re-uses existing `verified_users` table)

### What's similar to other L2 airdrops, what's different

**Similar**: tx-count tiers, distinct months active, contract breadth, capital commitment — these are the four near-universal pillars across ARB, OP, ZK, ZRO.

**Different / unique to Base**:
1. **Identity-as-a-pillar.** No other major L2 used a privacy-preserving social identity layer like Base Verify as a first-class eligibility input. Here a verified X Blue or Coinbase One trait scores like 0.1 ETH held.
2. **Deterministic anti-sybil at the identity layer.** zkSync and LayerZero ran reactive sybil sweeps post-facto; Base Verify enforces "one identity → one token → one claim" at write time (see `pages/api/verify-token.ts:120-127`).
3. **No bridge-volume requirement.** Most L2 drops weighted bridged-in capital; Base is the canonical "your money is already here" L2, so capital is measured as held balance, not bridged volume.
4. **Lower tx-count thresholds.** Base mainnet gas is cheap enough that active users trivially clear Arbitrum-style thresholds, so the tiers are calibrated higher per point.

---

## $BASE Allocation Estimator (`/allocation`)

Pipes the `/checker` eligibility score through a tunable airdrop economic model to estimate a wallet's $BASE allocation in tokens and USD.

### Default parameters (all user-adjustable on the page)

| Parameter | Default | Why |
|---|---|---|
| Total supply | 1,000,000,000 ($BASE) | Spec default; matches OP scale, under ZK |
| Airdrop % | 10% | Mean of ARB 11.62% / OP 5% / ZK 17.5% / ZRO 8.5% |
| FDV at launch | $5,000,000,000 | Conservative middle vs. ARB $12B / OP $8B / ZK $8B / ZRO $6B |
| Assumed eligible wallets | 500,000 | Between ARB ~625k and OP ~250k |
| Tier multipliers | Whale 8× · High 3× · Medium 1× · Low 0.25× · Ineligible 0× | Models the curve — top users get ~32× a low-tier wallet, matching ARB's tiered structure |

### Formula

```
pool        = totalSupply × airdropPct
tokenPrice  = FDV / totalSupply
baseAlloc   = pool / eligibleWallets
inTierBonus = 0.7 + min(1, score/maxScore) × 0.6     # 0.7×..1.3×
userTokens  = baseAlloc × tierMultiplier × inTierBonus
userUsd     = userTokens × tokenPrice
```

The in-tier bonus (0.7×–1.3×) prevents two whales with very different scores from getting identical allocations.

### Default math walk-through

With defaults: pool = 100M $BASE, token price = $5, base allocation = 200 $BASE.

| Tier | Multiplier | Range (with in-tier bonus) | USD value @ $5 |
|---|---|---|---|
| Ineligible | 0× | 0 $BASE | $0 |
| Low | 0.25× | 35 – 65 $BASE | $175 – $325 |
| Medium | 1× | 140 – 260 $BASE | $700 – $1,300 |
| High | 3× | 420 – 780 $BASE | $2,100 – $3,900 |
| Whale | 8× | 1,120 – 2,080 $BASE | $5,600 – $10,400 |

---

## Get Started

**Want to integrate Base Verify?** Fill out the [interest form](https://forms.gle/6L4hWAHkojYcefz27) and we'll reach out with API access.

