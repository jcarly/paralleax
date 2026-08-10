import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import './ProductPages.css';

const swatches = [
  ['Ink', '#20221f', '--color-text'],
  ['Moss', '#2f6250', '--color-primary'],
  ['Moss soft', '#e5ebe6', '--color-primary-soft'],
  ['Amber', '#b78335', '--color-trigger'],
  ['Paper', '#ffffff', '--color-surface'],
  ['Canvas', '#f1f1ed', '--color-canvas'],
  ['Line', '#dedfd9', '--color-border'],
  ['Danger', '#a5453f', '--color-danger'],
];

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
    <section className="reference-section" id={id}>
      <div className="reference-heading">
        <span className="product-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

export function DesignSystemPage() {
  return (
    <div className="product-page design-layout">
      <aside className="design-navigation">
        <div>
          <span className="product-eyebrow">Reference</span>
          <b>Design system</b>
          <small>Living reference · 0.3</small>
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
        <Link className="product-secondary" to="/">
          Browse stories <span aria-hidden="true">→</span>
        </Link>
      </aside>

      <main className="design-main">
        <section className="design-hero">
          <span className="product-badge accent">Living reference</span>
          <h1>A calm interface for complex stories.</h1>
          <p>
            These foundations and components are the visual source of truth for Paralleax. Product
            screens should compose them before introducing a new pattern.
          </p>
          <dl>
            <div>
              <dt>Base unit</dt>
              <dd>4 px</dd>
            </div>
            <div>
              <dt>Body type</dt>
              <dd>System sans</dd>
            </div>
            <div>
              <dt>Display type</dt>
              <dd>Georgia</dd>
            </div>
            <div>
              <dt>Target contrast</dt>
              <dd>WCAG AA</dd>
            </div>
          </dl>
        </section>

        <ReferenceSection
          id="principles"
          eyebrow="01 · Direction"
          title="Product principles"
          description="The interface reduces cognitive load without hiding narrative structure."
        >
          <div className="principle-grid">
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
          <div className="reference-card">
            <div className="reference-card-heading">
              <h3>Core palette</h3>
              <code>CSS custom properties</code>
            </div>
            <div className="swatch-grid">
              {swatches.map(([name, color, token]) => (
                <div className="swatch" key={token}>
                  <span style={{ background: color }} />
                  <b>{name}</b>
                  <small>{color}</small>
                  <code>{token}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="reference-split">
            <div className="reference-card type-samples">
              <div className="reference-card-heading">
                <h3>Typography</h3>
                <code>1.25 scale</code>
              </div>
              <div className="display-sample">
                <span>Display</span>
                <b>Stories branch. Ideas connect.</b>
                <small>48 / 52 · Georgia</small>
              </div>
              <div>
                <span>Heading</span>
                <b>The Archive Below</b>
                <small>24 / 30 · Semibold</small>
              </div>
              <div>
                <span>Body</span>
                <p>A calm, readable rhythm keeps dense tools approachable.</p>
                <small>14 / 22 · Regular</small>
              </div>
            </div>
            <div className="reference-card">
              <div className="reference-card-heading">
                <h3>Shape and elevation</h3>
                <code>4 px base</code>
              </div>
              <div className="shape-samples">
                <div>
                  <span className="control" />
                  <b>Control</b>
                  <small>8 px radius</small>
                </div>
                <div>
                  <span className="card" />
                  <b>Card</b>
                  <small>12 px radius</small>
                </div>
                <div>
                  <span className="round" />
                  <b>Avatar</b>
                  <small>Fully round</small>
                </div>
                <div>
                  <span className="raised" />
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
          <div className="reference-card component-row">
            <div>
              <button className="product-primary" type="button">
                Primary action <span>→</span>
              </button>
              <code>Primary</code>
            </div>
            <div>
              <button className="product-secondary" type="button">
                Secondary
              </button>
              <code>Secondary</code>
            </div>
            <div>
              <button className="product-ghost" type="button">
                Ghost action
              </button>
              <code>Ghost</code>
            </div>
            <div>
              <button className="product-danger" type="button">
                Delete story
              </button>
              <code>Danger</code>
            </div>
            <div>
              <button className="product-primary" type="button" disabled>
                Unavailable
              </button>
              <code>Disabled</code>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="forms"
          eyebrow="04 · Components"
          title="Forms and selection"
          description="Labels remain visible. Searchable targets are separate from the property being changed."
        >
          <div className="reference-card form-reference">
            <label className="product-field">
              <span>Story title</span>
              <input defaultValue="The Archive Below" />
              <small>Use a specific, recognizable title.</small>
            </label>
            <label className="product-field">
              <span>Location</span>
              <select defaultValue="glasshouse">
                <option value="glasshouse">The Glasshouse</option>
                <option>Lower archive</option>
              </select>
            </label>
            <label className="product-field error-field">
              <span>Required field</span>
              <input placeholder="Add a value" />
              <small>This field cannot be empty.</small>
            </label>
            <label className="product-field">
              <span>Searchable target</span>
              <input list="design-targets" defaultValue="Mara Venn" />
              <datalist id="design-targets">
                <option value="Mara Venn" />
                <option value="Ivo Hale" />
              </datalist>
            </label>
            <label className="product-field">
              <span>Category</span>
              <input list="design-categories" placeholder="Uncategorized" />
              <datalist id="design-categories">
                <option value="Allies" />
                <option value="Antagonists" />
              </datalist>
              <small>Suggest existing same-type categories while allowing a new one.</small>
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
          <div className="reference-split">
            <div className="reference-card">
              <div className="reference-card-heading">
                <h3>Context rows</h3>
                <code>Sidebar</code>
              </div>
              <div className="context-reference">
                <button className="selected" type="button">
                  <span className="reference-avatar moss">MV</span>
                  <span>
                    <b>Mara Venn</b>
                    <small>Playable character</small>
                  </span>
                  <i>›</i>
                </button>
                <button type="button">
                  <span className="reference-avatar blue">IH</span>
                  <span>
                    <b>Ivo Hale</b>
                    <small>3 interactions</small>
                  </span>
                  <i>›</i>
                </button>
                <button type="button">
                  <span className="reference-avatar amber">⌖</span>
                  <span>
                    <b>The Glasshouse</b>
                    <small>Location</small>
                  </span>
                  <i>›</i>
                </button>
              </div>
            </div>
            <div className="reference-card">
              <div className="reference-card-heading">
                <h3>Status and identity</h3>
                <code>Metadata</code>
              </div>
              <div className="identity-reference">
                <span className="reference-avatar large moss">MV</span>
                <span className="reference-avatar large blue">IH</span>
                <span className="reference-avatar large amber">K</span>
              </div>
              <div className="badge-reference">
                <span className="product-badge accent">Saved</span>
                <span className="product-badge neutral">Private</span>
                <span className="product-badge warning">Condition</span>
                <span className="product-badge danger">Failed</span>
              </div>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          id="narrative"
          eyebrow="06 · Product patterns"
          title="Narrative components"
          description="These patterns carry domain meaning and stay consistent across editor, inspectors, and simulation."
        >
          <div className="narrative-reference">
            <article className="design-interaction-card">
              <span className="node-handle top" />
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
              <span className="node-handle bottom" />
            </article>
            <div className="design-connector">
              <span />
              <i aria-label="Empty trigger marker" />
              <span />
            </div>
            <article className="design-effect-card">
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
                  <select defaultValue="trust">
                    <option value="trust">Trust</option>
                  </select>
                </label>
                <label>
                  Operation
                  <select defaultValue="increase">
                    <option value="increase">Increase by</option>
                  </select>
                </label>
                <label>
                  Value
                  <input type="number" defaultValue="2" />
                </label>
              </div>
            </article>
          </div>
          <div className="pattern-notes">
            <div>
              <b>Interaction cards</b>
              <p>
                Show title, excerpt, location, and present characters without a redundant label.
              </p>
            </div>
            <div>
              <b>Trigger markers</b>
              <p>Use an empty, selectable diamond. Connecting lines are never selectable.</p>
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
          description="State messages explain what happened and give one clear recovery action when useful."
        >
          <div className="feedback-grid">
            <div className="feedback success">
              <span>✓</span>
              <div>
                <b>All changes saved</b>
                <p>Your latest edits are stored.</p>
              </div>
            </div>
            <div className="feedback progress">
              <span className="loading-ring" />
              <div>
                <b>Saving changes</b>
                <p>Keep this page open for a moment.</p>
              </div>
            </div>
            <div className="feedback failure">
              <span>!</span>
              <div>
                <b>Could not save</b>
                <p>Check your connection, then try again.</p>
                <button type="button">Retry</button>
              </div>
            </div>
            <div className="feedback empty">
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
