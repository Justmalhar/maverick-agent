---
name: pr-review
description: Review code changes for bugs, security issues, and maintainability problems. Use this skill to review pull requests on GitHub or Bitbucket, evaluate local git diffs, or audit code changes before committing. Language-agnostic—works with any programming language. Automatically detects GitHub vs Bitbucket repos and fetches diffs. Flags issues with suggested code fixes.
compatibility: Requires git, curl (for Bitbucket API), and optional gh CLI (GitHub)
---

# PR Review Skill

This skill helps you systematically review code changes using rigorous, author-friendly criteria. It detects bugs, security issues, and maintainability problems while being respectful of the author's intent.

## When to Use

Invoke `/pr-review` when:
- You need to review a GitHub or Bitbucket pull request
- You want to audit local code changes before committing
- You're evaluating a code diff for correctness and quality
- You need consistent, evidence-based code review

## Review Principles

You are acting as a code reviewer for proposed changes. Your goal is to flag issues that:

1. **Are meaningful** — Impact accuracy, performance, security, or maintainability
2. **Are discrete and actionable** — Not vague systemic issues; clearly fixable
3. **Match the codebase rigor** — Don't demand perfect comments in a repo of one-off scripts
4. **Were introduced in this change** — Not pre-existing bugs elsewhere
5. **The author would want to fix** — Not just nitpicks; they'd agree it's a real problem
6. **Don't rely on assumptions** — State the exact scenario where the bug manifests
7. **Are provably impactful** — If claiming something affects other code, identify those places
8. **Aren't intentional choices** — Not obviously a deliberate design decision by the author

**Default behavior**: Output all findings the author would fix if aware. If nothing qualifies, say so clearly.

## Getting the Diff

### GitHub PR (Requires `gh` CLI)
```bash
gh pr diff <PR-NUMBER> --repo <OWNER>/<REPO>
```

### Bitbucket PR (Requires authentication)
```bash
# Find PR ID
curl -s -u "$BB_USER:$BB_PASSWORD" \
  "https://api.bitbucket.org/2.0/repositories/<WORKSPACE>/<REPO>/pullrequests" \
  | jq '.values[] | {id, title}'

# Get diff
curl -s -u "$BB_USER:$BB_PASSWORD" \
  "https://api.bitbucket.org/2.0/repositories/<WORKSPACE>/<REPO>/pullrequests/<PR-ID>/diff" \
  > pr.diff
```

### Local Git Diff
```bash
# Diff against main/develop
git diff main..HEAD > pr.diff

# Or staged changes
git diff --cached > pr.diff
```

### Auto-Detect Repo Type
```bash
REMOTE=$(git remote get-url origin)

if [[ $REMOTE == *"github.com"* ]]; then
  echo "Detected GitHub"
  OWNER_REPO=$(echo $REMOTE | sed 's/.*github.com[:/]//' | sed 's/\.git$//')
  gh pr diff <NUMBER> --repo $OWNER_REPO
elif [[ $REMOTE == *"bitbucket.org"* ]]; then
  echo "Detected Bitbucket"
  # Use Bitbucket API above
fi
```

## Review Structure

For each issue found:

1. **Clear issue title** — What went wrong?
2. **Description** — Why it matters, when it manifests, severity if context-dependent
3. **Location** — File path and line number
4. **Suggested fix** — Code block with corrected code (exact indentation preserved)

## Comment Style

- Explain the **why**, not just the **what**
- Clearly state the scenario where the bug occurs
- Be matter-of-fact, not accusatory or overly flattering
- Keep it brief — one paragraph max
- Use inline code or code blocks for snippets

**Good example:**
> If the user closes the modal before the async operation completes, `setData` will be called on an unmounted component, causing a memory leak. The effect should return a cleanup function that cancels the request.

**Poor example:**
> Maybe consider possibly preventing this from potentially happening in certain edge cases?

## Code Fix Format

Wrap suggested fixes in markdown code blocks, preserving exact indentation:

````markdown
```typescript
// Corrected code
const safeAccess = value?.property ?? defaultValue;
```
````

For multi-line fixes, include surrounding context (1-2 lines before/after) so the location is obvious.

## Output Format

```markdown
# PR Review

## Summary
[Brief overview: issues found, overall assessment]

## Findings

### #1 [Issue Title]
[1-paragraph description: what, why, when]

**File:** `src/path/to/file.ts:line-number`

```javascript
// Suggested fix
corrected_code_here();
```

---

### #2 [Next Issue]
[Same structure]

---

## No Issues Found
[If truly none: state clearly, no need to repeat]
```

## Examples of Issues to Flag

**Null/undefined reference:**
```
File: src/auth.ts:52

setUser() is called without checking if session is defined. getSession() can return null, but line 52 accesses session.userId unconditionally.

```typescript
if (session) {
  setUser(session.userId);
}
```
```

**Unhandled promise rejection:**
```
File: src/hooks/useData.ts:18

The fetch promise has no catch handler. If the network fails, the error is unhandled and React won't display an error state.

```typescript
try {
  const data = await fetch(url).then(r => r.json());
  setData(data);
} catch (error) {
  setError(error);
  console.error('Failed to load data:', error);
}
```
```

**Resource leak:**
```
File: src/components/Timer.tsx:15

The interval is never cleared, so it continues running after unmount. Each mount adds another interval, eventually consuming memory.

```typescript
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);
```
```

**Security issue (hardcoded secret):**
```
File: .env.example:3

Hardcoded API key in code will be committed. Use environment variables.

```bash
API_KEY=sk_live_... # Move to .env, add .env to .gitignore
```
```

**Type mismatch:**
```
File: src/utils.ts:42

Function expects a number but receives a string. The API returns price as a string, but calculateTax() expects a number.

```typescript
const tax = calculateTax(parseFloat(price));
```
```

## Categories to Consider (Not Exhaustive)

- **Null safety** — Missing guards before property access
- **Error handling** — Unhandled promises, missing try/catch
- **Type safety** — Type mismatches, unsafe `any` types
- **Performance** — Unnecessary loops, duplicate queries, inefficient algorithms
- **Security** — SQL injection, XSS, hardcoded secrets, auth bypass
- **Concurrency** — Race conditions, stale closures, mutation ordering
- **Memory** — Uncleared intervals, event listeners, subscriptions
- **API contracts** — Calls don't match documented interface
- **Dead code** — Unreachable, unused imports, orphaned functions

## What NOT to Flag

- Style issues that don't obscure meaning (whitespace, naming preferences)
- Pre-existing bugs unrelated to this change
- Speculative issues (e.g., "this might break if someone...")
- Issues that demand rigor inconsistent with the rest of the codebase
- Intentional design choices the author clearly made
