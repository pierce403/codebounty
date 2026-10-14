import { describe, expect, it } from 'vitest';
import {
  addDemoSubmission,
  closeDemoBounty,
  isDemoRepositoryDiscoverable,
  parseGitHubPullRequest,
  parseGitHubRepository,
  reviewDemoSubmission,
  setDemoRepositoryParticipation,
  validateDemoSubmission,
} from './demo-model';
import type { DemoData, Submission } from './demo-model';

const makeData = (): DemoData => ({
  repositories: [{ id: 'repo-1', fullName: 'example/project', addedAt: '2026-10-01T00:00:00Z', participationStatus: 'opted_in', sample: true }],
  bounties: [{
    id: 'bounty-1', repositoryId: 'repo-1', title: 'Improve search', description: 'Demo',
    category: 'Frontend', rewardUsd: 250, criteria: ['Add keyboard support'],
    deadline: '2099-11-01', status: 'open', createdAt: '2026-10-01T00:00:00Z',
  }],
  submissions: [],
});

const submission = (id: string, number: number): Submission => ({
  id,
  bountyId: 'bounty-1',
  prUrl: `https://github.com/example/project/pull/${number}`,
  prNumber: number,
  displayName: 'Contributor',
  note: '',
  status: 'pending',
  submittedAt: '2026-10-14T00:00:00Z',
});

describe('GitHub URL parsing', () => {
  it('accepts a repository name or canonical HTTPS URL', () => {
    expect(parseGitHubRepository('example/project')).toBe('example/project');
    expect(parseGitHubRepository('https://github.com/example/project/')).toBe('example/project');
  });

  it('rejects lookalike hosts and unrelated URLs', () => {
    expect(parseGitHubRepository('https://github.com.evil.test/example/project')).toBeNull();
    expect(parseGitHubPullRequest('http://github.com/example/project/pull/2')).toBeNull();
    expect(parseGitHubPullRequest('https://github.com/example/project/issues/2')).toBeNull();
    expect(parseGitHubPullRequest('https://github.com/example/project/pull/0')).toBeNull();
  });

  it('normalizes PR URLs', () => {
    expect(parseGitHubPullRequest('https://github.com/example/project/pull/42/')).toEqual({
      repository: 'example/project', number: 42, url: 'https://github.com/example/project/pull/42',
    });
  });
});

describe('local demo transitions', () => {
  it('requires repository opt-in separately from bounty status', () => {
    const initial = makeData();
    expect(isDemoRepositoryDiscoverable(initial.repositories[0])).toBe(true);
    const withdrawn = setDemoRepositoryParticipation(initial, 'repo-1', 'withdrawn', '2026-10-14T00:00:00Z');
    expect(isDemoRepositoryDiscoverable(withdrawn.repositories[0])).toBe(false);
    expect(withdrawn.bounties[0]?.status).toBe('open');
    expect(validateDemoSubmission(withdrawn, 'bounty-1', submission('one', 1).prUrl, '2026-10-14')).toMatchObject({ ok: false });
    const returned = setDemoRepositoryParticipation(withdrawn, 'repo-1', 'opted_in', '2026-10-15T00:00:00Z');
    expect(isDemoRepositoryDiscoverable(returned.repositories[0])).toBe(true);
  });

  it('keeps the intended pilot draft out of discovery, submission, and review', () => {
    const pilot = makeData();
    pilot.repositories[0]!.pilot = true;
    pilot.repositories[0]!.participationStatus = 'not_opted_in';
    pilot.bounties[0]!.status = 'draft';
    pilot.bounties[0]!.draftUsdcAmount = 20;
    pilot.submissions = [submission('one', 1)];

    expect(setDemoRepositoryParticipation(pilot, 'repo-1', 'opted_in')).toBe(pilot);
    expect(isDemoRepositoryDiscoverable(pilot.repositories[0])).toBe(false);
    expect(validateDemoSubmission(pilot, 'bounty-1', submission('two', 2).prUrl)).toMatchObject({ ok: false });
    expect(reviewDemoSubmission(pilot, 'one', 'selected')).toBe(pilot);
  });

  it('checks repository match, duplicate PR, and deadline', () => {
    const initial = makeData();
    expect(validateDemoSubmission(initial, 'bounty-1', 'https://github.com/other/project/pull/1', '2026-10-14')).toMatchObject({ ok: false });
    const first = addDemoSubmission(initial, submission('one', 1));
    expect(first.bounties[0]?.status).toBe('in_review');
    expect(validateDemoSubmission(first, 'bounty-1', submission('duplicate', 1).prUrl, '2026-10-14')).toMatchObject({ ok: false });
    expect(validateDemoSubmission(initial, 'bounty-1', submission('late', 2).prUrl, '2099-11-02')).toMatchObject({ ok: false });
  });

  it('selects one PR and declines remaining pending submissions', () => {
    const initial = makeData();
    initial.submissions = [submission('one', 1), submission('two', 2)];
    initial.bounties[0]!.status = 'in_review';
    const reviewed = reviewDemoSubmission(initial, 'one', 'selected');
    expect(reviewed.bounties[0]?.status).toBe('selected');
    expect(reviewed.submissions.map((item) => item.status)).toEqual(['selected', 'declined']);
    expect(reviewDemoSubmission(reviewed, 'two', 'selected')).toEqual(reviewed);
  });

  it('closes a bounty and stops pending claims', () => {
    const initial = makeData();
    initial.submissions = [submission('one', 1)];
    const closed = closeDemoBounty(initial, 'bounty-1');
    expect(closed.bounties[0]?.status).toBe('closed');
    expect(closed.submissions[0]?.status).toBe('declined');
    expect(validateDemoSubmission(closed, 'bounty-1', submission('two', 2).prUrl, '2026-10-14')).toMatchObject({ ok: false });
  });
});
