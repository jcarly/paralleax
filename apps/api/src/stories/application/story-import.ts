import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  importChoiceScript,
  importQsp,
  type ChoiceScriptImportResult,
  type QspImportResult,
  type QspImportSource,
} from '@paralleax/shared';
import type { ImportChoiceScriptDto, ImportQspDto, QspSourceMetadataDto } from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';

export const CHOICESCRIPT_IMPORT_SOURCE_LIMIT = 96 * 1024;
export const QSP_IMPORT_SOURCE_LIMIT = 80 * 1024;

@Injectable()
export class StoryImportService {
  constructor(private readonly repository: StoriesRepository) {}

  async createChoiceScript(input: ImportChoiceScriptDto, userId: string) {
    const sourceSize = input.files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
      0,
    );
    if (sourceSize > CHOICESCRIPT_IMPORT_SOURCE_LIMIT) {
      throw new BadRequestException('ChoiceScript source files exceed the 96 KiB import limit');
    }
    return this.persist(importChoiceScript(input.files, importOptions()), 'ChoiceScript', userId);
  }

  async createQsp(input: ImportQspDto, userId: string) {
    const bytes = Buffer.from(input.file.contentBase64, 'base64');
    if (bytes.byteLength > QSP_IMPORT_SOURCE_LIMIT) {
      throw new BadRequestException('The QSP game file exceeds the 80 KiB import limit');
    }
    return this.createQspFromBytes(input.file, bytes, userId);
  }

  createUnlimitedQsp(input: QspSourceMetadataDto, bytes: Buffer, userId: string) {
    return this.createQspFromBytes(input, bytes, userId);
  }

  private createQspFromBytes(input: QspSourceMetadataDto, bytes: Buffer, userId: string) {
    const expectedFormat = qspFormatForFileName(input.name);
    if (expectedFormat !== input.format) {
      throw new BadRequestException(
        `The file extension does not match the declared QSP ${input.format} format`,
      );
    }
    const source: QspImportSource = {
      name: input.name,
      format: input.format,
      content: input.format === 'text' ? decodeUtf8(bytes) : bufferToArrayBuffer(bytes),
    };
    return this.persist(importQsp(source, importOptions()), 'QSP', userId);
  }

  private async persist(
    result: ChoiceScriptImportResult | QspImportResult,
    sourceLabel: string,
    userId: string,
  ) {
    if (!result.story) {
      const errors = result.report.issues
        .filter(({ severity }) => severity === 'error')
        .slice(0, 3)
        .map((issue) =>
          [
            issue.fileName,
            'locationName' in issue ? issue.locationName : '',
            issue.line ? `line ${issue.line}` : '',
            issue.message,
          ]
            .filter(Boolean)
            .join(': '),
        );
      throw new BadRequestException(errors.join('; ') || `${sourceLabel} import failed`);
    }
    await this.repository.save(result.story, userId);
    return { story: structuredClone(result.story), report: result.report };
  }
}

function importOptions() {
  return {
    storyId: randomUUID(),
    timestamp: new Date().toISOString(),
    createId: randomUUID,
  };
}

function qspFormatForFileName(name: string): QspImportSource['format'] {
  return /\.(?:qsp|gam)$/i.test(name) ? 'binary' : 'text';
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BadRequestException('The QSP text source is not valid UTF-8');
  }
}

function bufferToArrayBuffer(bytes: Buffer): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return Uint8Array.from(bytes).buffer;
}
