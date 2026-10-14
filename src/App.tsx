import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { addDemoSubmission, closeDemoBounty, isDemoRepositoryDiscoverable, parseGitHubPullRequest, parseGitHubRepository, reviewDemoSubmission, setDemoRepositoryParticipation, validateDemoSubmission } from './demo-model';
import type { Bounty, BountyStatus, Category, DemoData, Repository, SubmissionStatus } from './demo-model';
import { maskPayoutAddress, PAYOUT_NETWORKS, validatePayoutAddress } from './payout-address';
import { triageBlogCorrection } from './triage';
import type { BlogCorrectionPullRequest, BlogCorrectionTriage } from './triage';

type View = 'discover' | 'owner' | 'reviews' | 'settings';

type Modal = 'repository' | 'bounty' | 'submit' | 'signin' | null;

const STORAGE_KEY = 'codebounty-demo-v3';
const CATEGORIES: Category[] = ['Frontend', 'Infrastructure', 'Documentation', 'Developer tools'];

function dateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createSeedData(): DemoData {
  const now = new Date().toISOString();
  return {
    repositories: [
      { id: 'repo-dean', fullName: 'pierce403/deanpierce.net', addedAt: now, participationStatus: 'not_opted_in', pilot: true },
      { id: 'repo-meridian', fullName: 'meridian-labs/compass', addedAt: now, participationStatus: 'opted_in', participationUpdatedAt: now, sample: true },
      { id: 'repo-pixel', fullName: 'pixel-forge/prism', addedAt: now, participationStatus: 'opted_in', participationUpdatedAt: now, sample: true },
      { id: 'repo-open', fullName: 'open-trail/waypoint', addedAt: now, participationStatus: 'opted_in', participationUpdatedAt: now, sample: true },
      { id: 'repo-tandem', fullName: 'tandem-studio/signal', addedAt: now, participationStatus: 'withdrawn', participationUpdatedAt: now, sample: true },
    ],
    bounties: [
      {
        id: 'bounty-blog-draft', repositoryId: 'repo-dean',
        title: 'Correct a typo or inaccuracy on deanpierce.net',
        description: 'Unpublished pilot draft for a focused correction to site documentation or a blog post. Link the exact claim or typo, explain the change, and keep the PR limited to the correction.',
        category: 'Documentation', rewardUsd: 0, draftUsdcAmount: 20,
        criteria: ['Change only relevant documentation or blog content', 'Identify the original typo or inaccurate claim and cite a source when correcting a fact', 'Keep the PR reviewable with a concise explanation of what changed'],
        deadline: '', status: 'draft', createdAt: now,
      },
      {
        id: 'bounty-search', repositoryId: 'repo-meridian',
        title: 'Make project search feel instant',
        description: 'Improve the search experience for large workspaces with clear loading states and useful keyboard controls.',
        category: 'Frontend', rewardUsd: 450,
        criteria: ['Search responds to keyboard input', 'Results remain accessible to screen readers', 'Includes tests for empty and loading states'],
        deadline: dateFromToday(28), status: 'open', createdAt: now,
      },
      {
        id: 'bounty-cache', repositoryId: 'repo-open',
        title: 'Cut cold start time for route previews',
        description: 'A focused performance improvement for the preview pipeline, with measurements before and after.',
        category: 'Infrastructure', rewardUsd: 800,
        criteria: ['Show a reproducible benchmark', 'Preserve current route behavior', 'Document the caching tradeoffs'],
        deadline: dateFromToday(36), status: 'in_review', createdAt: now,
      },
      {
        id: 'bounty-docs', repositoryId: 'repo-pixel',
        title: 'Create a first contribution guide',
        description: 'Help new contributors go from clone to first pull request without getting lost in setup.',
        category: 'Documentation', rewardUsd: 200,
        criteria: ['Document local setup from a clean machine', 'Add a small first issue walkthrough', 'Keep examples aligned with the current CLI'],
        deadline: dateFromToday(21), status: 'open', createdAt: now,
      },
      {
        id: 'bounty-cli', repositoryId: 'repo-meridian',
        title: 'Add a helpful dry run to the CLI',
        description: 'Let users preview config changes before applying them, with concise output they can trust.',
        category: 'Developer tools', rewardUsd: 350,
        criteria: ['No writes in dry run mode', 'Human readable change summary', 'Tests for missing config and invalid flags'],
        deadline: dateFromToday(42), status: 'open', createdAt: now,
      },
      {
        id: 'bounty-contrast', repositoryId: 'repo-tandem',
        title: 'Improve contrast in activity charts',
        description: 'Make chart legends and data labels easier to read across themes without changing the underlying metrics.',
        category: 'Frontend', rewardUsd: 300,
        criteria: ['Pass contrast checks in both themes', 'Keep every chart keyboard accessible', 'Include visual regression coverage'],
        deadline: dateFromToday(35), status: 'open', createdAt: now,
      },
    ],
    submissions: [
      {
        id: 'submission-sample-1', bountyId: 'bounty-cache',
        prUrl: 'https://github.com/open-trail/waypoint/pull/128', prNumber: 128,
        displayName: 'sam-builds', note: 'I included repeatable timing notes and a cache invalidation test.',
        status: 'pending', submittedAt: now, sample: true,
      },
      {
        id: 'submission-sample-2', bountyId: 'bounty-search',
        prUrl: 'https://github.com/meridian-labs/compass/pull/84', prNumber: 84,
        displayName: 'dev-maya', note: 'Keyboard navigation and live result announcements are included.',
        status: 'pending', submittedAt: now, sample: true,
      },
    ],
  };
}

function loadDemoData(): DemoData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' &&
          'repositories' in parsed && Array.isArray(parsed.repositories) &&
          'bounties' in parsed && Array.isArray(parsed.bounties) &&
          'submissions' in parsed && Array.isArray(parsed.submissions)) {
        return parsed as DemoData;
      }
    }
  } catch {
    // Private browsing or invalid old demo data should not prevent the page from opening.
  }
  return createSeedData();
}

function uid(): string {
  return crypto.randomUUID();
}

function money(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function rewardLabel(bounty: Bounty): string {
  return bounty.draftUsdcAmount === undefined ? money(bounty.rewardUsd) : `${bounty.draftUsdcAmount} USDC proposed`;
}

function deadlineLabel(bounty: Bounty): string {
  return bounty.deadline ? dateLabel(bounty.deadline) : 'Unresolved';
}

function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const paths: Record<string, ReactNode> = {
    arrow: <><path d="M4 12h16" /><path d="m13 5 7 7-7 7" /></>,
    arrowUp: <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="M5 5 19 19" /><path d="M19 5 5 19" /></>,
    code: <><path d="m8 8-4 4 4 4" /><path d="m16 8 4 4-4 4" /><path d="m14 5-4 14" /></>,
    coins: <><circle cx="12" cy="12" r="9" /><path d="M15.5 9.5c-.7-1-1.8-1.5-3.5-1.5-1.9 0-3 .8-3 2.2 0 3.3 6 1.3 6 4.5 0 1.4-1.2 2.3-3 2.3-1.6 0-2.8-.6-3.6-1.6M12 6v12" /></>,
    external: <><path d="M13 5h6v6" /><path d="m19 5-9 9" /><path d="M19 13v6H5V5h6" /></>,
    filter: <><path d="M4 7h16M7 12h10M10 17h4" /></>,
    github: <path d="M9 19c-4.5 1.3-4.5-2.5-6-3m12 6v-3.2c0-.9.1-1.3-.4-1.7 2.6-.3 5.4-1.3 5.4-6 0-1.3-.5-2.3-1.4-3.2.1-.3.6-1.6-.2-3.1 0 0-1.1-.4-3.4 1.3a12 12 0 0 0-6 0C6.7 4.4 5.6 4.8 5.6 4.8c-.8 1.5-.3 2.8-.2 3.1C4.5 8.8 4 9.8 4 11.1c0 4.7 2.8 5.7 5.4 6-.4.4-.4.9-.4 1.7V22" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    inbox: <><path d="M4 4h16v14H4z" /><path d="M4 14h5l2 3h2l2-3h5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    plus: <><path d="M12 4v16M4 12h16" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    spark: <path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1L12 2Z" />,
    stack: <><rect x="4" y="3" width="16" height="5" rx="1" /><rect x="4" y="10" width="16" height="5" rx="1" /><rect x="4" y="17" width="16" height="5" rx="1" /></>,
  };
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Logo() {
  return <span className="brand"><span className="brand-mark"><span /></span><span>codebounty<span className="brand-dot">.</span></span></span>;
}

function StatusBadge({ status }: { status: BountyStatus | SubmissionStatus }) {
  const label: Record<BountyStatus | SubmissionStatus, string> = {
    draft: 'Unpublished draft', open: 'Open', in_review: 'In review', selected: 'Selected', closed: 'Closed', pending: 'Awaiting review', declined: 'Declined',
  };
  return <span className={`status status-${status}`}><span className="status-dot" />{label[status]}</span>;
}

function ModalShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><p className="eyebrow">CODEBOUNTY DEMO</p><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div>
      {children}
    </div>
  </div>;
}

function App() {
  const [data, setData] = useState<DemoData>(loadDemoData);
  const [view, setView] = useState<View>('discover');
  const [modal, setModal] = useState<Modal>(null);
  const [selectedBountyId, setSelectedBountyId] = useState<string | null>(null);
  const [repositorySearch, setRepositorySearch] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [reviewFilter, setReviewFilter] = useState<'pending' | 'reviewed'>('pending');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* Demo still works without storage. */ }
  }, [data]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const repoById = useMemo(() => new Map(data.repositories.map((repo) => [repo.id, repo])), [data.repositories]);
  const participatingRepositories = data.repositories.filter(isDemoRepositoryDiscoverable);
  const visibleRepositories = participatingRepositories.filter((repo) => repo.fullName.toLowerCase().includes(repositorySearch.trim().toLowerCase()));
  const selectedBounty = data.bounties.find((bounty) => bounty.id === selectedBountyId) ?? null;
  const pendingCount = data.submissions.filter((submission) => submission.status === 'pending').length;
  const today = new Date().toISOString().slice(0, 10);
  const openCount = data.bounties.filter((bounty) => isDemoRepositoryDiscoverable(repoById.get(bounty.repositoryId)) && (bounty.status === 'open' || bounty.status === 'in_review') && bounty.deadline >= today).length;
  const openValue = data.bounties.filter((bounty) => isDemoRepositoryDiscoverable(repoById.get(bounty.repositoryId)) && (bounty.status === 'open' || bounty.status === 'in_review') && bounty.deadline >= today).reduce((sum, bounty) => sum + bounty.rewardUsd, 0);
  const visibleBounties = data.bounties.filter((bounty) => {
    const repo = repoById.get(bounty.repositoryId)?.fullName ?? '';
    const query = search.trim().toLowerCase();
    return isDemoRepositoryDiscoverable(repoById.get(bounty.repositoryId)) && (bounty.status === 'open' || bounty.status === 'in_review') && bounty.deadline >= today && (category === 'All' || bounty.category === category) && (!query || `${bounty.title} ${bounty.description} ${repo}`.toLowerCase().includes(query));
  });
  const visibleSubmissions = [...data.submissions]
    .filter((submission) => reviewFilter === 'pending' ? submission.status === 'pending' : submission.status !== 'pending')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  function showBounty(id: string) { setSelectedBountyId(id); }
  function selectView(next: View) { setView(next); setSelectedBountyId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeModal() { setModal(null); }

  function addRepository(fullName: string) {
    if (data.repositories.some((repo) => repo.fullName.toLowerCase() === fullName.toLowerCase())) {
      setToast('That repository is already in this demo workspace.'); return false;
    }
    setData((previous) => ({ ...previous, repositories: [...previous.repositories, { id: uid(), fullName, addedAt: new Date().toISOString(), participationStatus: 'not_opted_in' }] }));
    setToast('Repository added locally. It is not opted in, and ownership is unverified.');
    closeModal();
    return true;
  }

  function createBounty(bounty: Omit<Bounty, 'id' | 'createdAt' | 'status'>) {
    setData((previous) => ({ ...previous, bounties: [{ ...bounty, id: uid(), status: 'open', createdAt: new Date().toISOString() }, ...previous.bounties] }));
    setToast(isDemoRepositoryDiscoverable(repoById.get(bounty.repositoryId)) ? 'Demo bounty saved locally for a participating sample project. No funding occurred.' : 'Demo bounty saved locally. It stays out of discovery until a simulated opt-in.');
    closeModal(); selectView('owner');
  }

  function changeParticipation(repositoryId: string, status: 'opted_in' | 'withdrawn') {
    setData((previous) => setDemoRepositoryParticipation(previous, repositoryId, status));
    setToast(status === 'opted_in' ? 'Simulated opt-in saved locally. Ownership remains unverified.' : 'Simulated opt-in withdrawn. This repository is hidden from discovery.');
  }

  function createSubmission(input: { prUrl: string; prNumber: number; displayName: string; note: string }) {
    if (!selectedBounty) return;
    const bountyId = selectedBounty.id;
    setData((previous) => addDemoSubmission(previous, { ...input, id: uid(), bountyId, status: 'pending', submittedAt: new Date().toISOString() }));
    setToast('PR submitted to the local review queue. GitHub status was not checked.');
    closeModal(); setSelectedBountyId(null);
  }

  function reviewSubmission(id: string, decision: 'selected' | 'declined') {
    setData((previous) => reviewDemoSubmission(previous, id, decision));
    setToast(decision === 'selected' ? 'PR selected locally; other pending entries for this bounty were declined. No payment was created.' : 'Submission declined in this demo.');
  }

  function closeBounty(id: string) {
    setData((previous) => closeDemoBounty(previous, id));
    setToast('Demo bounty closed locally; pending submissions were declined.');
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-top"><Logo /><div className="workspace-label"><span className="workspace-avatar">D</span><span><strong>Demo workspace</strong><small>Local preview only</small></span><Icon name="chevron" size={16} /></div></div>
      <nav className="side-nav" aria-label="Main navigation">
        <span className="nav-caption">WORKSPACE</span>
        <button className={view === 'discover' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('discover')}><Icon name="grid" size={18} /> Discover bounties</button>
        <button className={view === 'owner' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('owner')}><Icon name="stack" size={18} /> Owner studio</button>
        <button className={view === 'reviews' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('reviews')}><Icon name="inbox" size={18} /> Review queue <span className="nav-count">{pendingCount}</span></button>
        <button className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => selectView('settings')}><Icon name="coins" size={18} /> Payout settings</button>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-symbol"><Icon name="spark" size={19} /></span><strong>Built for better PRs.</strong><p>A preview of how maintainers and contributors could recognize meaningful work.</p><button onClick={() => selectView('owner')}>Explore the owner flow <Icon name="arrow" size={15} /></button></div><div className="sidebar-foot">PROTOTYPE • NO LIVE INTEGRATIONS</div></div>
    </aside>

    <div className="main-column">
      <header className="topbar"><div className="mobile-brand"><Logo /></div><div className="topbar-location"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{view === 'discover' ? 'Discover' : view === 'owner' ? 'Owner studio' : view === 'reviews' ? 'Review queue' : 'Payout settings'}</strong></div><div className="topbar-actions"><span className="demo-chip"><span /> DEMO MODE</span><button className="github-signin" aria-label="GitHub sign-in details (not enabled)" onClick={() => setModal('signin')}><Icon name="github" size={16} /><span>Sign in with GitHub</span><small>Not enabled</small></button><button className="button button-dark button-sm" onClick={() => setModal('bounty')}><Icon name="plus" size={17} /> Create bounty</button></div></header>
      <main>
        <div className="demo-banner"><Icon name="info" size={18} /><span><strong>Interactive prototype.</strong> GitHub sign-in is unavailable. Every participating project shown is fictional demo data; local opt-ins, ownership, PRs, and rewards are unverified. No money moves.</span></div>
        {view === 'discover' && <>
          <section className="hero"><div className="hero-copy"><div className="hero-kicker"><span className="pulse-dot" /> FIND YOUR NEXT MEANINGFUL PR</div><h1>Discover projects that <em>welcome good work.</em></h1><p>Browse opted-in project examples, find a focused bounty, and share the PR you shipped. GitHub sign-in will be the gateway when live access is approved.</p><div className="hero-actions"><button className="button button-lime" onClick={() => setModal('signin')}><Icon name="github" size={18} /> Sign in with GitHub <Icon name="arrow" size={17} /></button><button className="button button-ghost" onClick={() => document.getElementById('participating-projects')?.scrollIntoView({ behavior: 'smooth' })}>Browse demo projects <Icon name="arrow" size={16} /></button></div><span className="hero-auth-note">Sign-in is not configured. Browsing this fictional demo needs no account.</span></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-code">&lt;PR<span>#128</span>&gt;</div><div className="hero-spark hero-spark-a">✦</div><div className="hero-spark hero-spark-b">✳</div><div className="hero-art-label"><span className="hero-art-dot" /> MERGE GOOD WORK</div></div></section>
          <div className="metrics-row"><div className="metric"><strong>{participatingRepositories.length.toString().padStart(2, '0')}</strong><span>Fictional opted-in projects</span></div><div className="metric"><strong>{openCount.toString().padStart(2, '0')}</strong><span>Demo opportunities</span></div><div className="metric"><strong>{money(openValue)}</strong><span>Illustrative amounts</span></div><div className="metrics-note"><Icon name="shield" size={21} /><span>Opt-ins and reward amounts here are examples. No owner is verified and no funds are committed.</span></div></div>
          <section id="participating-projects" className="content-section project-discovery"><div className="section-heading"><div><p className="eyebrow">PROJECT DISCOVERY</p><h2>Explore participating projects.</h2><p>Only repositories with a simulated opt-in appear here. These names and opt-ins are fictional examples.</p></div><div className="result-count">{participatingRepositories.length} demo opted in</div></div><div className="repository-search"><Icon name="search" size={19} /><input aria-label="Search participating repositories" placeholder="Search participating repositories" value={repositorySearch} onChange={(event) => setRepositorySearch(event.target.value)} /><span>DEMO ONLY</span></div><div className="discovery-grid">{visibleRepositories.map((repo) => <button className="discovery-card" key={repo.id} onClick={() => { setSearch(repo.fullName); document.getElementById('opportunities')?.scrollIntoView({ behavior: 'smooth' }); }}><div className="discovery-card-top"><span className="repo-icon"><Icon name="github" size={22} /></span><Icon name="arrowUp" size={17} /></div><strong>{repo.fullName}</strong><span className="discovery-tag">Fictional demo opt-in</span><div className="discovery-card-bottom"><span>{data.bounties.filter((bounty) => bounty.repositoryId === repo.id && (bounty.status === 'open' || bounty.status === 'in_review') && bounty.deadline >= today).length} open demo bounties</span><span>View opportunities <Icon name="arrow" size={14} /></span></div></button>)}</div>{visibleRepositories.length === 0 && <div className="empty-state"><Icon name="search" size={28} /><h3>No participating projects found</h3><p>Try another repository search. Withdrawn projects stay hidden from discovery.</p><button className="button button-outline" onClick={() => setRepositorySearch('')}>Clear search</button></div>}</section>
          <section id="opportunities" className="content-section"><div className="section-heading"><div><p className="eyebrow">OPTED-IN PROJECT BOUNTIES</p><h2>Find your next meaningful PR.</h2><p>Only bounties in participating demo repositories appear here.</p></div><div className="result-count">{visibleBounties.length} {visibleBounties.length === 1 ? 'opportunity' : 'opportunities'}</div></div>
            <div className="filter-bar"><div className="search-box"><Icon name="search" size={19} /><input aria-label="Search bounties" placeholder="Search by bounty or repository" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="filter-label"><Icon name="filter" size={17} /> Filter</div><div className="category-tabs" role="group" aria-label="Filter by category">{(['All', ...CATEGORIES] as const).map((item) => <button key={item} className={category === item ? 'category-tab selected' : 'category-tab'} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
            <div className="bounty-grid">{visibleBounties.map((bounty) => <BountyCard key={bounty.id} bounty={bounty} repository={repoById.get(bounty.repositoryId)?.fullName ?? 'Unknown repo'} submissionCount={data.submissions.filter((submission) => submission.bountyId === bounty.id).length} onOpen={() => showBounty(bounty.id)} />)}</div>
            {visibleBounties.length === 0 && <div className="empty-state"><Icon name="search" size={28} /><h3>No bounties found</h3><p>Try another search or category.</p><button className="button button-outline" onClick={() => { setSearch(''); setCategory('All'); }}>Clear filters</button></div>}
          </section>
          <section className="flow-panel"><div><p className="eyebrow">HOW IT COULD WORK</p><h2>From idea to recognized contribution.</h2></div><div className="flow-steps"><div><span>01</span><strong>Owner posts a bounty</strong><p>Scope the improvement, criteria, deadline, and example reward.</p></div><div><span>02</span><strong>Contributor shares a PR</strong><p>Submit an existing pull request in the matching repository.</p></div><div><span>03</span><strong>Owner reviews the work</strong><p>Assess the PR against criteria and select a submission.</p></div></div></section>
        </>}

        {view === 'owner' && <>
          <div className="page-heading"><div><p className="eyebrow">MAINTAINER WORKSPACE</p><h1>Turn project priorities into <em>clear opportunities.</em></h1><p>Identify a repository, separately opt it into discovery, describe the PR you want to see, and review submissions.</p></div><button className="button button-lime" onClick={() => setModal('bounty')}><Icon name="plus" size={18} /> New bounty</button></div>
          <section className="pilot-spotlight"><div><p className="eyebrow">FIRST INTENDED PILOT · LOCAL DRAFT</p><h2>deanpierce.net blog corrections</h2><p>A focused documentation or blog correction PR could be recognized with a proposed <strong>20 USDC</strong> amount. This draft is unpublished, unfunded, and unavailable to contributors.</p><div className="pilot-pills"><span>Not opted in</span><span>No live GitHub sign-in</span><span>No payout enabled</span></div><p className="pilot-evidence">Read-only GitHub review confirmed that <strong>pierce403</strong> has admin permission on the <a href="https://github.com/pierce403/deanpierce.net" target="_blank" rel="noopener noreferrer">site’s backing repository <Icon name="external" size={12} /></a>. That external check does not grant or verify authority inside Codebounty.</p></div><aside><strong>Before any publication</strong><ul><li>Decide whether 20 USDC is per accepted correction or a total pool</li><li>Choose the chain and payout terms</li><li>Set a deadline and final acceptance policy</li></ul><button className="button button-outline" onClick={() => showBounty('bounty-blog-draft')}>Inspect local draft <Icon name="arrow" size={16} /></button></aside></section>
          <div className="owner-note"><Icon name="shield" size={24} /><div><strong>GitHub sign-in and ownership checks are not enabled</strong><p>You can simulate opt-in and withdrawal below, but this browser cannot establish who owns a repository. Production participation requires sign-in, a GitHub App installation, and a repository permission check.</p></div><button className="button button-outline" onClick={() => setModal('signin')}><Icon name="github" size={16} /> Sign-in details</button></div>
          <section className="content-section owner-section"><div className="section-heading compact"><div><p className="eyebrow">PROJECT PARTICIPATION</p><h2>Repositories</h2><p>Adding a name and opting into discovery are separate local demo actions.</p></div><button className="button button-outline" onClick={() => setModal('repository')}><Icon name="plus" size={17} /> Add repository</button></div><div className="repository-grid">{data.repositories.map((repo) => <div className={repo.pilot ? 'repo-card repo-card-pilot' : 'repo-card'} key={repo.id}><div className="repo-card-header"><div className="repo-icon"><Icon name="github" size={23} /></div><div className="repo-card-main"><strong>{repo.fullName}</strong><span>{data.bounties.filter((bounty) => bounty.repositoryId === repo.id).length} demo bounties</span></div></div><div className="repo-participation"><span className={repo.participationStatus === 'opted_in' && !repo.pilot ? 'participation-badge participating' : 'participation-badge'}>{repo.pilot ? 'Pilot · not opted in' : repo.participationStatus === 'opted_in' ? 'Demo opted in' : repo.participationStatus === 'withdrawn' ? 'Demo withdrawn' : 'Not opted in'}</span><span className="unverified-badge">No in-app authority</span></div><p>{repo.pilot ? 'External read-only admin check only. In-app owner permission and participation are unverified.' : `${repo.sample ? 'Fictional sample project. ' : ''}Participation is simulated in this browser only.`}</p>{repo.pilot ? <div className="repo-action-static"><Icon name="shield" size={15} /> Requires approved live GitHub sign-in</div> : <button className={repo.participationStatus === 'opted_in' ? 'repo-action withdraw' : 'repo-action'} onClick={() => changeParticipation(repo.id, repo.participationStatus === 'opted_in' ? 'withdrawn' : 'opted_in')}>{repo.participationStatus === 'opted_in' ? 'Withdraw demo opt-in' : 'Simulate opt-in'} <Icon name="arrow" size={15} /></button>}</div>)}</div></section>
          <section className="content-section owner-section"><div className="section-heading compact"><div><p className="eyebrow">BOUNTY DESK</p><h2>Your bounties</h2></div><span className="result-count">{data.bounties.length} total</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Bounty</th><th>Repository</th><th>Proposed amount</th><th>Deadline</th><th>Bounty state</th><th>Discovery</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.bounties.map((bounty) => <tr key={bounty.id}><td><button className="table-title" onClick={() => showBounty(bounty.id)}>{bounty.title}</button><small>{bounty.category}{bounty.status === 'draft' ? ' · unpublished and unfunded' : ''}</small></td><td className="mono-cell">{repoById.get(bounty.repositoryId)?.fullName ?? 'Unknown'}</td><td className="money-cell">{rewardLabel(bounty)}</td><td>{deadlineLabel(bounty)}</td><td><StatusBadge status={bounty.status} /></td><td><span className={bounty.status !== 'draft' && isDemoRepositoryDiscoverable(repoById.get(bounty.repositoryId)) ? 'discovery-state visible' : 'discovery-state'}>{bounty.status !== 'draft' && isDemoRepositoryDiscoverable(repoById.get(bounty.repositoryId)) ? 'Visible demo' : 'Hidden'}</span></td><td>{bounty.status === 'open' || bounty.status === 'in_review' ? <button className="text-action" onClick={() => closeBounty(bounty.id)}>Close</button> : <span className="muted-cell">—</span>}</td></tr>)}</tbody></table></div></section>
          <div className="owner-footer"><div><Icon name="info" size={20} /><span>Demo entries live in this browser only. They are not GitHub issues, funded offers, or payment commitments.</span></div><button onClick={() => selectView('reviews')}>Go to review queue <Icon name="arrow" size={17} /></button></div>
        </>}

        {view === 'reviews' && <>
          <div className="page-heading review-heading"><div><p className="eyebrow">SUBMISSION INBOX</p><h1>Review work with <em>the criteria in view.</em></h1><p>Compare pull requests against the posted criteria and record a demo decision.</p></div><div className="review-total"><span>{pendingCount}</span><small>Awaiting review</small></div></div>
          <BlogTriageDemo />
          <div className="review-warning"><Icon name="info" size={19} /><span>PR contents, author identity, merge status, and repository permissions are not fetched or verified. “Select” records a local demo decision only.</span></div>
          <div className="review-tabs"><button className={reviewFilter === 'pending' ? 'active' : ''} onClick={() => setReviewFilter('pending')}>Awaiting review <span>{pendingCount}</span></button><button className={reviewFilter === 'reviewed' ? 'active' : ''} onClick={() => setReviewFilter('reviewed')}>Reviewed <span>{data.submissions.length - pendingCount}</span></button></div>
          <div className="review-list">{visibleSubmissions.map((submission) => {
            const bounty = data.bounties.find((item) => item.id === submission.bountyId);
            const repository = bounty ? repoById.get(bounty.repositoryId)?.fullName : undefined;
            if (!bounty) return null;
            return <article className="review-card" key={submission.id}><div className="review-main"><div className="review-topline"><span className="review-pr"><Icon name="code" size={17} /> Pull request #{submission.prNumber}</span>{submission.sample && <span className="sample-pill">SAMPLE DATA</span>}<StatusBadge status={submission.status} /></div><h2>{bounty.title}</h2><div className="review-meta"><span><Icon name="github" size={15} /> {repository}</span><span>Submitted by {submission.displayName}</span></div><p className="review-note">“{submission.note || 'No note added.'}”</p><div className="review-url">{submission.sample ? <span>{submission.prUrl} · illustrative URL</span> : <a href={submission.prUrl} target="_blank" rel="noopener noreferrer">Open entered PR URL <Icon name="external" size={14} /></a>}</div></div><div className="review-side"><span className="review-side-label">ACCEPTANCE CRITERIA</span><ul>{bounty.criteria.map((criterion) => <li key={criterion}><Icon name="check" size={15} /> {criterion}</li>)}</ul><div className="review-side-footer"><span>Example amount <strong>{money(bounty.rewardUsd)}</strong></span>{submission.status === 'pending' && <div className="review-buttons"><button className="button button-outline" onClick={() => reviewSubmission(submission.id, 'declined')}>Decline</button><button className="button button-dark" onClick={() => reviewSubmission(submission.id, 'selected')}>Select PR <Icon name="arrow" size={16} /></button></div>}</div></div></article>;
          })}</div>
          {visibleSubmissions.length === 0 && <div className="empty-state review-empty"><Icon name="inbox" size={30} /><h3>{reviewFilter === 'pending' ? 'All caught up' : 'No reviewed submissions yet'}</h3><p>{reviewFilter === 'pending' ? 'Submitted pull requests will appear here.' : 'Decisions you make in this demo will appear here.'}</p></div>}
        </>}
        {view === 'settings' && <PayoutSettings />}
        <footer className="site-footer"><span><Logo /></span><p>A local product prototype for rewarding useful open source work.</p><span>DEMO ONLY · © {new Date().getFullYear()} CODEBOUNTY</span></footer>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === 'discover' ? 'active' : ''} onClick={() => selectView('discover')}><Icon name="grid" size={19} /><span>Discover</span></button><button className={view === 'owner' ? 'active' : ''} onClick={() => selectView('owner')}><Icon name="stack" size={19} /><span>Owner</span></button><button className={view === 'reviews' ? 'active' : ''} onClick={() => selectView('reviews')}><Icon name="inbox" size={19} /><span>Reviews</span></button><button className={view === 'settings' ? 'active' : ''} onClick={() => selectView('settings')}><Icon name="coins" size={19} /><span>Settings</span></button></nav>
    </div>

    {selectedBounty && modal === null && <BountyDetails bounty={selectedBounty} repository={repoById.get(selectedBounty.repositoryId)?.fullName ?? 'Unknown repository'} participating={isDemoRepositoryDiscoverable(repoById.get(selectedBounty.repositoryId))} submissionCount={data.submissions.filter((submission) => submission.bountyId === selectedBounty.id).length} onClose={() => setSelectedBountyId(null)} onSubmit={() => setModal('submit')} />}
    {modal === 'signin' && <SignInDemo onClose={closeModal} />}
    {modal === 'repository' && <RepositoryForm onClose={closeModal} onSubmit={addRepository} />}
    {modal === 'bounty' && <BountyForm repositories={data.repositories} onClose={closeModal} onSubmit={createBounty} onAddRepository={() => { setModal('repository'); }} />}
    {modal === 'submit' && selectedBounty && <SubmissionForm bounty={selectedBounty} repository={repoById.get(selectedBounty.repositoryId)?.fullName ?? ''} data={data} onClose={closeModal} onSubmit={createSubmission} />}
    {toast && <div className="toast" role="status"><Icon name="check" size={18} /> {toast}<button onClick={() => setToast(null)} aria-label="Dismiss notice"><Icon name="close" size={15} /></button></div>}
  </div>;
}

function BountyCard({ bounty, repository, submissionCount, onOpen }: { bounty: Bounty; repository: string; submissionCount: number; onOpen: () => void }) {
  return <button className="bounty-card" onClick={onOpen}><div className="card-top"><span className="card-category"><span className={`category-icon category-${bounty.category.toLowerCase().replace(/\s/g, '-')}`}><Icon name={bounty.category === 'Documentation' ? 'stack' : bounty.category === 'Infrastructure' ? 'shield' : 'code'} size={17} /></span>{bounty.category}</span><span className="card-arrow"><Icon name="arrowUp" size={18} /></span></div><div className="card-repo"><Icon name="github" size={16} /> {repository}</div><h3>{bounty.title}</h3><p>{bounty.description}</p><div className="card-detail"><span><Icon name="clock" size={16} /> Due {dateLabel(bounty.deadline)}</span><span>{submissionCount} {submissionCount === 1 ? 'PR' : 'PRs'} submitted</span></div><div className="card-bottom"><span><small>EXAMPLE REWARD</small><strong>{money(bounty.rewardUsd)}</strong></span><span className="card-cta">View bounty <Icon name="arrow" size={16} /></span></div></button>;
}

function BountyDetails({ bounty, repository, participating, submissionCount, onClose, onSubmit }: { bounty: Bounty; repository: string; participating: boolean; submissionCount: number; onClose: () => void; onSubmit: () => void }) {
  const active = participating && (bounty.status === 'open' || bounty.status === 'in_review') && bounty.deadline >= new Date().toISOString().slice(0, 10);
  return <ModalShell title={bounty.title} subtitle={bounty.status === 'draft' ? 'Unpublished pilot draft. No submissions or funding are enabled.' : 'Review the scope and criteria before submitting an existing PR.'} onClose={onClose} wide><div className="detail-layout"><div className="detail-main"><div className="detail-tags"><StatusBadge status={bounty.status} /><span>{bounty.category}</span><span><Icon name="github" size={15} /> {repository}</span><span>{participating ? 'Demo opted in' : 'Hidden from discovery'}</span></div><h3>What needs to change</h3><p>{bounty.description}</p>{bounty.targetPrUrl && <div className="target-pr"><strong>Suggested PR</strong><span>{bounty.targetPrUrl}</span></div>}<h3>Acceptance criteria</h3><ul className="criteria-list">{bounty.criteria.map((criterion) => <li key={criterion}><span><Icon name="check" size={15} /></span>{criterion}</li>)}</ul>{bounty.status === 'draft' && <div className="draft-terms"><strong>Terms still to decide</strong><span>Is 20 USDC per accepted correction or a total pool? Which network, deadline, and payout conditions apply?</span></div>}<div className="detail-caveat"><Icon name="info" size={18} /><span>{bounty.status === 'draft' ? 'An external read-only GitHub check found admin access to the backing repository. Codebounty has no signed-in identity or live owner authorization.' : 'Eligibility checks are manual in this prototype. A production version would verify repository participation, author, PR state, and timing with GitHub before owner review.'}</span></div></div><aside className="detail-aside"><span className="aside-label">{bounty.status === 'draft' ? 'PROPOSED · UNFUNDED' : 'EXAMPLE REWARD'}</span><strong className="aside-amount">{rewardLabel(bounty)}</strong><p>{bounty.status === 'draft' ? 'Amount basis, chain, and payout terms are unresolved. No offer has been published.' : 'Illustrative amount only. This demo cannot fund or pay a bounty.'}</p><div className="detail-stat"><span>Deadline</span><strong>{deadlineLabel(bounty)}</strong></div><div className="detail-stat"><span>PRs submitted</span><strong>{submissionCount}</strong></div><button className="button button-lime button-full" disabled={!active} onClick={onSubmit}>Submit an existing PR <Icon name="arrow" size={17} /></button><small>{active ? 'You will enter a GitHub PR URL. No GitHub data is fetched.' : bounty.status === 'draft' ? 'This unpublished draft cannot receive submissions.' : !participating ? 'This repository has no active demo opt-in.' : 'This bounty is no longer accepting submissions.'}</small></aside></div></ModalShell>;
}

function SignInDemo({ onClose }: { onClose: () => void }) {
  return <ModalShell title="GitHub sign-in is not enabled" subtitle="This preview cannot connect an account or verify a project owner." onClose={onClose}><div className="signin-content"><div className="signin-hero"><Icon name="github" size={27} /><div><strong>No GitHub account is connected</strong><p>Clicking sign-in here opens this explanation only. No OAuth redirect, permission grant, or identity claim occurs.</p></div></div><p className="signin-heading">Planned live flow</p><ol><li>Sign in with GitHub after OAuth setup is approved.</li><li>Install the GitHub App on a chosen repository and verify owner or maintainer permission.</li><li>Explicitly opt that repository into public discovery, with a withdrawal control.</li></ol><div className="form-tip"><Icon name="shield" size={18} /><span>Every visible repository is fictional demo data. You can browse and simulate participation locally without signing in.</span></div><button className="button button-dark button-full" onClick={onClose}>Continue with demo <Icon name="arrow" size={16} /></button></div></ModalShell>;
}

type SavedPayoutAddress = { chainId: number; address: string };
const PAYOUT_SESSION_KEY = 'codebounty-payout-session-v1';

function loadPayoutSession(): SavedPayoutAddress | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(PAYOUT_SESSION_KEY) ?? 'null');
    if (!value || typeof value !== 'object' || !('address' in value) || !('chainId' in value) || typeof value.address !== 'string' || typeof value.chainId !== 'number') return null;
    const result = validatePayoutAddress(value.address, value.chainId);
    return result.ok ? { address: result.address, chainId: result.chainId } : null;
  } catch { return null; }
}

function PayoutSettings() {
  const [saved, setSaved] = useState<SavedPayoutAddress | null>(loadPayoutSession);
  const [networkChoice, setNetworkChoice] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const savedNetwork = PAYOUT_NETWORKS.find((network) => network.chainId === saved?.chainId);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const chainId = Number(networkChoice);
    const result = validatePayoutAddress(addressInput, chainId);
    if (!result.ok) { setError(result.reason); return; }
    const next = { chainId: result.chainId, address: result.address };
    try { sessionStorage.setItem(PAYOUT_SESSION_KEY, JSON.stringify(next)); }
    catch { setError('This browser blocked session storage, so the address was not saved.'); return; }
    setSaved(next); setAddressInput(''); setNetworkChoice(''); setShowInput(false); setShowSaved(false);
    setNotice('Saved for this browser tab session only. No wallet, GitHub, or server received it.');
  }

  function clear() {
    try { sessionStorage.removeItem(PAYOUT_SESSION_KEY); } catch { /* React state still clears. */ }
    setSaved(null); setAddressInput(''); setNetworkChoice(''); setShowInput(false); setShowSaved(false); setError('');
    setNotice('Session-only payout address cleared from this tab.');
  }

  return <><div className="page-heading settings-heading"><div><p className="eyebrow">CONTRIBUTOR SETTINGS · LOCAL DEMO</p><h1>Keep a future payout destination <em>under your control.</em></h1><p>Preview a chain-aware public address setting. This is not a wallet connection, payout request, or proof of ownership.</p></div></div><div className="settings-layout"><section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><Icon name="coins" size={23} /></span><div><h2>Receiving address</h2><p>Choose a network explicitly, then enter a public EVM address.</p></div></div>{saved && <div className="saved-address"><span className="eyebrow">SAVED FOR THIS TAB SESSION</span><div><strong>{savedNetwork?.name ?? 'Selected network'}</strong><span className="saved-value">{showSaved ? saved.address : maskPayoutAddress(saved.address)}</span></div><div className="saved-actions"><button type="button" onClick={() => setShowSaved((shown) => !shown)}>{showSaved ? 'Hide full address' : 'Reveal temporarily'}</button><button type="button" onClick={clear}>Clear address</button></div></div>}<form onSubmit={save} className="modal-form payout-form"><label>Network <small>Required; nothing is preselected</small><select value={networkChoice} onChange={(event) => { setNetworkChoice(event.target.value); setError(''); }}><option value="">Select an EVM network</option>{PAYOUT_NETWORKS.map((network) => <option value={network.chainId} key={network.chainId}>{network.name} · chain ID {network.chainId}</option>)}</select></label><label>Public receiving address <small>Never enter a private key or seed phrase</small><div className="address-input"><input type={showInput ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={addressInput} onChange={(event) => { setAddressInput(event.target.value); setError(''); }} placeholder="0x…" /><button type="button" onClick={() => setShowInput((shown) => !shown)}>{showInput ? 'Hide' : 'Show'}</button></div></label>{error && <p className="field-error" role="alert">{error}</p>}{notice && <p className="field-success" role="status">{notice}</p>}<button className="button button-dark" type="submit">Save for this session <Icon name="arrow" size={16} /></button></form></section><aside className="settings-explain"><p className="eyebrow">PRIVACY & LIMITS</p><h2>Visible to you in this tab.</h2><ul><li><Icon name="check" size={16} /> Saved in this tab’s session storage only; closing the tab ends the session.</li><li><Icon name="check" size={16} /> Masked by default, with a deliberate reveal and clear control.</li><li><Icon name="check" size={16} /> Never added to a PR, repository card, GitHub profile, or server request.</li></ul><div className="settings-caveat"><Icon name="info" size={18} /><span>Address validation checks format and checksum only. It cannot prove wallet control or USDC support. No network has been chosen for the 20 USDC pilot draft, and no transfer is possible here.</span></div></aside></div></>;
}

const BLOG_TRIAGE_SAMPLE: BlogCorrectionPullRequest = {
  repository: 'pierce403/deanpierce.net', number: 42,
  title: 'docs: correct a date in a blog post',
  body: 'A publication date in the example post appears inconsistent with the cited source. This small PR updates the sentence and includes the source link for owner review.',
  changedFiles: ['docs/blog/example-post.md'], additions: 2, deletions: 2, isDraft: false,
};

function BlogTriageDemo() {
  const [result, setResult] = useState<BlogCorrectionTriage | null>(null);
  const recommendation = result?.recommendation === 'review' ? 'Worth owner review' : result?.recommendation === 'needs_details' ? 'Needs more details' : 'Unlikely fit';
  return <section className="triage-demo"><div className="triage-top"><div><p className="eyebrow">SAFE AUTOMATED TRIAGE · FIXED SAMPLE</p><h2>Preview a blog correction PR.</h2><p>Illustrative PR #{BLOG_TRIAGE_SAMPLE.number} in {BLOG_TRIAGE_SAMPLE.repository}. No real PR was fetched and this is not a submission to the unpublished pilot.</p></div><span className="sample-pill">SAMPLE METADATA</span></div><div className="triage-sample"><div><strong>{BLOG_TRIAGE_SAMPLE.title}</strong><span>{BLOG_TRIAGE_SAMPLE.changedFiles[0]} · +{BLOG_TRIAGE_SAMPLE.additions} / −{BLOG_TRIAGE_SAMPLE.deletions} lines</span></div><p>Illustrative diff summary: a date in a blog sentence is corrected and a source is cited. The rule-based triage does not inspect patch text or verify the factual claim.</p></div><button className="button button-dark" onClick={() => setResult(triageBlogCorrection(BLOG_TRIAGE_SAMPLE, { repository: 'pierce403/deanpierce.net', blogPaths: ['docs/blog'] }))}>Run demo triage <Icon name="arrow" size={16} /></button>{result && <div className="triage-result" role="status"><div className="triage-result-heading"><span>Recommendation</span><strong>{recommendation}</strong></div><p>Based on repository, changed-file paths, PR description, and change size only. This is a review aid, not a decision.</p><div className="triage-result-columns"><div><strong>Why it surfaced</strong><ul>{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><div><strong>Owner must check</strong><ul>{result.ownerChecks.map((check) => <li key={check}>{check}</li>)}</ul></div></div><div className="triage-no-action">No automatic acceptance. No payout, code execution, or GitHub change.</div></div>}</section>;
}

function RepositoryForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (fullName: string) => boolean }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseGitHubRepository(input);
    if (!parsed) { setError('Enter an owner/repository name or an HTTPS github.com repository URL.'); return; }
    onSubmit(parsed);
  }
  return <ModalShell title="Add a repository" subtitle="Identify a GitHub project for this local demo workspace." onClose={onClose}><form onSubmit={submit} className="modal-form"><label>Repository name or URL<input autoFocus value={input} onChange={(event) => { setInput(event.target.value); setError(''); }} placeholder="owner/repository or https://github.com/owner/repository" /></label>{error && <p className="field-error">{error}</p>}<div className="form-tip"><Icon name="shield" size={18} /><span>Adding a name does not connect to GitHub, prove ownership, or opt this repository into discovery. Opt-in is a separate local demo action.</span></div><div className="form-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark">Add to demo <Icon name="arrow" size={16} /></button></div></form></ModalShell>;
}

function BountyForm({ repositories, onClose, onSubmit, onAddRepository }: { repositories: Repository[]; onClose: () => void; onSubmit: (bounty: Omit<Bounty, 'id' | 'createdAt' | 'status'>) => void; onAddRepository: () => void }) {
  const availableRepositories = repositories.filter((repo) => !repo.pilot);
  const [repositoryId, setRepositoryId] = useState(availableRepositories[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('Frontend');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState(dateFromToday(30));
  const [criteria, setCriteria] = useState('');
  const [targetPrUrl, setTargetPrUrl] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = criteria.split('\n').map((line) => line.trim()).filter(Boolean);
    const parsedAmount = Number(amount);
    const repo = availableRepositories.find((item) => item.id === repositoryId);
    if (!repo) { setError('Add and select a repository first.'); return; }
    if (title.trim().length < 8) { setError('Use a clear title of at least 8 characters.'); return; }
    if (description.trim().length < 20) { setError('Describe the work in at least 20 characters.'); return; }
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > 1000000) { setError('Enter an example amount between $1 and $1,000,000.'); return; }
    if (deadline < dateFromToday(1)) { setError('Choose a future deadline.'); return; }
    if (lines.length < 1) { setError('Add at least one acceptance criterion.'); return; }
    if (targetPrUrl.trim()) {
      const parsed = parseGitHubPullRequest(targetPrUrl);
      if (!parsed || parsed.repository.toLowerCase() !== repo.fullName.toLowerCase()) { setError('The suggested PR must be a GitHub PR in the selected repository.'); return; }
    }
    onSubmit({ repositoryId, title: title.trim(), description: description.trim(), category, rewardUsd: parsedAmount, deadline, criteria: lines, ...(targetPrUrl.trim() ? { targetPrUrl: parseGitHubPullRequest(targetPrUrl)!.url } : {}) });
  }
  return <ModalShell title="Create a bounty" subtitle="Define useful PR work and the criteria for selecting it." onClose={onClose} wide><form onSubmit={submit} className="modal-form bounty-form"><div className="form-grid"><label>GitHub repository<select value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)}>{availableRepositories.map((repo) => <option key={repo.id} value={repo.id}>{repo.fullName}{repo.participationStatus === 'opted_in' ? ' · demo opted in' : ' · hidden from discovery'}</option>)}</select><button type="button" className="inline-link" onClick={onAddRepository}>+ Add another repository</button></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="full-span">Bounty title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Improve keyboard navigation in search" maxLength={100} /></label><label className="full-span">What should the PR accomplish?<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the problem, expected outcome, and useful context." rows={3} /></label><label>Example reward amount (USD)<div className="prefixed-input"><span>$</span><input type="number" min="1" max="1000000" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="500" /></div></label><label>Deadline<input type="date" min={dateFromToday(1)} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><label className="full-span">Acceptance criteria <small>One criterion per line</small><textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder={'Tests cover the new behavior\nDocumentation explains how to use it\nExisting behavior remains intact'} rows={4} /></label><label className="full-span">Suggested existing PR URL <small>Optional</small><input value={targetPrUrl} onChange={(event) => setTargetPrUrl(event.target.value)} placeholder="https://github.com/owner/repository/pull/123" /></label></div>{error && <p className="field-error">{error}</p>}<div className="form-tip"><Icon name="info" size={18} /><span>Saving is local only. The real deanpierce.net pilot remains locked as an unpublished draft. Other bounties in nonparticipating repositories stay hidden; no funds are committed.</span></div><div className="form-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark">Save demo bounty <Icon name="arrow" size={16} /></button></div></form></ModalShell>;
}

function SubmissionForm({ bounty, repository, data, onClose, onSubmit }: { bounty: Bounty; repository: string; data: DemoData; onClose: () => void; onSubmit: (input: { prUrl: string; prNumber: number; displayName: string; note: string }) => void }) {
  const [prUrl, setPrUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateDemoSubmission(data, bounty.id, prUrl);
    if (!validation.ok) { setError(validation.reason); return; }
    if (displayName.trim().length < 2) { setError('Enter a display name of at least 2 characters.'); return; }
    onSubmit({ prUrl: validation.pr.url, prNumber: validation.pr.number, displayName: displayName.trim(), note: note.trim() });
  }
  return <ModalShell title="Submit your pull request" subtitle={`For ${bounty.title} in ${repository}.`} onClose={onClose}><form onSubmit={submit} className="modal-form"><label>Existing GitHub PR URL<input autoFocus value={prUrl} onChange={(event) => { setPrUrl(event.target.value); setError(''); }} placeholder={`https://github.com/${repository}/pull/123`} /></label><label>Your display name <small>For this demo only</small><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name or GitHub handle" maxLength={60} /></label><label>Note to the maintainer <small>Optional</small><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed, and how does it meet the criteria?" rows={3} maxLength={1000} /></label>{error && <p className="field-error">{error}</p>}<div className="form-tip"><Icon name="info" size={18} /><span>We only check this URL's format and repository name. No GitHub status, authorship, merge, or eligibility check runs in the demo.</span></div><div className="form-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button type="submit" className="button button-dark">Send to demo review <Icon name="arrow" size={16} /></button></div></form></ModalShell>;
}

export default App;
