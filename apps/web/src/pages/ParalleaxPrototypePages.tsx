import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { prototypeRoutes, type PrototypeRoute } from './ParalleaxPrototypeRoutes';
import './ParalleaxPrototypePages.css';

interface PrototypePageProps {
  onNavigate: (route: PrototypeRoute) => void;
}

function Brand({ onNavigate }: PrototypePageProps) {
  return (
    <button
      className="pp-portal-brand"
      type="button"
      onClick={() => onNavigate(prototypeRoutes.stories)}
    >
      <span aria-hidden="true">P</span>
      <b>Paralleax</b>
    </button>
  );
}

function PortalHeader({
  current,
  onNavigate,
}: PrototypePageProps & { current: 'stories' | 'design-system' }) {
  return (
    <header className="pp-portal-header">
      <Brand onNavigate={onNavigate} />
      <nav aria-label="Prototype navigation">
        <button
          className={current === 'stories' ? 'active' : ''}
          type="button"
          onClick={() => onNavigate(prototypeRoutes.stories)}
        >
          Stories
        </button>
        <button
          className={current === 'design-system' ? 'active' : ''}
          type="button"
          onClick={() => onNavigate(prototypeRoutes.designSystem)}
        >
          Design system
        </button>
      </nav>
      <div className="pp-portal-header-spacer" />
      <button className="pp-portal-help" type="button">
        Help
      </button>
      <button className="pp-portal-profile" type="button" aria-label="Open account menu">
        <span>AV</span>
        <span>
          <b>Alex Varenne</b>
          <small>alex@example.com</small>
        </span>
        <i aria-hidden="true">⌄</i>
      </button>
      <button
        className="pp-portal-signout"
        type="button"
        onClick={() => onNavigate(prototypeRoutes.login)}
      >
        Sign out
      </button>
    </header>
  );
}

function MiniStoryGraph() {
  return (
    <div className="pp-auth-graph" aria-hidden="true">
      <svg viewBox="0 0 560 360" preserveAspectRatio="none">
        <path d="M280 76 V130" />
        <path d="M280 158 V207 H144 V245" />
        <path d="M280 158 V245" />
        <path d="M280 158 V207 H416 V245" />
      </svg>
      <div className="pp-auth-node root">
        <small>START</small>
        <b>A room full of echoes</b>
        <span>The Glasshouse</span>
      </div>
      <span className="pp-auth-trigger" />
      <div className="pp-auth-node left">
        <b>A quiet warning</b>
        <span>Old quarter</span>
      </div>
      <div className="pp-auth-node center">
        <b>The hidden passage</b>
        <span>Lower archive</span>
      </div>
      <div className="pp-auth-node right">
        <b>A voice in the dark</b>
        <span>Lower archive</span>
      </div>
    </div>
  );
}

export function PrototypeAuthPage({
  mode,
  onNavigate,
}: PrototypePageProps & { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const canSubmit =
    email.includes('@') && password.length >= 8 && (!isRegister || password === confirmation);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onNavigate(prototypeRoutes.stories);
  }

  return (
    <main className="pp-prototype-portal pp-auth-page">
      <section className="pp-auth-showcase">
        <Brand onNavigate={onNavigate} />
        <div className="pp-auth-message">
          <span className="pp-portal-eyebrow">Interactive narrative design</span>
          <h1>Every path stays visible.</h1>
          <p>
            Shape branching stories, test their rules, and keep characters, places, items, and time
            in one coherent workspace.
          </p>
        </div>
        <MiniStoryGraph />
        <p className="pp-auth-quote">
          “The graph helps you see the story. The model keeps every path reliable.”
        </p>
      </section>
      <section className="pp-auth-panel">
        <div className="pp-auth-card">
          <div className="pp-auth-mobile-brand">
            <Brand onNavigate={onNavigate} />
          </div>
          <span className="pp-portal-eyebrow">
            {isRegister ? 'Start creating' : 'Welcome back'}
          </span>
          <h2>{isRegister ? 'Create your account' : 'Sign in to Paralleax'}</h2>
          <p>
            {isRegister
              ? 'Create a private workspace for your interactive stories.'
              : 'Continue working on your stories and simulations.'}
          </p>
          <form onSubmit={submit}>
            <label className="pp-portal-field">
              <span>Email address</span>
              <input
                autoComplete="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="pp-portal-field">
              <span>Password</span>
              <span className="pp-password-field">
                <input
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            {isRegister ? (
              <label className="pp-portal-field">
                <span>Confirm password</span>
                <input
                  autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
                {confirmation && password !== confirmation ? (
                  <small className="pp-field-error">Passwords do not match.</small>
                ) : null}
              </label>
            ) : (
              <div className="pp-auth-options">
                <label>
                  <input type="checkbox" /> Keep me signed in
                </label>
                <button type="button">Forgot password?</button>
              </div>
            )}
            <button
              className="pp-portal-primary pp-auth-submit"
              type="submit"
              disabled={!canSubmit}
            >
              {isRegister ? 'Create account' : 'Sign in'}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="pp-auth-switch">
            <span>{isRegister ? 'Already have an account?' : 'New to Paralleax?'}</span>
            <button
              type="button"
              onClick={() =>
                onNavigate(isRegister ? prototypeRoutes.login : prototypeRoutes.register)
              }
            >
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
          </div>
          <small className="pp-prototype-note">
            Prototype only — no account data is submitted.
          </small>
        </div>
      </section>
    </main>
  );
}

type StoryTone = 'glasshouse' | 'harbor' | 'embers' | 'blank';
type StoryFilter = 'all' | 'recent' | 'empty';

interface PrototypeStory {
  id: number;
  title: string;
  description: string;
  interactions: number;
  characters: number;
  updated: string;
  tone: StoryTone;
  private: boolean;
}

const initialStories: PrototypeStory[] = [
  {
    id: 1,
    title: 'The Archive Below',
    description: 'An archivist follows a trail of erased memories beneath the old quarter.',
    interactions: 18,
    characters: 3,
    updated: '12 minutes ago',
    tone: 'glasshouse',
    private: true,
  },
  {
    id: 2,
    title: 'Harbor Signals',
    description: 'Three lighthouse keepers decode a message that arrives with every storm.',
    interactions: 31,
    characters: 5,
    updated: 'Yesterday',
    tone: 'harbor',
    private: true,
  },
  {
    id: 3,
    title: 'Ashfall',
    description: 'A city evacuation told through conflicting accounts and difficult choices.',
    interactions: 9,
    characters: 4,
    updated: '4 days ago',
    tone: 'embers',
    private: true,
  },
  {
    id: 4,
    title: 'Untitled story',
    description: 'A new story waiting for its first interaction.',
    interactions: 0,
    characters: 0,
    updated: '2 weeks ago',
    tone: 'blank',
    private: true,
  },
];

function StoryCover({ story }: { story: PrototypeStory }) {
  return (
    <div
      className={`pp-story-cover ${story.tone}`}
      role="img"
      aria-label={`Abstract cover for ${story.title}`}
    >
      <div className="pp-cover-path" />
      <span className="pp-cover-node one" />
      <span className="pp-cover-trigger" />
      <span className="pp-cover-node two" />
      <small>{String(story.id).padStart(2, '0')}</small>
    </div>
  );
}

function StoryCard({ story, onOpen }: { story: PrototypeStory; onOpen: () => void }) {
  return (
    <article className="pp-story-card">
      <StoryCover story={story} />
      <div className="pp-story-card-body">
        <div className="pp-story-card-title">
          <span className="pp-portal-badge neutral">{story.private ? 'Private' : 'Shared'}</span>
          <button type="button" aria-label={`More actions for ${story.title}`}>
            •••
          </button>
        </div>
        <h3>{story.title}</h3>
        <p>{story.description}</p>
        <dl>
          <div>
            <dt>Interactions</dt>
            <dd>{story.interactions}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd>{story.characters}</dd>
          </div>
        </dl>
      </div>
      <footer>
        <span>Edited {story.updated}</span>
        <button className="pp-portal-secondary" type="button" onClick={onOpen}>
          Open editor <span aria-hidden="true">→</span>
        </button>
      </footer>
    </article>
  );
}

export function PrototypeStoryList({ onNavigate }: PrototypePageProps) {
  const [stories, setStories] = useState(initialStories);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StoryFilter>('all');
  const [sort, setSort] = useState<'updated' | 'title'>('updated');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const visibleStories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = stories.filter((story) => {
      if (filter === 'recent' && !['12 minutes ago', 'Yesterday'].includes(story.updated)) {
        return false;
      }
      if (filter === 'empty' && story.interactions !== 0) return false;
      return `${story.title} ${story.description}`.toLocaleLowerCase().includes(normalizedQuery);
    });
    return filtered.sort((left, right) =>
      sort === 'title' ? left.title.localeCompare(right.title) : left.id - right.id,
    );
  }, [filter, query, sort, stories]);

  function createStory(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setStories((current) => [
      {
        id: Math.max(...current.map(({ id }) => id), 0) + 1,
        title,
        description: 'A new story waiting for its first interaction.',
        interactions: 0,
        characters: 0,
        updated: 'Just now',
        tone: 'blank',
        private: true,
      },
      ...current,
    ]);
    setNewTitle('');
    setCreating(false);
    setFilter('all');
  }

  return (
    <div className="pp-prototype-portal pp-library-page">
      <PortalHeader current="stories" onNavigate={onNavigate} />
      <main className="pp-library-main">
        <section className="pp-library-heading">
          <div>
            <span className="pp-portal-eyebrow">Your workspace</span>
            <h1>Stories</h1>
            <p>Create, organize, and return to every interactive narrative.</p>
          </div>
          <button className="pp-portal-primary" type="button" onClick={() => setCreating(true)}>
            <span aria-hidden="true">＋</span> New story
          </button>
        </section>

        <section className="pp-library-toolbar" aria-label="Story filters">
          <label className="pp-library-search">
            <span aria-hidden="true">⌕</span>
            <span className="pp-portal-sr-only">Search stories</span>
            <input
              aria-label="Search stories"
              type="search"
              placeholder="Search stories…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="pp-library-filters">
            {(
              [
                ['all', 'All stories'],
                ['recent', 'Recently edited'],
                ['empty', 'Empty'],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={filter === value}
                className={filter === value ? 'active' : ''}
                key={value}
                type="button"
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="pp-library-sort">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="updated">Last edited</option>
              <option value="title">Title</option>
            </select>
          </label>
          <div className="pp-view-toggle" aria-label="Story layout">
            <button
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              className={view === 'grid' ? 'active' : ''}
              type="button"
              onClick={() => setView('grid')}
            >
              ▦
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === 'list'}
              className={view === 'list' ? 'active' : ''}
              type="button"
              onClick={() => setView('list')}
            >
              ☷
            </button>
          </div>
        </section>

        <div className="pp-library-count">
          <b>{visibleStories.length}</b> {visibleStories.length === 1 ? 'story' : 'stories'}
        </div>
        {visibleStories.length ? (
          <section className={`pp-story-grid ${view === 'list' ? 'list' : ''}`}>
            {visibleStories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onOpen={() => onNavigate(prototypeRoutes.editor)}
              />
            ))}
          </section>
        ) : (
          <section className="pp-library-empty">
            <span aria-hidden="true">◇</span>
            <h2>No stories found</h2>
            <p>Try another search or create a new story.</p>
            <button className="pp-portal-secondary" type="button" onClick={() => setQuery('')}>
              Clear search
            </button>
          </section>
        )}
      </main>

      {creating ? (
        <div className="pp-modal-backdrop" role="presentation">
          <section
            className="pp-new-story-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-story-title"
          >
            <div className="pp-dialog-icon" aria-hidden="true">
              ◇
            </div>
            <span className="pp-portal-eyebrow">New narrative</span>
            <h2 id="new-story-title">Create a story</h2>
            <p>
              Start with a private, empty story. You can add its first interaction in the editor.
            </p>
            <form onSubmit={createStory}>
              <label className="pp-portal-field">
                <span>Story title</span>
                <input
                  autoFocus
                  placeholder="Untitled story"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              </label>
              <div className="pp-dialog-actions">
                <button
                  className="pp-portal-secondary"
                  type="button"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button className="pp-portal-primary" type="submit" disabled={!newTitle.trim()}>
                  Create story
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ReferenceSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="pp-reference-section" id={id}>
      <header>
        <span className="pp-portal-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

const swatches = [
  ['Ink', '#20221f', '--pp-ink'],
  ['Moss', '#2f6250', '--pp-accent'],
  ['Moss soft', '#e5ebe6', '--pp-accent-soft'],
  ['Amber', '#b78335', '--pp-trigger'],
  ['Paper', '#ffffff', '--pp-paper'],
  ['Canvas', '#f1f1ed', '--pp-canvas'],
  ['Line', '#dedfd9', '--pp-line'],
  ['Danger', '#a5453f', '--pp-danger'],
];

export function PrototypeDesignSystem({ onNavigate }: PrototypePageProps) {
  return (
    <div className="pp-prototype-portal pp-design-page">
      <PortalHeader current="design-system" onNavigate={onNavigate} />
      <aside className="pp-design-nav">
        <div>
          <span className="pp-portal-eyebrow">Reference</span>
          <b>Design system</b>
          <small>Prototype · 0.2</small>
        </div>
        <nav aria-label="Design system sections">
          <a href="#principles">Principles</a>
          <a href="#foundations">Foundations</a>
          <a href="#actions">Actions</a>
          <a href="#forms">Forms</a>
          <a href="#navigation">Navigation</a>
          <a href="#narrative">Narrative UI</a>
          <a href="#feedback">Feedback</a>
        </nav>
        <button
          className="pp-portal-secondary"
          type="button"
          onClick={() => onNavigate(prototypeRoutes.editor)}
        >
          Open editor <span aria-hidden="true">↗</span>
        </button>
      </aside>
      <main className="pp-design-main">
        <section className="pp-design-hero">
          <span className="pp-portal-badge accent">Living reference</span>
          <h1>A calm interface for complex stories.</h1>
          <p>
            These foundations and components are the visual source of truth for the Paralleax
            prototype. Product screens should compose them before inventing a new pattern.
          </p>
          <dl>
            <div>
              <dt>Base unit</dt>
              <dd>4 px</dd>
            </div>
            <div>
              <dt>Body type</dt>
              <dd>Inter</dd>
            </div>
            <div>
              <dt>Display type</dt>
              <dd>Newsreader</dd>
            </div>
            <div>
              <dt>Contrast</dt>
              <dd>WCAG AA</dd>
            </div>
          </dl>
        </section>

        <ReferenceSection
          id="principles"
          eyebrow="01 · Direction"
          title="Product principles"
          description="The interface should reduce cognitive load without hiding narrative structure."
        >
          <div className="pp-principle-grid">
            <article>
              <span>01</span>
              <h3>Story first</h3>
              <p>The graph is a view of the narrative model, never the model itself.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Reveal relationships</h3>
              <p>Targets, effects, conditions, and ownership stay visible and explicit.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Quiet by default</h3>
              <p>Neutral surfaces carry the work. Color communicates state and meaning.</p>
            </article>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="foundations"
          eyebrow="02 · Foundations"
          title="Color, type, and shape"
          description="Warm neutrals support long authoring sessions; moss marks primary action and amber belongs to triggers."
        >
          <div className="pp-reference-card">
            <div className="pp-reference-card-head">
              <h3>Core palette</h3>
              <code>CSS custom properties</code>
            </div>
            <div className="pp-swatch-grid">
              {swatches.map(([name, color, token]) => (
                <div className="pp-swatch" key={token}>
                  <span style={{ background: color }} />
                  <b>{name}</b>
                  <small>{color}</small>
                  <code>{token}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="pp-reference-split">
            <div className="pp-reference-card pp-type-samples">
              <div className="pp-reference-card-head">
                <h3>Typography</h3>
                <code>1.25 scale</code>
              </div>
              <div className="display">
                <span>Display</span>
                <b>
                  Stories branch.
                  <br />
                  Ideas connect.
                </b>
                <small>48 / 52 · Newsreader</small>
              </div>
              <div className="heading">
                <span>Heading</span>
                <b>The Archive Below</b>
                <small>24 / 30 · Inter Semibold</small>
              </div>
              <div className="body">
                <span>Body</span>
                <p>A calm, readable rhythm keeps dense tools approachable.</p>
                <small>14 / 22 · Inter Regular</small>
              </div>
              <div className="caption">
                <span>Caption</span>
                <b>EDITED 12 MINUTES AGO</b>
                <small>11 / 16 · Inter Medium</small>
              </div>
            </div>
            <div className="pp-reference-card">
              <div className="pp-reference-card-head">
                <h3>Shape & elevation</h3>
                <code>4 px base</code>
              </div>
              <div className="pp-shape-samples">
                <div>
                  <span className="radius-small" />
                  <b>Control</b>
                  <small>8 px radius</small>
                </div>
                <div>
                  <span className="radius-card" />
                  <b>Card</b>
                  <small>12 px radius</small>
                </div>
                <div>
                  <span className="radius-round" />
                  <b>Avatar</b>
                  <small>Fully round</small>
                </div>
                <div>
                  <span className="elevation" />
                  <b>Floating</b>
                  <small>Layer 2 shadow</small>
                </div>
              </div>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="actions"
          eyebrow="03 · Components"
          title="Actions"
          description="Use one clear primary action per surface. Secondary and ghost actions preserve hierarchy."
        >
          <div className="pp-reference-card">
            <div className="pp-component-row">
              <div>
                <button className="pp-portal-primary" type="button">
                  Primary action <span>→</span>
                </button>
                <code>Primary</code>
              </div>
              <div>
                <button className="pp-portal-secondary" type="button">
                  Secondary
                </button>
                <code>Secondary</code>
              </div>
              <div>
                <button className="pp-portal-ghost" type="button">
                  Ghost action
                </button>
                <code>Ghost</code>
              </div>
              <div>
                <button className="pp-portal-danger" type="button">
                  Delete story
                </button>
                <code>Danger</code>
              </div>
              <div>
                <button className="pp-portal-primary" type="button" disabled>
                  Unavailable
                </button>
                <code>Disabled</code>
              </div>
              <div>
                <button className="pp-icon-button" type="button" aria-label="More actions">
                  •••
                </button>
                <code>Icon</code>
              </div>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="forms"
          eyebrow="04 · Components"
          title="Forms and selection"
          description="Labels remain visible. Searchable targets are separate from the property being changed."
        >
          <div className="pp-reference-card pp-form-reference">
            <label className="pp-portal-field">
              <span>Story title</span>
              <input defaultValue="The Archive Below" />
              <small>Use a specific, recognizable title.</small>
            </label>
            <label className="pp-portal-field">
              <span>Location</span>
              <select defaultValue="glasshouse">
                <option value="glasshouse">The Glasshouse</option>
                <option>Lower archive</option>
              </select>
            </label>
            <label className="pp-portal-field error">
              <span>Required field</span>
              <input placeholder="Add a value" />
              <small>This field cannot be empty.</small>
            </label>
            <label className="pp-portal-field">
              <span>Searchable target</span>
              <input list="pp-design-targets" defaultValue="Mara Venn" />
              <datalist id="pp-design-targets">
                <option value="Mara Venn" />
                <option value="Ivo Hale" />
              </datalist>
            </label>
            <fieldset>
              <legend>Choice controls</legend>
              <label>
                <input type="checkbox" defaultChecked /> Force unavailable options
              </label>
              <label>
                <input name="route-style" type="radio" defaultChecked /> Show all routes
              </label>
              <label>
                <input name="route-style" type="radio" /> Focus current route
              </label>
            </fieldset>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="navigation"
          eyebrow="05 · Patterns"
          title="Navigation and content"
          description="Rows combine a compact visual anchor, a primary label, and one useful line of metadata."
        >
          <div className="pp-reference-split">
            <div className="pp-reference-card">
              <div className="pp-reference-card-head">
                <h3>Context rows</h3>
                <code>Sidebar</code>
              </div>
              <div className="pp-context-reference">
                <button className="selected" type="button">
                  <span className="avatar moss">MV</span>
                  <span>
                    <b>Mara Venn</b>
                    <small>Playable character</small>
                  </span>
                  <i>›</i>
                </button>
                <button type="button">
                  <span className="avatar blue">IH</span>
                  <span>
                    <b>Ivo Hale</b>
                    <small>3 interactions</small>
                  </span>
                  <i>›</i>
                </button>
                <button type="button">
                  <span className="avatar image">⌖</span>
                  <span>
                    <b>The Glasshouse</b>
                    <small>Location</small>
                  </span>
                  <i>›</i>
                </button>
              </div>
            </div>
            <div className="pp-reference-card">
              <div className="pp-reference-card-head">
                <h3>Status & identity</h3>
                <code>Metadata</code>
              </div>
              <div className="pp-identity-reference">
                <span className="avatar large moss">MV</span>
                <span className="avatar large blue">IH</span>
                <span className="avatar large amber">K</span>
                <span className="avatar large image">⌖</span>
              </div>
              <div className="pp-badge-reference">
                <span className="pp-portal-badge accent">Saved</span>
                <span className="pp-portal-badge neutral">Private</span>
                <span className="pp-portal-badge warning">Condition</span>
                <span className="pp-portal-badge danger">Failed</span>
              </div>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="narrative"
          eyebrow="06 · Product patterns"
          title="Narrative components"
          description="These patterns carry domain meaning and should stay consistent across editor, inspectors, and simulation."
        >
          <div className="pp-narrative-reference">
            <article className="pp-design-interaction">
              <span className="handle top" />
              <small>START</small>
              <h3>The hidden passage</h3>
              <p>A loose tile reveals a stairway beneath the garden.</p>
              <footer>
                <span>⌖ The Glasshouse</span>
                <span>
                  <i>MV</i>
                  <i>IH</i>
                </span>
              </footer>
              <span className="handle bottom" />
            </article>
            <div className="pp-design-connector">
              <span />
              <i aria-label="Empty trigger marker" />
              <span />
            </div>
            <article className="pp-design-effect">
              <header>
                <b>Stat change 1</b>
                <button type="button" aria-label="Remove stat effect">
                  ×
                </button>
              </header>
              <div>
                <label>
                  Target
                  <input defaultValue="Mara Venn" />
                </label>
                <label>
                  Stat
                  <select>
                    <option>Trust</option>
                  </select>
                </label>
                <label>
                  Operation
                  <select>
                    <option>Increase by</option>
                  </select>
                </label>
                <label>
                  Value
                  <input type="number" defaultValue="2" />
                </label>
              </div>
            </article>
          </div>
          <div className="pp-pattern-notes">
            <div>
              <b>Interaction cards</b>
              <p>
                Show title, a short excerpt, location, and present characters. Do not repeat
                “Interaction”.
              </p>
            </div>
            <div>
              <b>Trigger markers</b>
              <p>
                Use an empty diamond between cards. The marker is selectable; connecting lines are
                not.
              </p>
            </div>
            <div>
              <b>Effect cards</b>
              <p>Choose a searchable target first, then a separate stat or item field.</p>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="feedback"
          eyebrow="07 · States"
          title="Feedback and empty states"
          description="State messages explain what happened and, when useful, give one clear recovery action."
        >
          <div className="pp-feedback-grid">
            <div className="pp-feedback success">
              <span>✓</span>
              <div>
                <b>All changes saved</b>
                <p>Your latest edits are stored.</p>
              </div>
            </div>
            <div className="pp-feedback progress">
              <span className="spinner" />
              <div>
                <b>Saving changes</b>
                <p>Keep this page open for a moment.</p>
              </div>
            </div>
            <div className="pp-feedback failure">
              <span>!</span>
              <div>
                <b>Could not save</b>
                <p>Check your connection, then try again.</p>
                <button type="button">Retry</button>
              </div>
            </div>
            <div className="pp-feedback empty">
              <span>◇</span>
              <div>
                <b>No items yet</b>
                <p>Add an item definition to use inventory effects.</p>
                <button type="button">Add item</button>
              </div>
            </div>
          </div>
        </ReferenceSection>
      </main>
    </div>
  );
}
