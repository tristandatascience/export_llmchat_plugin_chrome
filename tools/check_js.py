# -*- coding: utf-8 -*-
"""Vérificateur d'équilibre des délimiteurs JS (chaînes/commentaires ignorés)."""

import sys

PAIRS = {')': '(', ']': '[', '}': '{'}


def check(path):
    src = open(path, encoding='utf-8').read()
    i, n = 0, len(src)
    stack = []
    line = 1
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1
            i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            if j < 0:
                return '%s: L%d commentaire /* non ferme' % (path, line)
            line += src.count('\n', i, j)
            i = j + 2
            continue
        if c in ('"', "'"):
            quote = c
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == quote:
                    break
                if src[j] == '\n':
                    return "%s: L%d chaine %s non fermee" % (path, line, quote)
                j += 1
            if j >= n:
                return "%s: L%d chaine %s non fermee" % (path, line, quote)
            i = j + 1
            continue
        if c == '`':
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '`':
                    break
                j += 1
            if j >= n:
                return '%s: L%d template literal non ferme' % (path, line)
            line += src.count('\n', i, j)
            i = j + 1
            continue
        if c in '([{':
            stack.append((c, line))
            i += 1
            continue
        if c in ')]}':
            if not stack or stack[-1][0] != PAIRS[c]:
                got = stack[-1][0] if stack else '?'
                return '%s: L%d %r en trop (fermeture attendue: %r)' % (path, line, c, got)
            stack.pop()
            i += 1
            continue
        i += 1
    if stack:
        return "%s: %r ouvert L%d jamais ferme" % (path, stack[-1][0], stack[-1][1])
    return '%s: OK (%d lignes)' % (path, len(src.splitlines()))


if __name__ == '__main__':
    for f in sys.argv[1:]:
        print(check(f))
