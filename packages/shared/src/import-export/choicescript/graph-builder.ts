import { MAX_INTERACTION_BODY_LENGTH } from '../../model/interactions.js';
import { layoutImportedGraph } from '../layout.js';
import {
  displayAnchor,
  escapeHtml,
  fallbackSource,
  humanizeIdentifier,
  labelAnchor,
  normalizeIdentifier,
  sceneAnchor,
  truncate,
  unique,
} from './helpers.js';
import type {
  DeferredEdge,
  DirectEdge,
  DraftNode,
  ParsedScene,
  SourceCondition,
  SourceEffect,
  SourceLine,
  Statement,
} from './models.js';
import { addChoiceScriptSourceIssue as addIssue } from './report.js';
import type { ChoiceScriptImportReport } from './types.js';

const MAX_IMPORTED_PASSAGE_TEXT_LENGTH = 12_000;

export class ChoiceScriptGraphBuilder {
  readonly nodes: DraftNode[] = [];
  readonly edges: DirectEdge[] = [];
  private readonly deferredEdges: DeferredEdge[] = [];
  private readonly anchors = new Map<string, string>();
  private nodeSequence = 0;

  constructor(
    private readonly finishSceneNames: string[],
    private readonly report: ChoiceScriptImportReport,
  ) {}

  compileScene(scene: ParsedScene) {
    if (scene.statements.length === 0) return;
    this.compileStatements(
      scene,
      scene.statements,
      [],
      [sceneAnchor(scene.name)],
      humanizeIdentifier(scene.name),
    );
  }

  finish() {
    for (const edge of this.deferredEdges) {
      const target = this.anchors.get(edge.anchor);
      if (!target) {
        addIssue(
          this.report,
          edge.source,
          'missing_jump_target',
          `The jump target "${displayAnchor(edge.anchor)}" was not found.`,
          'error',
        );
        continue;
      }
      this.connect(edge.from, target);
    }
    return { nodes: this.nodes, edges: this.edges };
  }

  private compileStatements(
    scene: ParsedScene,
    statements: Statement[],
    initialActive: string[],
    initialAnchors: string[],
    initialTitle: string,
  ): string[] {
    let active = [...initialActive];
    let pendingAnchors = [...initialAnchors];
    let pendingTitle = initialTitle;
    let terminated = false;
    let pendingEffects: SourceEffect[] = [];

    const createNode = (title: string, body: string, source: SourceLine) => {
      const node = this.addNode(scene, title, body, source);
      node.effects.push(...pendingEffects);
      pendingEffects = [];
      for (const predecessor of active) this.connect(predecessor, node.key);
      for (const anchor of pendingAnchors) this.defineAnchor(anchor, node.key, source);
      active = [node.key];
      pendingAnchors = [];
      pendingTitle = humanizeIdentifier(scene.name);
      terminated = false;
      return node;
    };

    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      if (statement.kind === 'declare' || statement.kind === 'set') {
        if (statement.kind === 'declare' && !statement.temporary) continue;
        const effect: SourceEffect = {
          name: statement.name,
          sceneName: scene.name,
          operation: statement.kind === 'set' ? statement.operation : 'set',
          value: statement.value,
          source: statement.source,
        };
        const activeNodes = active.flatMap((key) => {
          const node = this.nodes.find((candidate) => candidate.key === key);
          return node ? [node] : [];
        });
        if (activeNodes.length > 0) {
          for (const node of activeNodes) node.effects.push(effect);
        } else {
          pendingEffects.push(effect);
        }
        continue;
      }
      if (statement.kind === 'label') {
        const anchor = labelAnchor(scene.name, statement.name);
        pendingAnchors.push(anchor);
        pendingTitle = humanizeIdentifier(statement.name || 'label');
        terminated = false;
        continue;
      }
      if (statement.kind === 'text') {
        if (terminated && pendingAnchors.length === 0) continue;
        const text = passageText(statement.lines, this.report, statement.source);
        if (text) createNode(pendingTitle, text, statement.source);
        continue;
      }
      if (statement.kind === 'choice') {
        if (terminated && pendingAnchors.length === 0) continue;
        if (active.length === 0 || pendingAnchors.length > 0) {
          createNode(pendingTitle, '', statement.source);
        }
        const branchSource = [...active];
        const branchExits: string[] = [];
        for (const option of statement.options) {
          const optionStatements = [...option.statements];
          const firstText =
            optionStatements[0]?.kind === 'text' ? optionStatements.shift() : undefined;
          const optionNode = this.addNode(
            scene,
            option.title,
            firstText?.kind === 'text'
              ? passageText(firstText.lines, this.report, firstText.source)
              : '',
            option.source,
          );
          for (const predecessor of branchSource) {
            this.connect(predecessor, optionNode.key, option.condition);
          }
          branchExits.push(
            ...this.compileStatements(scene, optionStatements, [optionNode.key], [], option.title),
          );
        }
        active = unique(branchExits);
        terminated = active.length === 0;
        continue;
      }
      if (statement.kind === 'goto') {
        for (const from of active) {
          this.deferredEdges.push({
            from,
            anchor: labelAnchor(scene.name, statement.label),
            source: statement.source,
          });
        }
        active = [];
        terminated = true;
        continue;
      }
      if (statement.kind === 'gotoScene') {
        for (const from of active) {
          this.deferredEdges.push({
            from,
            anchor: statement.label
              ? labelAnchor(statement.scene, statement.label)
              : sceneAnchor(statement.scene),
            source: statement.source,
          });
        }
        active = [];
        terminated = true;
        continue;
      }
      if (statement.kind === 'finish') {
        const sceneIndex = this.finishSceneNames.indexOf(scene.name);
        const nextSceneName = this.finishSceneNames[sceneIndex + 1];
        if (nextSceneName) {
          for (const from of active) {
            this.deferredEdges.push({
              from,
              anchor: sceneAnchor(nextSceneName),
              source: statement.source,
            });
          }
        }
        active = [];
        terminated = true;
        continue;
      }
      if (statement.kind === 'ending') {
        active = [];
        terminated = true;
      }
    }
    if (pendingAnchors.length > 0)
      createNode(pendingTitle, '', statements.at(-1)?.source ?? fallbackSource(scene));
    return active;
  }

  private addNode(scene: ParsedScene, title: string, body: string, source: SourceLine): DraftNode {
    const node: DraftNode = {
      key: `node:${this.nodeSequence++}`,
      title: truncate(title.trim() || 'Untitled interaction', 200),
      body,
      sceneName: scene.name,
      sourceLine: source.number,
      effects: [],
    };
    this.nodes.push(node);
    return node;
  }

  private connect(from: string, to: string, condition?: SourceCondition) {
    if (
      from === to ||
      this.edges.some(
        (edge) =>
          edge.from === from &&
          edge.to === to &&
          JSON.stringify(edge.condition) === JSON.stringify(condition),
      )
    ) {
      return;
    }
    this.edges.push({ from, to, ...(condition ? { condition } : {}) });
  }

  private defineAnchor(anchor: string, nodeKey: string, source: SourceLine) {
    if (this.anchors.has(anchor)) {
      addIssue(
        this.report,
        source,
        'duplicate_label',
        `The label "${displayAnchor(anchor)}" is defined more than once.`,
        'error',
      );
      return;
    }
    this.anchors.set(anchor, nodeKey);
  }
}

function passageText(
  lines: string[],
  report: ChoiceScriptImportReport,
  source: SourceLine,
): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(' '));
    current = [];
  };
  for (const line of lines) {
    if (line) current.push(line);
    else flush();
  }
  flush();
  let text = paragraphs.join('\n\n');
  if (text.length > MAX_IMPORTED_PASSAGE_TEXT_LENGTH) {
    addIssue(
      report,
      source,
      'passage_truncated',
      `A passage exceeded ${MAX_IMPORTED_PASSAGE_TEXT_LENGTH} characters and was truncated.`,
    );
    text = truncate(text, MAX_IMPORTED_PASSAGE_TEXT_LENGTH);
    report.approximatedCommandCount += 1;
  }
  const html = paragraphsFromText(text);
  return html.length <= MAX_INTERACTION_BODY_LENGTH
    ? html
    : paragraphsFromText(truncate(text, 8_000));
}

function paragraphsFromText(text: string) {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(
        /\$\{([a-z_][a-z0-9_]*)\}/gi,
        (_match, name: string) =>
          `<span data-cs-variable="${escapeHtml(normalizeIdentifier(name))}"></span>`,
      );
      return `<p>${escaped}</p>`;
    })
    .join('');
}

export function layoutChoiceScriptGraph(nodes: DraftNode[], edges: DirectEdge[]) {
  return layoutImportedGraph(nodes, edges);
}
