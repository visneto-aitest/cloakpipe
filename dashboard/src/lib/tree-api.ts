/**
 * CloakTree API client — calls the Rust proxy's tree endpoints
 * for vectorless, LLM-driven document retrieval.
 */

export interface TreeIndex {
  id: string
  source: string
  description: string | null
  total_pages: number
  node_count: number
  max_depth: number
  navigation: NavigationItem[]
}

export interface NavigationItem {
  id: string
  title: string
  summary: string | null
  depth: number
  pages: [number, number]
  has_children: boolean
}

export interface TreeSearchResult {
  node_ids: string[]
  reasoning: string
  confidence: number | null
  extracted: ExtractedItem[]
}

export interface ExtractedItem {
  node_id: string
  title: string
  text: string
  pages: [number, number]
}

export interface TreeQueryResult {
  answer: string
  sources: ExtractedItem[]
  tree_id: string
  reasoning: string
}

export interface TreeListItem {
  id: string
  source: string
  description: string | null
  total_pages: number
  node_count: number
}

/**
 * Build a tree index from text content.
 */
export async function indexText(
  proxyUrl: string,
  name: string,
  text: string
): Promise<TreeIndex> {
  const res = await fetch(`${proxyUrl}/tree/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, text }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * List all tree indices.
 */
export async function listTrees(proxyUrl: string): Promise<TreeListItem[]> {
  const res = await fetch(`${proxyUrl}/tree/list`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Get a tree index with its navigation map.
 */
export async function getTree(proxyUrl: string, treeId: string): Promise<TreeIndex> {
  const res = await fetch(`${proxyUrl}/tree/${treeId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Search a tree index.
 */
export async function searchTree(
  proxyUrl: string,
  treeId: string,
  query: string
): Promise<TreeSearchResult> {
  const res = await fetch(`${proxyUrl}/tree/${treeId}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Full RAG pipeline: index (if needed) + search + extract + answer.
 */
export async function queryTree(
  proxyUrl: string,
  params: {
    text?: string
    name?: string
    tree_id?: string
    query: string
  }
): Promise<TreeQueryResult> {
  const res = await fetch(`${proxyUrl}/tree/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

/**
 * Delete a tree index.
 */
export async function deleteTree(proxyUrl: string, treeId: string): Promise<void> {
  const res = await fetch(`${proxyUrl}/tree/${treeId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}
