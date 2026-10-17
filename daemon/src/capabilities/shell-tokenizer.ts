/**
 * Shell Tokenizer — structured argv-level parsing of shell command strings.
 *
 * A small POSIX-flavored lexer (with Windows cmd concessions) that yields the
 * primary binary, argument list, pipe topology, redirection markers, and
 * substitution flags. Risk rules evaluate this structure instead of fragile
 * substring matching, which closes classic obfuscation bypasses such as
 * cu"rl" … | ba"sh", cu\rl … | bash, or env-var prefixing (FOO=1 rm -rf /).
 *
 * Failure semantics: an unparsable command (e.g. unterminated quote) still
 * returns its partial structure plus a parseError — callers decide whether to
 * fail closed on it.
 */

export interface ShellSegment {
  /** Resolved binary name for this stage (lowercased, path-stripped). */
  binary: string;
  /** Arguments for this stage (quotes resolved, escapes unfolded). */
  args: string[];
}

export interface ParsedShellCommand {
  /** Binary of the first pipeline stage. Empty string when no words parse. */
  binary: string;
  /** Arguments of the first pipeline stage. */
  args: string[];
  /** Every stage of the pipeline (split on | ; && || & newlines). */
  segments: ShellSegment[];
  /** True when at least one pipe operator is present. */
  hasPipe: boolean;
  /** True when > >> < style redirection is present. */
  hasRedirection: boolean;
  /** True when $( ) or backtick command substitution is present. */
  hasSubstitution: boolean;
  /** Set when the command could not be fully parsed (e.g. unterminated quote). */
  parseError?: string;
}

interface LexedToken {
  text: string;
  kind: "word" | "operator";
}

const PATH_SEPARATORS = /[\\/]/;
const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];

export function parseShellCommand(rawCommand: string): ParsedShellCommand {
  const src = rawCommand ?? "";
  const tokens: LexedToken[] = [];
  let current = "";
  let hasSubstitution = false;
  let hasRedirection = false;
  let parseError: string | undefined;
  let i = 0;

  const flushWord = (): void => {
    if (current.length > 0) {
      tokens.push({ text: current, kind: "word" });
      current = "";
    }
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      flushWord();
      // Newlines separate commands like ";".
      if (ch === "\n") tokens.push({ text: ";", kind: "operator" });
      i += 1;
      continue;
    }

    // Backslash (POSIX) and caret (cmd) escapes outside quotes.
    if (ch === "\\" || ch === "^") {
      if (i + 1 < src.length) {
        current += src[i + 1];
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (ch === "'") {
      const end = src.indexOf("'", i + 1);
      if (end === -1) {
        parseError = "unterminated single quote";
        break;
      }
      current += src.slice(i + 1, end);
      i = end + 1;
      continue;
    }

    if (ch === '"') {
      i += 1;
      let closed = false;
      while (i < src.length) {
        const c = src[i];
        if (c === "\\") {
          const next = src[i + 1];
          if (next === '"' || next === "\\" || next === "$") {
            current += next;
            i += 2;
          } else {
            current += c;
            i += 1;
          }
          continue;
        }
        if (c === '"') {
          closed = true;
          i += 1;
          break;
        }
        current += c;
        i += 1;
      }
      if (!closed) {
        parseError = "unterminated double quote";
        break;
      }
      continue;
    }

    if (ch === "$" && src[i + 1] === "(") {
      hasSubstitution = true;
      current += "$(";
      i += 2;
      continue;
    }

    if (ch === "`") {
      hasSubstitution = true;
      i += 1;
      continue;
    }

    if (ch === "<" || ch === ">") {
      flushWord();
      let op = ch;
      i += 1;
      while (src[i] === ">") {
        op += ">";
        i += 1;
      }
      // Fold fd-duplication suffix: >&1, >&2, 2>&1 …
      if (src[i] === "&") {
        op += "&";
        i += 1;
        while (/[0-9]/.test(src[i] ?? "")) {
          op += src[i];
          i += 1;
        }
      }
      tokens.push({ text: op, kind: "operator" });
      hasRedirection = true;
      continue;
    }

    if (ch === "|" || ch === "&" || ch === ";") {
      flushWord();
      let op = ch;
      if ((ch === "|" || ch === "&") && src[i + 1] === ch) {
        op += ch;
        i += 2;
      } else {
        i += 1;
      }
      tokens.push({ text: op, kind: "operator" });
      continue;
    }

    current += ch;
    i += 1;
  }

  flushWord();

  // Fold a trailing digit into an adjacent redirect (2>, 1>>) — cosmetic only.
  const segments: ShellSegment[] = [];
  let hasPipe = false;
  let stage: string[] = [];
  for (const token of tokens) {
    if (token.kind === "operator") {
      if (token.text === "|") hasPipe = true;
      if (stage.length > 0) {
        segments.push(toSegment(stage));
        stage = [];
      }
      continue;
    }
    // A bare number immediately before a redirect is an fd prefix, not a stage.
    if (/^\d+$/.test(token.text) && isNextOperatorRedirect(tokens, token)) {
      continue;
    }
    stage.push(token.text);
  }
  if (stage.length > 0) segments.push(toSegment(stage));

  const first = segments[0] ?? { binary: "", args: [] };
  return {
    binary: first.binary,
    args: first.args,
    segments,
    hasPipe,
    hasRedirection,
    hasSubstitution,
    ...(parseError ? { parseError } : {}),
  };
}

function isNextOperatorRedirect(tokens: LexedToken[], token: LexedToken): boolean {
  const index = tokens.indexOf(token);
  const next = tokens[index + 1];
  return !!next && next.kind === "operator" && (next.text.startsWith(">") || next.text.startsWith("<"));
}

function toSegment(words: string[]): ShellSegment {
  // Leading VAR=value assignments modify the environment, not the binary.
  let start = 0;
  while (
    start < words.length - 1 &&
    /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[start])
  ) {
    start += 1;
  }
  return {
    binary: normalizeBinaryName(words[start] ?? ""),
    args: words.slice(start + 1),
  };
}

/**
 * Resolve a raw token to a comparable binary name:
 * "C:\Program Files\Git\bin\git.exe" → "git", "./node_modules/.bin/vitest" → "vitest".
 */
export function normalizeBinaryName(token: string): string {
  if (!token) return "";
  const base = token.split(PATH_SEPARATORS).pop() ?? token;
  const lower = base.toLowerCase();
  for (const ext of WINDOWS_EXECUTABLE_EXTENSIONS) {
    if (lower.endsWith(ext)) return lower.slice(0, -ext.length);
  }
  return lower;
}
