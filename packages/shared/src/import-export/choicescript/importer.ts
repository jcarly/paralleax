import { ChoiceScriptGraphBuilder } from './graph-builder.js';
import { unique } from './helpers.js';
import { collectChoiceScriptVariableDeclarations, mapChoiceScriptGraphToStory } from './mapping.js';
import type { ParsedScene } from './models.js';
import { parseChoiceScriptScenes } from './parser.js';
import {
  addChoiceScriptImportIssue,
  createChoiceScriptImportReport,
  hasChoiceScriptImportErrors,
} from './report.js';
import type {
  ChoiceScriptImportOptions,
  ChoiceScriptImportReport,
  ChoiceScriptImportResult,
  ChoiceScriptSourceFile,
} from './types.js';

export function importChoiceScript(
  sourceFiles: ChoiceScriptSourceFile[],
  options: ChoiceScriptImportOptions,
): ChoiceScriptImportResult {
  const report = createChoiceScriptImportReport(sourceFiles.length);
  const scenes = parseChoiceScriptScenes(sourceFiles, report);
  report.sceneCount = scenes.length;
  if (scenes.length === 0 || hasChoiceScriptImportErrors(report)) {
    return { report };
  }

  const orderedScenes = orderScenes(scenes, report);
  const declarations = collectChoiceScriptVariableDeclarations(orderedScenes, report);
  if (hasChoiceScriptImportErrors(report)) return { report };
  const finishSceneNames = unique([orderedScenes[0].name, ...orderedScenes[0].sceneList]);
  const builder = new ChoiceScriptGraphBuilder(finishSceneNames, report);
  for (const scene of orderedScenes) builder.compileScene(scene);
  const graph = builder.finish();
  if (hasChoiceScriptImportErrors(report) || graph.nodes.length === 0) {
    if (graph.nodes.length === 0) {
      addChoiceScriptImportIssue(report, {
        severity: 'error',
        code: 'no_importable_content',
        message: 'No importable narrative content was found.',
      });
    }
    return { report };
  }

  const story = mapChoiceScriptGraphToStory(graph, orderedScenes, declarations, report, options);
  return { story, report };
}
function orderScenes(scenes: ParsedScene[], report: ChoiceScriptImportReport): ParsedScene[] {
  const byName = new Map(scenes.map((scene) => [scene.name, scene]));
  const startup = byName.get('startup') ?? scenes[0];
  if (!byName.has('startup')) {
    addChoiceScriptImportIssue(report, {
      severity: 'warning',
      code: 'missing_startup_scene',
      message: `No startup.txt file was selected; "${startup.fileName}" is used as the entry scene.`,
      fileName: startup.fileName,
    });
  }
  const orderedNames = unique([startup.name, ...startup.sceneList]);
  for (const scene of scenes) if (!orderedNames.includes(scene.name)) orderedNames.push(scene.name);
  for (const sceneName of startup.sceneList) {
    if (!byName.has(sceneName)) {
      addChoiceScriptImportIssue(report, {
        severity: 'error',
        code: 'missing_scene_file',
        message: `The *scene_list references "${sceneName}", but its .txt file was not selected.`,
        fileName: startup.fileName,
      });
    }
  }
  return orderedNames.flatMap((name) => (byName.has(name) ? [byName.get(name)!] : []));
}
