import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { importChoiceScript } from '@paralleax/shared';
import type { ImportChoiceScriptDto } from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';

export const CHOICESCRIPT_IMPORT_SOURCE_LIMIT = 96 * 1024;

@Injectable()
export class ChoiceScriptImportService {
  constructor(private readonly repository: StoriesRepository) {}

  async create(input: ImportChoiceScriptDto, userId: string) {
    const sourceSize = input.files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
      0,
    );
    if (sourceSize > CHOICESCRIPT_IMPORT_SOURCE_LIMIT) {
      throw new BadRequestException('ChoiceScript source files exceed the 96 KiB import limit');
    }
    const result = importChoiceScript(input.files, {
      storyId: randomUUID(),
      timestamp: new Date().toISOString(),
      createId: randomUUID,
    });
    if (!result.story) {
      const errors = result.report.issues
        .filter(({ severity }) => severity === 'error')
        .slice(0, 3)
        .map(({ fileName, line, message }) =>
          [fileName, line ? `line ${line}` : '', message].filter(Boolean).join(': '),
        );
      throw new BadRequestException(errors.join('; ') || 'ChoiceScript import failed');
    }
    await this.repository.save(result.story, userId);
    return { story: structuredClone(result.story), report: result.report };
  }
}
