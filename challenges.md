# Entity Resolution Challenges

## The Problem (3 distinct sub-problems)

### 1. Variants — "Rishikesh", "Rishi", "R. Kumar", "Rishikesh Kumar"
Same person, different surface forms → currently get different tokens

### 2. Misspellings — "Rishikesh" vs "Rishiksh" vs "Rishikessh"
Typos in source documents → different tokens for same entity

### 3. Ambiguity — "Rishikesh" = person OR city
Same string, different meaning → should get different tokens based on context

## Why naive solutions fail

| Approach | Problem |
|----------|---------|
| Edit distance alone | "John" and "Joan" are distance 1 but different people. "Rishi" to "Rishikesh" is distance 4 — too high to threshold. |
| Substring matching alone | "Al" matches "Alice", "Albert", "Algeria" — way too aggressive |
| Phonetic only (Soundex) | Works for misspellings but not for "Robert" → "Bob" |
| Pure NER | Catches ambiguity but can't link "Rishi" to "Rishikesh" — it just labels both as PERSON separately |

## My proposed solution: Vault-Aware Entity Resolution

A new resolution step between detection and vault lookup:

```
Current:
  Text → Detect → Vault lookup (exact match) → Pseudonymize

Proposed:
  Text → Detect → Resolve (fuzzy match against vault) → Pseudonymize
```

The resolver uses 4 signals, scored and combined:

### Signal 1: Jaro-Winkler similarity (best for short strings / names)

```
jaro_winkler("Rishikesh", "Rishiksh")  = 0.96  ← misspelling, high match
jaro_winkler("Rishikesh", "Rishi")     = 0.87  ← variant, decent match
jaro_winkler("Rishikesh", "Mumbai")    = 0.42  ← different, low match
jaro_winkler("John", "Joan")           = 0.88  ← danger zone!
```

### Signal 2: Prefix/containment check

```
"Rishi" is prefix of "Rishikesh"         → +0.2 bonus
"R. Kumar" contains part of "Rishikesh"  → no match (different structure)
"Al" is prefix of "Alice"               → rejected (len < 4, too short)
```

### Signal 3: Same category gate (hard requirement)

```
PERSON:"Rishikesh" vs PERSON:"Rishi"     → allowed to match
PERSON:"Rishikesh" vs LOCATION:"Rishikesh" → BLOCKED, different categories
```

This solves the "Rishikesh the person vs Rishikesh the city" problem. NER handles the category assignment, the resolver only matches within the same category.

### Signal 4: Document co-occurrence

```
If "Rishi" and "Rishikesh" appear in the SAME document
  and both are PERSON category
  → strong signal they're the same entity (+0.15 bonus)
```

### Combined scoring:

```
score = jaro_winkler_score
      + prefix_bonus (0.2 if one is prefix of other, len >= 4)
      + cooccurrence_bonus (0.15 if same document)

if score >= threshold (default 0.90) AND same_category:
    → reuse existing token
else:
    → create new token
```

Conservative threshold (0.90) means we'd rather split than wrongly merge. False split = two tokens for same person (cosmetic issue). False merge = two different people share a token (data leak).

### Plus: user-defined alias groups (override everything)

```toml
# In cloakpipe.toml
[[detection.aliases]]
group = ["Rishikesh Kumar", "Rishi", "Rishi kesh", "R. Kumar"]

[[detection.aliases]]
group = ["Robert Smith", "Bob Smith", "Bob", "Rob"]
```

This is the escape hatch. For enterprises who know their entities (employee lists, client rosters), they define exact alias groups. No fuzzy matching needed — direct lookup.

## What this solves

```
Input: "Rishi sent $500 to Rishikesh Kumar. Rishiksh (typo) confirmed."

Without resolver (current):
  Rishi          → PERSON_1
  Rishikesh Kumar → PERSON_2
  Rishiksh       → PERSON_3     ← 3 tokens, broken

With resolver (v0.6):
  Rishi          → PERSON_1
  Rishikesh Kumar → PERSON_1  (prefix match + same doc)
  Rishiksh       → PERSON_1  (jaro-winkler 0.96)  ← 1 token, correct
```

## What this doesn't solve (and shouldn't)

- **Nicknames**: "Robert" → "Bob" — no string similarity can catch this. Would need a lookup table of common nicknames. Could add later but not worth the complexity now.
- **Cross-language**: "Munich" vs "München" — out of scope.
- **Pronouns**: "he", "she" referring to an entity — that's full co-reference resolution, needs a language model. Way too heavy.

## Implementation in CloakPipe

```
New module: cloakpipe-core/src/resolver.rs

Depends on:
  - strsim crate (Jaro-Winkler, Levenshtein) — tiny, no dependencies
  - vault (to check existing entries)
  - detector output (categories)

Config additions:
  [detection.resolver]
  enabled = true
  threshold = 0.90
  prefix_matching = true
  min_prefix_len = 4

  [[detection.aliases]]
  group = ["Rishikesh", "Rishi"]
```

No new heavy dependencies. The strsim crate is 50KB pure Rust.

**Bottom line**: This is a real, buildable feature that directly addresses the feedback. Conservative by default (won't wrongly merge), configurable for power users (alias groups), and the architecture is clean — just a new step between detect and pseudonymize.
