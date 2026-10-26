import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(repositoryRoot, 'apps/web/src/__design_system_rule_fixture__.tsx');
const ruleId = 'design-system/require-shared-form-control';
const eslint = new ESLint({ cwd: repositoryRoot });

async function lint(source) {
  const [result] = await eslint.lintText(source, { filePath: fixturePath });
  return result.messages.filter((message) => message.ruleId === ruleId);
}

test('shared field rule accepts explicit standard and compact classes', async () => {
  const messages = await lint(`
    export function Fields() {
      return <><input className="form-control form-control--standard" />
        <select className="form-control form-control--compact" />
        <textarea className="form-control form-control--compact form-control--multiline" />
      </>;
    }
  `);

  assert.equal(messages.length, 0);
});

test('shared field rule reads conditional JSX and dynamic-density templates', async () => {
  const messages = await lint(`
    const density = 'compact';
    export function Fields({ compact }: { compact: boolean }) {
      return <><input className={compact
        ? 'form-control form-control--compact'
        : 'form-control form-control--standard'} />
        <select className={\`form-control form-control--\${density}\`} />
        <textarea className={\`form-control form-control--compact \${compact ? 'wide' : ''}\`.trim()} />
      </>;
    }
  `);

  assert.equal(messages.length, 0);
});

test('shared field rule reads class utility arguments and resolved local constants', async () => {
  const messages = await lint(`
    const clsx = (...values: unknown[]) => values;
    const fieldClasses = 'form-control form-control--standard';
    export function Fields({ compact }: { compact: boolean }) {
      return <><input className={fieldClasses} />
        <select className={clsx(
          'form-control',
          compact ? 'form-control--compact' : 'form-control--standard',
        )} />
      </>;
    }
  `);

  assert.equal(messages.length, 0);
});

test('shared field rule reports missing classes and incomplete conditional branches', async () => {
  const messages = await lint(`
    export function Fields({ compact }: { compact: boolean }) {
      return <><input className="custom-input" />
        <select className="form-control" />
        <textarea className={compact
          ? 'form-control form-control--compact'
          : 'custom-input'} />
      </>;
    }
  `);

  assert.equal(messages.length, 3);
  assert.ok(messages.every((message) => message.messageId === 'requireSharedClasses'));
});

test('shared field rule allows specialized native controls and reusable wrappers', async () => {
  const messages = await lint(`
    function TextField() {
      return <input className="form-control form-control--compact" />;
    }
    export function Controls() {
      return <><input type="checkbox" />
        <input type="color" />
        <input type="search" />
        <input type="file" />
        <TextField />
      </>;
    }
  `);

  assert.equal(messages.length, 0);
});

test('shared field rule rejects an unresolved class utility', async () => {
  const messages = await lint(`
    declare function getFieldClassName(): string;
    export function Fields() {
      return <input className={getFieldClassName()} />;
    }
  `);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].messageId, 'requireSharedClasses');
});
