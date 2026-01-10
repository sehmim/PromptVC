import { FileDiff, DiffHunk, DiffLine } from './types';

function decodeDiffEscape(char: string): string {
  switch (char) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case '"':
      return '"';
    case '\\':
      return '\\';
    default:
      return char;
  }
}

function stripDiffPrefix(value: string): string {
  if (value.startsWith('a/') || value.startsWith('b/')) {
    return value.slice(2);
  }
  return value;
}

function parseDiffHeader(line: string): { oldPath: string; newPath: string } | null {
  if (!line.startsWith('diff --git ')) {
    return null;
  }

  const remainder = line.slice('diff --git '.length);
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let isEscaped = false;

  for (let i = 0; i < remainder.length; i++) {
    const char = remainder[i];
    if (isEscaped) {
      current += decodeDiffEscape(char);
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  if (parts.length < 2) {
    return null;
  }

  const [oldPath, newPath] = parts;
  return {
    oldPath: stripDiffPrefix(oldPath),
    newPath: stripDiffPrefix(newPath),
  };
}

/**
 * Parses a git diff string into structured FileDiff objects
 */
export function parseDiff(diffText: string): FileDiff[] {
  if (!diffText || diffText.trim() === '') {
    return [];
  }

  const files: FileDiff[] = [];
  const lines = diffText.split('\n');

  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file diff
    if (line.startsWith('diff --git ')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }

      currentFile = null;
      currentHunk = null;

      const header = parseDiffHeader(line);
      if (header) {
        currentFile = {
          fileName: header.newPath,
          oldPath: header.oldPath,
          newPath: header.newPath,
          hunks: [],
          additions: 0,
          deletions: 0,
        };
      }
      continue;
    }

    if (!currentFile) continue;

    // File mode or index lines (skip)
    if (line.startsWith('index ') || line.startsWith('new file mode') ||
        line.startsWith('deleted file mode') || line.startsWith('---') ||
        line.startsWith('+++')) {
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const hunkMatch = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (hunkMatch) {
        oldLineNumber = parseInt(hunkMatch[1]);
        newLineNumber = parseInt(hunkMatch[2]);
      }

      currentHunk = {
        header: line,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    // Diff lines
    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'addition',
        content: line.substring(1),
        newLineNumber: newLineNumber++,
      });
      currentFile.additions++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'deletion',
        content: line.substring(1),
        oldLineNumber: oldLineNumber++,
      });
      currentFile.deletions++;
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line.substring(1),
        oldLineNumber: oldLineNumber++,
        newLineNumber: newLineNumber++,
      });
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" - ignore
      continue;
    }
  }

  // Push the last file and hunk
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Get language from file extension for syntax highlighting
 */
export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sql': 'sql',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'txt': 'plaintext',
  };

  return languageMap[ext || ''] || 'plaintext';
}
