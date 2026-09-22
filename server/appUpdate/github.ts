import type { GithubCredentials } from '../store'

/**
 * Minimal GitHub REST client for the in-app updater.
 *
 * Deliberately not the `@octokit` SDK: this needs four endpoints, the server
 * already targets a Node with global `fetch`, and adding a dependency here
 * would mean the updater's own `npm install` could break the updater.
 *
 * Every call is authenticated. The repository is private, so an anonymous
 * request 404s rather than 401s — which is why `describeError` treats 404 as
 * "the token can't see this repo" rather than "no such repo".
 */

const API = 'https://api.github.com'

/** GitHub rejects API requests without a User-Agent, so every call sends one. */
function headers(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ADHDisplay-Updater',
  }
}

/** A GitHub call that failed in a way worth showing an admin verbatim. */
export class GithubError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'GithubError'
    this.status = status
  }
}

/**
 * Turns a failed response into a message that names the fix. These three are
 * the failures an admin actually hits, and they are indistinguishable from
 * each other in a raw status code shown on its own.
 */
function describeError(status: number): string {
  if (status === 401) return 'GitHub rejected the token. It may be expired or mistyped.'
  if (status === 403) return 'GitHub refused the request — the token is valid but lacks Contents access, or the rate limit is exhausted.'
  if (status === 404) return 'Repository not found. A private repo returns 404 when the token cannot see it, so check the token has Contents: Read on this repository.'
  return `GitHub returned ${status}.`
}

async function call<T>(path: string, token: string, accept?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, { headers: headers(token, accept), signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new GithubError('Could not reach GitHub. Check the internet connection.', null)
  }
  if (!response.ok) throw new GithubError(describeError(response.status), response.status)
  return (accept === 'application/vnd.github.raw' ? await response.text() : await response.json()) as T
}

/** Identifies the commit a branch currently points at. */
export interface RemoteHead {
  sha: string
  message: string
  committedAt: string
}

export async function fetchHead(credentials: GithubCredentials, token: string): Promise<RemoteHead> {
  const body = await call<{ sha: string; commit: { message: string; committer: { date: string } } }>(
    `/repos/${credentials.owner}/${credentials.repo}/commits/${encodeURIComponent(credentials.branch)}`,
    token,
  )
  return { sha: body.sha, message: body.commit.message.split('\n')[0], committedAt: body.commit.committer.date }
}

/** One file in the remote tree: its repo path and the git blob SHA of its contents. */
export interface RemoteBlob {
  path: string
  sha: string
  size: number
}

/**
 * Lists every file in the repo at `sha` in a single request.
 *
 * This is what makes the updater cheap: one response describes ~1500 files
 * with their content hashes, so the diff against the install is computed
 * locally and only genuinely changed files are ever downloaded. The
 * alternative — a zipball — is ~1 GB for this repository, because the
 * Companion release APK and the QA screenshots are committed.
 */
export async function fetchTree(credentials: GithubCredentials, token: string, sha: string): Promise<RemoteBlob[]> {
  const body = await call<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated: boolean }>(
    `/repos/${credentials.owner}/${credentials.repo}/git/trees/${sha}?recursive=1`,
    token,
  )
  // A truncated tree would silently look like "every missing file was deleted
  // upstream", so refuse rather than act on a partial listing.
  if (body.truncated) throw new GithubError('The repository tree is too large for one request; the updater cannot diff it safely.', null)
  return body.tree.filter((entry) => entry.type === 'blob').map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size ?? 0 }))
}

/**
 * Downloads one file's contents by its blob SHA.
 *
 * Uses the blobs endpoint rather than `contents/<path>` because it is
 * addressed by hash: the bytes that come back are exactly the ones the diff
 * asked for, with no branch-moved-underneath race, and the result is verified
 * against that hash by the caller.
 */
export async function fetchBlob(credentials: GithubCredentials, token: string, sha: string): Promise<Buffer> {
  const body = await call<{ content: string; encoding: string }>(
    `/repos/${credentials.owner}/${credentials.repo}/git/blobs/${sha}`,
    token,
  )
  if (body.encoding !== 'base64') throw new GithubError(`Unexpected blob encoding "${body.encoding}".`, null)
  return Buffer.from(body.content, 'base64')
}

/** Reads one file's text at a given commit without downloading the tree. Used for the remote `package.json` version. */
export async function fetchFileAtRef(credentials: GithubCredentials, token: string, path: string, ref: string): Promise<string> {
  return call<string>(
    `/repos/${credentials.owner}/${credentials.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    token,
    'application/vnd.github.raw',
  )
}
