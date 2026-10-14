# Codebounty

Codebounty is an interactive prototype for discovering GitHub projects whose owners have opted in and recognizing valuable pull requests. The intended main flow is GitHub sign-in, search across opted-in repositories, then a clear bounty and PR review process. Project owners can identify a repository, opt it into the demo directory, describe useful work, set review criteria and an illustrative reward amount, and review PR submissions. Contributors can find a participating project and submit an existing PR for consideration.

**Demo only:** The GitHub sign-in button opens an explanation; it does not authenticate, create a signed-in session, or request a GitHub grant. Sample participation and opt-in states are fictional. Repositories, bounties, submissions, and review decisions are stored in this browser (`localStorage`, key `codebounty-demo-v3`). A repository name or demo opt-in is not proof of ownership. The app does not fetch live repository or PR data, create GitHub issues, reserve funds, promise a payout, or transfer money. Example amounts are illustrative. Clearing browser storage resets the workspace.

## First intended project

Read-only verification found [pierce403/deanpierce.net](https://github.com/pierce403/deanpierce.net) as the GitHub source for `deanpierce.net`, with repository admin access for the authenticated `pierce403` account. This is **not** an in-app repository opt-in. The proposed blog-corrections bounty is an **unpublished, unfunded draft** with a proposed amount of **20 USDC**. Whether that means 20 USDC per accepted correction or 20 USDC total, and which network would be used, remain undecided. The draft has no payout destination, wallet connection, transfer, or payment commitment.

## Run locally

Use Node.js with the package versions in `package-lock.json`.

```sh
npm ci
npm run dev
```

Vite serves the interface at the address it prints, normally `http://127.0.0.1:5173`. To exercise the Cloudflare Worker locally, build the static assets first:

```sh
npm run build
npm run cloudflare:dev
```

The Worker serves the built interface and exposes `GET /api/meta`, which reports the demo mode and disabled integrations. It has no connected database, GitHub credentials, OAuth client, or payment provider.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run cloudflare:dry-run
```

The dry run validates Wrangler packaging only; it does not deploy the app or verify remote services. No Cloudflare deployment or domain change was performed for this prototype.

## What to try

1. Open the demo GitHub sign-in explanation. It does not establish a session or contact GitHub for authorization.
2. Search the fictional opted-in project directory, then browse and filter sample bounties on **Discover**. In production, only repositories whose authorized owners explicitly opt in will be discoverable.
3. In **Owner studio**, inspect the unpublished deanpierce.net pilot draft, or add a GitHub repository name or URL, set its demo participation state, and create a bounty with criteria, deadline, and optional suggested PR URL.
4. Run the fixed-sample blog-correction triage in **Review queue**. Its rule-based recommendation does not fetch or decide a real PR.
5. Open a discoverable bounty and submit a PR URL in the matching repository. The form checks URL shape and duplicate submissions in this browser; it does not check GitHub.
6. In **Review queue**, select or decline a submission. This records a local demo decision only.
7. In **Payout settings**, validate a public EVM address for an explicitly selected network, then try the masked display, temporary reveal, and clear controls.

The application runs as a Vite/React interface packaged with [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). The Worker currently provides only a small metadata endpoint; a production API, [D1 database](https://developers.cloudflare.com/d1/get-started/), and [GitHub App](https://docs.github.com/en/rest/apps/installations?apiVersion=2022-11-28) for real sign-in and repository access remain planned work requiring approval. The payout-address form validates user input locally with no RPC and keeps a saved address in this tab's `sessionStorage` (`codebounty-payout-session-v1`), masked by default with reveal and clear controls. The address is never sent to a server or stored in `localStorage`; there is no wallet connection or transfer. The fixed-sample, rule-based PR triage UI uses supplied metadata only; live GitHub triage remains planned. See the [product plan](docs/product-plan.md) for flows, data and trust boundaries, abuse controls, and decisions needed before launch.
