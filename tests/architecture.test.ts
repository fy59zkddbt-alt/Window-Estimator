import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

it('preserves inward dependencies and geometry/pricing separation', () => {
  const violations: string[] = [];
  for (const file of files(resolve('src'))) {
    const name = relative(resolve('src'), file).replaceAll('\\', '/');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function inspect(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const target = relative(resolve('src'), resolve(file, '..', specifier)).replaceAll('\\', '/');
        const local = specifier.startsWith('.');
        if (name.startsWith('domain/') && (!local || !target.startsWith('domain/'))) violations.push(name + ' → ' + specifier);
        if (name.startsWith('application/') && (!local || !/^(domain|application)\//.test(target))) violations.push(name + ' → ' + specifier);
        if (name.startsWith('ui/') && /^(infrastructure|domain\/(geometry|pricing))\//.test(target)) violations.push(name + ' → ' + specifier);
        if (name.startsWith('domain/geometry/') && target.startsWith('domain/pricing/')) violations.push(name + ' → ' + specifier);
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  expect(violations).toEqual([]);
});
