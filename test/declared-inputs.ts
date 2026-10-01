/**
 * The inputs each hand-written method DECLARES, read from src/client.ts with the
 * TypeScript compiler: for `customers = { update: (id: string, patch: {...}) => … }`,
 * the parameters and every property of their object types. The drift test calls each
 * method with all of them filled in, so the request it records is the most a caller
 * of that signature can ever send.
 */
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** One argument list to call a method with (several when a parameter is a union of
 *  object shapes: one call per shape). */
export type ArgList = unknown[];

const clientFile = fileURLToPath(new URL('../src/client.ts', import.meta.url));

function isStringish(t: ts.Type): boolean {
  if (t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.EnumLike)) return true;
  return t.isUnion() && t.types.every((m) => isStringish(m));
}
function isNumberish(t: ts.Type): boolean {
  if (t.flags & ts.TypeFlags.NumberLike) return true;
  return t.isUnion() && t.types.every((m) => isNumberish(m));
}
function isBooleanish(t: ts.Type): boolean {
  if (t.flags & ts.TypeFlags.BooleanLike) return true;
  return t.isUnion() && t.types.every((m) => isBooleanish(m));
}

/** A value of the type, with every property of an object type set (to depth 2). */
function sample(checker: ts.TypeChecker, type: ts.Type, depth: number): unknown {
  const t = checker.getNonNullableType(type);
  if (isStringish(t)) {
    // a literal union ('now' | 'period_end'): its first member, so it stays valid
    if (t.isUnion() && t.types[0]!.isStringLiteral()) return t.types[0]!.value;
    if (t.isStringLiteral()) return t.value;
    return 'x';
  }
  if (isNumberish(t)) return 1;
  if (isBooleanish(t)) return true;
  if (checker.isArrayType(t) || checker.isTupleType(t)) {
    const [elem] = checker.getTypeArguments(t as ts.TypeReference);
    return depth > 0 && elem ? [sample(checker, elem, depth - 1)] : [];
  }
  if (t.isUnion()) return sample(checker, t.types[0]!, depth);
  if (t.flags & ts.TypeFlags.Object || t.isIntersection()) {
    if (depth <= 0) return {};
    const out: Record<string, unknown> = {};
    for (const p of checker.getPropertiesOfType(t)) {
      const decl = p.valueDeclaration ?? p.declarations?.[0];
      const pt = decl ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getDeclaredTypeOfSymbol(p);
      if (checker.getNonNullableType(pt).getCallSignatures().length > 0) continue; // a method, not data
      out[p.name] = sample(checker, pt, depth - 1);
    }
    return out;
  }
  return 'x';
}

/**
 * `namespace.method` → the argument lists to call it with. A string parameter is an id
 * in the path unless the method sends it in the body: "__<i>__" stands for both, and
 * the test maps "__<i>__" in a path back to "{}".
 */
export function declaredInputs(): Map<string, ArgList[]> {
  const program = ts.createProgram([clientFile], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: ['node'],
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(clientFile);
  if (!sf) throw new Error(`cannot load ${clientFile}`);
  const out = new Map<string, ArgList[]>();
  const visitClass = (cls: ts.ClassDeclaration) => {
    for (const member of cls.members) {
      if (!ts.isPropertyDeclaration(member) || !member.initializer) continue;
      if (!ts.isObjectLiteralExpression(member.initializer)) continue;
      const ns = member.name.getText(sf);
      for (const prop of member.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const fn = prop.initializer;
        if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) continue;
        const name = `${ns}.${prop.name.getText(sf)}`;
        // one list of candidate values per parameter; union-of-objects params give several
        const perParam: unknown[][] = fn.parameters.map((p, i) => {
          const t = checker.getNonNullableType(checker.getTypeAtLocation(p));
          if (isStringish(t)) {
            const literal = t.isStringLiteral() ? t.value : t.isUnion() && t.types[0]!.isStringLiteral() ? t.types[0]!.value : null;
            return [literal ?? `__${i}__`];
          }
          if (t.isUnion() && t.types.some((m) => m.flags & ts.TypeFlags.Object)) {
            return t.types.filter((m) => m.flags & ts.TypeFlags.Object).map((m) => sample(checker, m, 2));
          }
          return [sample(checker, t, 2)];
        });
        const lists: ArgList[] = [[]];
        for (const candidates of perParam) {
          const next: ArgList[] = [];
          for (const l of lists) for (const c of candidates) next.push([...l, c]);
          lists.splice(0, lists.length, ...next);
        }
        out.set(name, lists);
      }
    }
  };
  ts.forEachChild(sf, (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'PlugipayClient') visitClass(node);
  });
  return out;
}
