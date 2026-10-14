export type BountyStatus = 'draft' | 'open' | 'in_review' | 'selected' | 'closed';
export type SubmissionStatus = 'pending' | 'selected' | 'declined';
export type Category = 'Frontend' | 'Infrastructure' | 'Documentation' | 'Developer tools';
export type RepositoryParticipation = 'not_opted_in' | 'opted_in' | 'withdrawn';

export type Repository = {
  id: string;
  fullName: string;
  addedAt: string;
  participationStatus: RepositoryParticipation;
  participationUpdatedAt?: string;
  sample?: boolean;
  pilot?: boolean;
};

export type Bounty = {
  id: string;
  repositoryId: string;
  title: string;
  description: string;
  category: Category;
  rewardUsd: number;
  /** Proposed amount for a private draft only; basis, chain, and terms remain unresolved. */
  draftUsdcAmount?: number;
  criteria: string[];
  deadline: string;
  targetPrUrl?: string;
  status: BountyStatus;
  createdAt: string;
};

export type Submission = {
  id: string;
  bountyId: string;
  prUrl: string;
  prNumber: number;
  displayName: string;
  note: string;
  status: SubmissionStatus;
  submittedAt: string;
  sample?: boolean;
};

export type DemoData = {
  repositories: Repository[];
  bounties: Bounty[];
  submissions: Submission[];
};

export type ParsedPullRequest = { repository: string; number: number; url: string };

/** Discovery is an explicit repository decision, separate from every bounty state. */
export function isDemoRepositoryDiscoverable(repository: Repository | undefined): boolean {
  return repository?.participationStatus === 'opted_in' && repository.pilot !== true;
}

/** Simulates opt-in/withdrawal locally; it does not verify owner identity or call GitHub. */
export function setDemoRepositoryParticipation(data: DemoData, id: string, status: 'opted_in' | 'withdrawn', updatedAt = new Date().toISOString()): DemoData {
  if (!data.repositories.some((repository) => repository.id === id && !repository.pilot)) return data;
  return {
    ...data,
    repositories: data.repositories.map((repository) => repository.id === id ? { ...repository, participationStatus: status, participationUpdatedAt: updatedAt } : repository),
  };
}

/** Parse a repository identifier only; this does not verify GitHub ownership or existence. */
export function parseGitHubRepository(value: string): string | null {
  const trimmed = value.trim();
  const simple = /^([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (simple) {
    const owner = simple[1];
    const name = simple[2]?.replace(/\.git$/, '');
    return owner && name && name !== '.' && name !== '..' ? `${owner}/${name}` : null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
    const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const owner = parts[0];
    const name = parts[1]?.replace(/\.git$/, '');
    if (parts.length !== 2 || !owner || !name || name === '.' || name === '..' || !/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null;
    return `${owner}/${name}`;
  } catch {
    return null;
  }
}

/** Parse a PR URL only; this does not fetch its state, author, or repository permissions. */
export function parseGitHubPullRequest(value: string): ParsedPullRequest | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
    const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const owner = parts[0];
    const name = parts[1];
    const prNumber = parts[3];
    if (parts.length !== 4 || !owner || !name || parts[2] !== 'pull' || !prNumber || !/^\d+$/.test(prNumber)) return null;
    if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..') return null;
    const number = Number(prNumber);
    if (!Number.isSafeInteger(number) || number < 1) return null;
    return { repository: `${owner}/${name}`, number, url: `https://github.com/${owner}/${name}/pull/${number}` };
  } catch {
    return null;
  }
}

/** Demo-only eligibility. Live eligibility also needs GitHub identity and PR API checks. */
export function validateDemoSubmission(data: DemoData, bountyId: string, prUrl: string, today = new Date().toISOString().slice(0, 10)):
  { ok: true; pr: ParsedPullRequest } | { ok: false; reason: string } {
  const bounty = data.bounties.find((item) => item.id === bountyId);
  if (!bounty) return { ok: false, reason: 'Bounty not found.' };
  if (bounty.status !== 'open' && bounty.status !== 'in_review') return { ok: false, reason: 'This bounty is no longer accepting submissions.' };
  if (bounty.deadline < today) return { ok: false, reason: 'The submission deadline has passed.' };
  const repository = data.repositories.find((item) => item.id === bounty.repositoryId);
  if (!repository) return { ok: false, reason: 'The bounty repository is missing.' };
  if (!isDemoRepositoryDiscoverable(repository)) return { ok: false, reason: 'This repository is not participating in demo discovery.' };
  const pr = parseGitHubPullRequest(prUrl);
  if (!pr) return { ok: false, reason: 'Enter an HTTPS github.com pull request URL.' };
  if (pr.repository.toLowerCase() !== repository.fullName.toLowerCase()) return { ok: false, reason: `That PR must belong to ${repository.fullName}.` };
  if (data.submissions.some((item) => item.bountyId === bountyId && item.prUrl.toLowerCase() === pr.url.toLowerCase())) return { ok: false, reason: 'This PR has already been submitted to this bounty.' };
  return { ok: true, pr };
}

/** Pure state update for the local prototype. It does not contact GitHub. */
export function addDemoSubmission(data: DemoData, submission: Submission): DemoData {
  const validation = validateDemoSubmission(data, submission.bountyId, submission.prUrl);
  if (!validation.ok) throw new Error(validation.reason);
  return {
    ...data,
    bounties: data.bounties.map((bounty) => bounty.id === submission.bountyId ? { ...bounty, status: 'in_review' } : bounty),
    submissions: [{ ...submission, prUrl: validation.pr.url, prNumber: validation.pr.number }, ...data.submissions],
  };
}

/** A selected PR closes the demo bounty and declines other pending entries. No award is funded. */
export function reviewDemoSubmission(data: DemoData, id: string, decision: 'selected' | 'declined'): DemoData {
  const target = data.submissions.find((submission) => submission.id === id);
  if (!target || target.status !== 'pending') return data;
  const bounty = data.bounties.find((item) => item.id === target.bountyId);
  if (!bounty || bounty.status === 'draft' || bounty.status === 'selected' || bounty.status === 'closed') return data;
  const submissions: Submission[] = data.submissions.map((submission) => {
    if (submission.id === id) return { ...submission, status: decision };
    if (decision === 'selected' && submission.bountyId === target.bountyId && submission.status === 'pending') return { ...submission, status: 'declined' };
    return submission;
  });
  const remaining = submissions.some((submission) => submission.bountyId === target.bountyId && submission.status === 'pending');
  const bounties: Bounty[] = data.bounties.map((item) => item.id === target.bountyId ? {
    ...item, status: decision === 'selected' ? 'selected' : remaining ? 'in_review' : item.deadline < new Date().toISOString().slice(0, 10) ? 'closed' : 'open',
  } : item);
  return { ...data, submissions, bounties };
}

/** Closing a bounty stops new local submissions and declines anything awaiting review. */
export function closeDemoBounty(data: DemoData, id: string): DemoData {
  return {
    ...data,
    bounties: data.bounties.map((bounty) => bounty.id === id && (bounty.status === 'open' || bounty.status === 'in_review') ? { ...bounty, status: 'closed' } : bounty),
    submissions: data.submissions.map((submission) => submission.bountyId === id && submission.status === 'pending' ? { ...submission, status: 'declined' } : submission),
  };
}
