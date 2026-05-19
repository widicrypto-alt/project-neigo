> 🟡 **STATUS (apr 2026): PIPELINE SHIPPED.** ✅ dual MD/HTML · @neigo/shared/rich-content · renderAndSanitize · /api/preview/render · advanced mode · secret projection · comment MD subset. ❌ §8 turndown+shiki → [BACKLOG.md](BACKLOG.md) B2.13. 🟡 §3 anchor click safety · §4 R2_PUBLIC_DOMAINS env · §5 translate budget+cache-invalidation → [BACKLOG.md](BACKLOG.md) B1.2, B2.14, B2.15.

---

# PLANIMPv6 — Rich Content Pipeline, Translation, Advanced/Secret Modes

**Depends on:** PLANIMPv1 §4.4 (rendering pipeline) + §4.5 (translation table).
**Scope:** Cross-cutting concerns for how text is authored, stored, sanitized, rendered, translated, and selectively shown.

---

## 1. Storage Convention

For every rich-text field we store **both** `*_md` (canonical source) and `*_html` (pre-sanitized render cache).

Rule: never trust `*_html` from the client. Server regenerates on every write.

Fields covered:
- `characters.description_md/_html`
- `characters.example_dialog_md/_html`
- `characters.lore_sections_md[]` (each item has `body_md` + `body_html`)
- `stories.plot_md/_html`
- `stories.ai_plot_md/_html`
- `stories.ai_guidelines_md` (not rendered on detail page — internal use)
- `stories.ai_reminder_md` (internal)
- `stories.output_reminder_md` (internal, ≤ 100 tokens)
- `story_scenes.opening_md/_html`
- `comments.body_md/body_html`

Validation at write-time:
- `content_md` must parse as valid CommonMark (micromark throws on pathological inputs rarely; wrap in try/catch).
- `content_html` is derived — never accepted from client.

---

## 2. Shared Library: `@neigo/shared/rich-content`

```ts
// packages/shared/src/rich-content.ts
import { micromark } from 'micromark';
import sanitizeHtml, { IOptions } from 'sanitize-html';

export const RICH_CONTENT_PROFILES = {
  /** For detail pages, author descriptions, plot, comments. */
  default: {
    allowedTags: ['p','br','hr','h1','h2','h3','h4','blockquote','ul','ol','li','strong','em','u','s','code','pre','a','img','figure','figcaption','table','thead','tbody','tr','th','td','details','summary','iframe'],
    allowedAttributes: {
      a: ['href','title','target','rel'],
      img: ['src','alt','title','loading','width','height'],
      iframe: ['src','title','loading','allow','allowfullscreen','frameborder'],
      code: ['class'],
      th: ['scope'],
    },
    allowedSchemes: ['http','https','mailto'],
    allowedIframeHostnames: ['www.youtube.com','youtube.com','player.vimeo.com'],
    transformTags: {
      a: (tag, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener nofollow ugc' },
      }),
      img: (tag, attribs) => ({
        tagName: 'img',
        attribs: { ...attribs, loading: 'lazy' },
      }),
    },
    disallowedTagsMode: 'discard',
  } satisfies IOptions,

  /** For comments — stricter: no iframes, no images outside our CDN, no headings. */
  comment: {
    allowedTags: ['p','br','strong','em','u','s','code','pre','ul','ol','li','a','blockquote'],
    allowedAttributes: { a: ['href','title','target','rel'] },
    allowedSchemes: ['http','https','mailto'],
    transformTags: { a: /* same as default */ },
  } satisfies IOptions,
};

export function renderAndSanitize(md: string, profile: keyof typeof RICH_CONTENT_PROFILES = 'default'): {
  html: string;
  tokenCount: number;
} {
  const raw = micromark(md, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  const html = sanitizeHtml(raw, RICH_CONTENT_PROFILES[profile]);
  return { html, tokenCount: estimateTokensFast(md) };
}

export function escapePromptTemplateTokens(s: string): string {
  // Neutralize `{{user}}`, `{{char}}`, `{{scene:*}}` etc. in user-authored comment bodies.
  return s.replace(/\{\{[^}]+\}\}/g, (m) => m.replace('{{','&#123;&#123;').replace('}}','&#125;&#125;'));
}
```

`micromark` extensions: GFM (tables, strikethrough, task lists) enabled. No math/tikz to keep payload small.

### 2.1 Browser side

Only the **preview** in editors re-renders. Pattern:

```ts
// Client preview — identical API; sanitize-html does NOT run in the browser.
// Instead, the editor sends debounced POST /api/preview/render { md, profile } → { html }.
// Cache in memory by md hash to avoid thrash.
```

This keeps sanitizer server-side only. `POST /api/preview/render` is rate-limited to 30/min/user and capped at 50 KB MD input.

---

## 3. Anchor / Link Safety

Detail-page `<RichContent />` intercepts anchor clicks:
- External links → `window.open(href, '_blank', 'noopener,noreferrer')`.
- In-app links (e.g. `/characters/xyz`) → `router.push(href)`.
- `#anchor` → scrollIntoView.
- Unknown protocols stripped by the sanitizer already; defense-in-depth: block `javascript:` at click handler.

---

## 4. Image Embedding Rules

Only these hostnames allowed for `<img src>`:
- Our R2 public domain(s) — read from env `R2_PUBLIC_DOMAINS` (comma-separated).
- Any `https://` host as a fallback, but marked with `<img referrerpolicy="no-referrer">`.
- `http://` disallowed (upgraded or stripped).

Lazy-loaded, width/height attributes preferred (avoids CLS).

---

## 5. Translation Flow

### 5.1 Trigger

On detail pages, when `content.language !== user.preferredLanguage` (inferred from `Accept-Language` if not logged in):

```
┌─ Konten ini awalnya ditulis dalam Inggris. ──────────┐
│ [ Terjemahkan ke Bahasa Indonesia ]                  │
└───────────────────────────────────────────────────────┘
```

Click → `POST /api/translate { entityType, entityId, fieldKey, target }`.

### 5.2 Server

1. Lookup cache in `content_translations` (PK covers `(entityType, entityId, fieldKey, target_lang)`).
2. Cache miss → call OpenRouter `gpt-4o-mini` with prompt:
   ```
   You are a translation engine. Translate the following Markdown from {sourceLang} to {targetLang}
   preserving formatting, emphasis, lists, code blocks, and any {{template}} tokens VERBATIM.
   Do not add commentary. Output Markdown only.
   ---
   {content_md}
   ```
3. Sanitize translated MD → HTML via default profile.
4. Insert into cache with cost tracking.
5. Return `{ contentMd, contentHtml, cached, costUsd, tokensIn, tokensOut }`.

### 5.3 Budget

`user.metadata.translationsMonthlyUsd` defaults to $0.50. Exceeding it returns `402 Payment Required` with tier upsell.

### 5.4 Cache invalidation

Translations invalidated when the corresponding canonical `*_md` changes. Implementation: entity update endpoints run `DELETE FROM content_translations WHERE entity_type=? AND entity_id=? AND field_key=?`.

---

## 6. Advanced Mode (viewer side)

`user.metadata.advancedMode: boolean` persisted server-side + `localStorage['neigo.advanced']` for quick toggle.

Effects on detail pages:
- Reveals "Deskripsi Prompt" tab on character detail (if not secret).
- Reveals "Plot Prompt (AI)", "Pedoman Prompt", "Pengingat AI", "Pengingat Output AI" callouts on story detail (if not secret).
- Shows raw MD source in a collapsible "Lihat sumber Markdown" toggle under rendered content.

Toggle component: `<AdvancedModeToggle />` in the global topbar (settings menu item). POST `/api/me/metadata { advancedMode: true }`.

---

## 7. Secret Mode (author side)

`stories.is_secret_mode` / `characters.is_secret_prompt_hidden`: when true, **server-side projection** strips advanced/prompt fields from API responses for non-owners.

Never rely on the client to hide these. Implement in the `GET /api/stories/:id` and `GET /api/characters/:id` handlers.

---

## 8. Markdown / HTML Author Experience

- Editor uses `<MarkdownEditor />` from PLANIMPv4.
- Paste handling: HTML paste runs through a **client-side** converter (`turndown`) to produce clean MD; sanitization happens server-side as usual.
- Code blocks preserved; syntax highlighting on detail page via `shiki` (server-side highlight during `renderAndSanitize`; embed class names).

---

## 9. Comment Markdown Subset

Only the `comment` profile applies:
- No headings beyond lists/quotes.
- No images (link previews later).
- No iframes.
- Mentions: `@handle` → link to `/@handle`; rendered by a post-processor that scans text nodes.

Rate limit: 5/min/user. Body ≤ 4 KB source.

---

## 10. Accessibility Notes

- Rich content containers get `role="article"` only when top-level for a detail.
- Headings (`h2`, `h3`, `h4` only) sequentially ordered; sanitize-html downgrades out-of-order headings.
- Images require `alt`; empty alt allowed for decorative only.
- Color-coded token-budget chips paired with `aria-label`.

---

## 11. Acceptance Criteria

1. Pasting a block of Google-Docs HTML into any MD editor yields clean MD source.
2. Saving a description with a `<script>` tag produces an `*_html` without any script tag.
3. YouTube and Vimeo iframes render; other iframe sources stripped.
4. Translation call caches; the second click returns `cached=true` with 0 tokensIn.
5. Secret mode: a non-owner's `GET /api/stories/:id` response lacks `aiPlotHtml`, `aiGuidelinesMd`, etc.
6. Advanced toggle without secret reveals callouts on detail page instantly (no page reload needed — React Query invalidation).
7. MD editor token counter matches server-computed count within ±2 tokens.
