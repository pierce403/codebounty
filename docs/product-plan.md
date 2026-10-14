# Codebounty product plan

## Purpose and initial scope

Codebounty helps people find repositories that have explicitly joined the platform, then helps project owners describe the pull requests they want to recognize. Contributors get clear eligibility and acceptance criteria, and owners get a review queue. Repository participation is a separate owner decision from creating a bounty. A bounty may suggest an existing PR, but the current prototype treats that URL as context rather than a claim or a GitHub action.

The implemented prototype demonstrates a GitHub sign-in explanation, fictional repository opt-in, project discovery/search, repository entry, bounty creation, PR URL submission, and owner review with representative data. The sign-in button opens an explanation only: it does not create a signed-in state, grant access, or establish identity. It stores changes only in the current browser. Its `selected` state is a local review marker, not an award, debt, funding instruction, or payment. There is no live GitHub authentication, ownership check, PR validation, escrow, settlement, or public deployment.

## First intended project: deanpierce.net

Read-only verification identified [pierce403/deanpierce.net](https://github.com/pierce403/deanpierce.net) (GitHub repository ID `628037447`) as the MkDocs source for `deanpierce.net`, packaged with Cloudflare Workers Static Assets. The authenticated `pierce403` account has repository admin permission. This verifies the backing repository and current GitHub permission only; it does **not** constitute an opt-in to Codebounty, configure the app, or authorize publication of a bounty.

Prepare a **draft** blog-corrections bounty for that intended project with a proposed **20 USDC** amount. It must stay unpublished and unfunded: show it only in the owner-side draft workspace, never in public discovery or contributor submission. Scope can describe clear typo, broken-link, and factual corrections to blog content; factual changes should cite evidence, and the owner should review each PR against the posted criteria. The amount basis (**per accepted correction or total bounty**) and payout network are unresolved. Do not infer either, and do not activate an offer or payout flow until both are chosen along with the funding and terms model. No wallet, payout address, transfer, or payment commitment is part of this draft.

## Proposed owner and contributor flows

1. **Sign in:** Use a real GitHub authorization flow in production to establish a server-side session. The prototype button only explains the future flow; it does not authenticate or request credentials or grants.
2. **Owner opt-in:** Install a repository-scoped GitHub App, choose a repository the signed-in account administers, and explicitly opt it into discovery. Show the intended public profile and require confirmation. The repository is searchable only after server-side installation and authority checks. The owner can withdraw it independently of any bounty.
3. **Contributor discovery:** Search or filter only active opted-in repositories, open a project profile, then browse its open bounties. Read criteria and terms, submit a PR in that repository with a short explanation, and see live eligibility checks before submitting. Allow withdrawal until an owner decision.
4. **Owner bounty and review:** Draft a bounty with a title, scope, measurable criteria, deadline, eligible PR window, proposed reward terms, and optional suggested PR. Preview and publish only for an active opted-in repository after server-side permission checks. Inspect submitted PRs, checks, author, changes, and criteria. Explicitly accept or reject with a recorded reason. For the initial production version, one bounty has at most one accepted submission and acceptance requires the PR to be merged into the specified base branch; merge by itself never accepts a claim.
5. **After decision or opt-out:** Notify affected parties and retain an audit trail. Withdrawing a repository immediately unlists it and stops new bounties and submissions; existing claims follow a published closure policy rather than disappearing silently. Payment handling remains a separate product and legal decision.

## States and records

The demo has no signed-in state. Its repository participation states are `not_opted_in`, `opted_in`, and `withdrawn`, all fictional browser state rather than verified GitHub authority. Its bounty states are `draft`, `open`, `in_review`, `selected`, and `closed`, and submission states are `pending`, `selected`, and `declined`. The deanpierce.net example stays in `draft`, outside discovery and submissions. Proposed production states are:

| Record | States | Rules |
| --- | --- | --- |
| Repository participation | `not_opted_in → active → withdrawn`; `active → suspended` | Only an authorized owner can activate or withdraw. Search includes `active` only, and an authority failure can suspend visibility and writes. This state is independent of bounty state. |
| Bounty | `draft → open → in_review → awarded`; `open` or `in_review → closed` or `expired` | `awarded` follows an explicit owner decision and an eligible merged PR. `closed` means no winner. An owner can return `in_review` to `open` if all claims are declined. |
| Submission | `submitted → in_review → accepted` or `rejected`; `submitted → withdrawn` | One accepted submission per bounty. A contributor may withdraw before a decision. |

Suggested D1 records (all IDs are internal IDs unless marked GitHub):

| Table | Essential fields |
| --- | --- |
| `users` | GitHub numeric user ID, current login, created/last-seen times |
| `repositories` | GitHub numeric repository and owner IDs, full name, visibility, installation ID, current metadata; identifying a repo does not opt it in |
| `repository_opt_ins` | Repository ID, status, opting-in actor ID, verified authority/time, public profile metadata, consent/version, opted-in and withdrawn times, withdrawal reason; unique current state per repository |
| `bounties` | Repository ID, owner user ID, title, scope, asset/currency and *proposed* amount, amount basis (`per_accepted_correction` or `total` once chosen), network/asset identity if applicable, criteria JSON/version, optional suggested PR ID, eligible window, deadline, status, timestamps |
| `submissions` | Bounty ID, contributor user ID, GitHub numeric PR ID and number, PR author ID, head SHA at submission, note, status, timestamps; unique `(bounty_id, github_pr_id)` |
| `decisions` | Bounty/submission IDs, acting owner ID, criteria version, reviewed head SHA, decision, reason, timestamp |
| `payout_destinations` | Contributor user ID, explicitly selected network/chain ID, address, verification state/time, created/updated times; private, never returned in public responses |
| `triage_runs` | Bounty/submission IDs, PR head SHA, criteria version, model/rule version, findings with evidence and uncertainty, time; recommendation only |
| `audit_events` | Actor, object, action, time, and minimal structured details; never store access tokens or webhook secrets |

Store immutable GitHub numeric IDs as the identity keys. Names and URLs can change after a repository rename or transfer. Use a database constraint or conditional write so two concurrent reviews cannot create two winners.

## Repository authority and PR checks

Typing `owner/repo` is only an identifier, and signing in alone does not opt a repository in. Before listing a repository in discovery, publishing or changing its bounties, withdrawing it, or deciding a submission, the server should confirm that the GitHub App installation still has access to it and that the signed-in GitHub user still has repository `admin` permission. GitHub's [installation repositories endpoint](https://docs.github.com/en/rest/apps/installations?apiVersion=2022-11-28) can return the signed-in user's repository permissions; the [repository permission endpoint](https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2022-11-28#get-repository-permissions-for-a-user) is another check. Organization policy and authority to fund rewards require separate approval. Unlist and disable writes after installation removal, permission loss, or repository transfer until reverified. Do not expose private repository metadata in public search.

At submission and again at decision time, fetch the PR from GitHub and check:

- Its immutable repository ID matches the bounty repository, and the authenticated contributor is the PR author. Team claims or proxy submissions need an explicit future policy.
- The PR falls within the published eligible window and deadline, targets the required base branch, is not a draft, and is not already claimed for that bounty. Existing unmerged PRs can be eligible; already merged work is excluded unless the bounty explicitly nominates it.
- The current PR state, head SHA, checks, and merge result match the policy recorded with the bounty. Recheck immediately before acceptance so a changed PR is not accepted based on an old review snapshot.
- The owner checks every published criterion and records a reason. Acceptance requires a merged PR in the target branch for the initial production policy; a merge alone does not grant a reward.

Freeze or version criteria once a submission exists. Material changes should require a new bounty or renewed contributor consent. Clarify whether a suggested PR is merely an example or the only eligible PR before enabling that field in production.

## Contributor payout destination: future configuration

The prototype's contributor settings use `viem` `isAddress`/`getAddress` locally, with no RPC. The form asks for an explicit network (Ethereum Mainnet or Base Mainnet) and a `0x` address. A valid entry is stored under `codebounty-payout-session-v1` in that tab's `sessionStorage`, masked by default, and can be temporarily revealed or cleared. It is not linked to a signed-in user or the deanpierce.net draft, and entering it does not choose the draft's payout network. It is never sent to a server or saved in `localStorage`.

For a future account setting, allow a contributor to save or replace a payout destination only after the supported asset and network are approved. Require an explicit network selection using a canonical chain ID; a `0x` address alone does not identify a network. For an Ethereum-style address, validate exactly 20 bytes of hexadecimal data and validate mixed-case input with [ERC-55 checksum rules](https://eips.ethereum.org/EIPS/eip-55). Reject malformed or incorrectly checksummed input rather than silently altering it. Tie the destination to the selected chain and the approved network-specific USDC asset identity; [EIP-155](https://eips.ethereum.org/EIPS/eip-155) provides the chain-ID convention. Address format validation alone does not establish that the contributor controls the address or can receive a given asset. Decide any control proof and supported contract-wallet policy before payouts.

Treat the GitHub identity ↔ payout-address link as private data: keep it out of discovery, PR comments, logs, analytics, and public APIs; display only a masked destination in account settings; require an authenticated recheck to change it; retain and delete it under a documented policy. The prototype may accept a user-entered address for local validation and tab-session storage, but must not send it to a server, store it in `localStorage`, connect a wallet, request a signature, or initiate a transaction. The deanpierce.net draft cannot publish while the 20 USDC amount basis and network remain unanswered.

## Safe automated PR triage

The owner studio includes a fixed-sample triage UI backed by a demo-only, rule-based helper for supplied PR metadata. It checks repository match, owner-listed blog content paths, draft/detail signals, and change size to recommend `review`, `needs_details`, or `unlikely_fit`. The sample is illustrative and is not a submission to the pilot. The helper does not fetch a PR, read patch instructions, judge factual truth, run code, accept a claim, or authorize a payout. Its output is context for a human reviewer, not an eligibility decision.

A future repository-scoped GitHub App may read PR metadata, changed-file lists, and bounded diff excerpts to suggest whether a submission addresses the bounty and appears to meet its criteria. GitHub documents [read access for PR details and files](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28) and advises [minimum App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app). Start with repository metadata and Pull requests **read** permission; any further scope needs a concrete reason and approval.

Triage should report an evidence-backed recommendation and uncertainty, record the PR head SHA and criteria version, and refresh when the PR changes. The owner retains the final acceptance decision after checking merge state and criteria. PR titles, bodies, code, diffs, and comments are untrusted input: do not follow instructions embedded in them, run submitted code, fetch attacker-supplied URLs, expose secrets, or give the triage process write access. Limit payload sizes and keep private repository content out of public output. Do not post GitHub comments, labels, reviews, or status checks until that separate action is authorized.

## Abuse and operational controls

- Rate limit account, repository, bounty, and submission actions; cap active claims per contributor and prevent duplicate PR claims.
- Reject attempts to opt in another owner's repository, revalidate participation authority periodically, and remove a repository from search promptly on opt-out or GitHub App uninstall. Search must filter by verified active opt-ins on the server, not a client-provided flag.
- Add reporting and manual moderation for spam, misleading offers, plagiarism, and disputed decisions. Keep a visible cancellation policy and audit log.
- Verify GitHub webhooks using the raw request body and `X-Hub-Signature-256`, deduplicate deliveries, and periodically reconcile PR status with GitHub. [GitHub's webhook validation guide](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) describes the signature check.
- Use [Turnstile with server-side Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) for risky public forms if abuse warrants it; a browser widget by itself is insufficient.
- Keep GitHub tokens, session keys, and webhook secrets in Worker secrets, use minimal GitHub App permissions, and avoid storing unnecessary PR contents or private repository data.
- Keep payout destinations private and limit triage to bounded, read-only GitHub data. An automated recommendation must never create a payment obligation or replace owner review.

## Cloudflare architecture

The current code is a React/Vite app served through [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) with `run_worker_first` for `/api/*`; `GET /api/meta` explicitly reports demo status. No remote resource or GitHub credential is attached. The next stage is a Worker API backed by [D1 via a Worker binding](https://developers.cloudflare.com/d1/get-started/) and a GitHub App for real sign-in and repository-scoped installation access. Add migrations, server-side sessions, a discovery endpoint that selects only verified active opt-ins, ownership and PR checks, and signed webhook processing. A queue is useful later only if webhook volume or retry needs justify it. Cloudflare observability is configured, but production logging must exclude tokens and private data.

## Decisions before production

1. Approve the GitHub App registration, requested permissions, OAuth/user authorization flow, session design, and webhook secret handling. No OAuth app, GitHub App, credentials, or persistent grants have been created for the prototype.
2. Approve Cloudflare account/environment, D1 provisioning and cost, deployment workflow, and operational ownership. Build and Wrangler dry run do not create a production service.
3. Resolve whether the deanpierce.net draft means **20 USDC per accepted correction or 20 USDC total**, and select a supported network and network-specific USDC asset only after review. Define who may legally post a reward, whether amounts are binding, funding/escrow/provider model, payout eligibility, tax and dispute process, cancellation rights, and terms. No real reward publishing or money movement should happen before these choices.
4. Explicitly opt deanpierce.net into Codebounty after the real GitHub App exists and authority is checked; the verified backing repo is not already opted in. Decide repository opt-in and withdrawal terms, including what happens to open bounties and pending submissions after opt-out. Decide whether to allow private repositories, already merged PRs, team claims, multiple winners, and owner-nominated PRs. Confirm the single-winner, merged-PR acceptance policy or change it before launch.
5. Approve moderation and support process, retention policy, and public launch. `codebounty.net` is a possible domain, but registrar control is unverified; do not change its DNS. No ownership evidence was found for `codebounty.org`.

No production deployment or DNS change has been performed.
