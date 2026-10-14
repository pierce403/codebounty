/** Structured, untrusted metadata from a GitHub pull request. */
export type BlogCorrectionPullRequest = {
  repository: string;
  number: number;
  title: string;
  body?: string;
  changedFiles: string[];
  additions: number;
  deletions: number;
  isDraft?: boolean;
  /** Deliberately ignored: patch text is untrusted and cannot instruct this triage helper. */
  untrustedDiffText?: string;
};

export type BlogCorrectionTriage = {
  recommendation: 'review' | 'needs_details' | 'unlikely_fit';
  relevance: 'likely' | 'unclear' | 'unlikely';
  qualitySignals: 'reviewable' | 'insufficient' | 'high_risk';
  reasons: string[];
  ownerChecks: string[];
  autoAcceptance: false;
  autoPayout: false;
};

export type BlogCorrectionTriageOptions = {
  repository: string;
  /** Explicit content directories or files from the owner's bounty criteria. No glob expansion. */
  blogPaths: readonly string[];
  contentExtensions?: readonly string[];
};

const OWNER_CHECKS = [
  'Read the actual PR diff on GitHub and verify the correction against a reliable source.',
  'Confirm the PR is open, targets the intended branch, and meets the published bounty criteria.',
  'Review the author, licensing, links, and any unrelated edits before making an owner decision.',
];

function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') &&
    !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function isBlogContent(path: string, options: BlogCorrectionTriageOptions): boolean {
  if (!safePath(path)) return false;
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  const allowedExtensions = options.contentExtensions ?? ['.md', '.mdx', '.html'];
  if (!allowedExtensions.includes(extension)) return false;
  return options.blogPaths.some((root) => {
    const normalizedRoot = root.replace(/\/$/, '');
    return safePath(normalizedRoot) && (path === normalizedRoot || path.startsWith(`${normalizedRoot}/`));
  });
}

/**
 * Demo-only, rule-based triage. It does not fetch GitHub data, run code, inspect patch text,
 * judge factual truth, accept a PR, or authorize a payout. Its recommendations are queues
 * for human review based on structured metadata and owner-supplied content paths.
 */
export function triageBlogCorrection(
  pr: BlogCorrectionPullRequest,
  options: BlogCorrectionTriageOptions,
): BlogCorrectionTriage {
  const reasons: string[] = [];
  const repositoryMatches = pr.repository.toLowerCase() === options.repository.toLowerCase();
  const eligibleFiles = pr.changedFiles.filter((path) => isBlogContent(path, options));
  const unrelatedFiles = pr.changedFiles.length - eligibleFiles.length;
  let relevance: BlogCorrectionTriage['relevance'];

  if (!repositoryMatches) {
    relevance = 'unlikely';
    reasons.push('The PR repository does not match the bounty repository.');
  } else if (pr.changedFiles.length === 0) {
    relevance = 'unclear';
    reasons.push('No changed-file metadata is available yet.');
  } else if (eligibleFiles.length === 0) {
    relevance = 'unlikely';
    reasons.push('No changed file is within the owner-listed blog content paths.');
  } else {
    relevance = 'likely';
    reasons.push(`${eligibleFiles.length} blog content ${eligibleFiles.length === 1 ? 'file is' : 'files are'} in scope.`);
  }

  if (unrelatedFiles > 0) reasons.push('The PR also touches files outside the listed blog content paths.');
  const hasDescription = (pr.body?.trim().length ?? 0) >= 30;
  const hasTitle = pr.title.trim().length >= 8;
  if (!hasDescription || !hasTitle) reasons.push('The PR title or description needs more detail for an owner to assess the correction.');
  if (pr.isDraft) reasons.push('The PR is marked as a draft.');

  const changeCount = pr.additions + pr.deletions;
  const validCounts = Number.isSafeInteger(pr.additions) && Number.isSafeInteger(pr.deletions) &&
    pr.additions >= 0 && pr.deletions >= 0;
  const broadChange = !validCounts || changeCount > 150 || pr.changedFiles.length > 6 || unrelatedFiles > 2;
  if (broadChange) reasons.push('The PR scope is broad or its change counts are unavailable; inspect for unrelated changes.');

  const qualitySignals: BlogCorrectionTriage['qualitySignals'] = broadChange
    ? 'high_risk'
    : !hasDescription || !hasTitle || pr.isDraft ? 'insufficient' : 'reviewable';
  const recommendation: BlogCorrectionTriage['recommendation'] = relevance === 'unlikely'
    ? 'unlikely_fit'
    : relevance === 'likely' && qualitySignals === 'reviewable' ? 'review' : 'needs_details';

  return {
    recommendation,
    relevance,
    qualitySignals,
    reasons,
    ownerChecks: [...OWNER_CHECKS],
    autoAcceptance: false,
    autoPayout: false,
  };
}
