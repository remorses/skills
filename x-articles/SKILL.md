---
name: x-articles
repo: remorses/skills
description: >
  Edit x.com (Twitter) long-form article drafts reliably. Use this for
  markdown imports, bulk formatting, code blocks, headings, lists, and
  repeated inline styling. Inspect and validate with Playwriter, but prefer
  x.com (Twitter) article GraphQL mutations for deterministic updates.
---

<!-- Skill for editing x.com (Twitter) article drafts through Playwriter plus content-state mutations. -->

Use this skill when editing long-form article drafts on `x.com/compose/articles`
(Twitter Articles).

## Read Playwriter First

Before using this skill, read the `playwriter` skill and run:

```bash
playwriter skill
```

This skill assumes Playwriter is already set up and connected to the user's
existing Chrome session.

Read the full output. Do not pipe it through `head`, `tail`, or other
truncation commands.

## Core idea

Use Playwriter for three things:

1. connect to the already-open x.com (Twitter) article draft
2. inspect the editor and capture one real network mutation
3. validate the final rendered result after updates

For anything bigger than a tiny tweak, do **not** rely on manual typing inside
the editor. Generate the article `content_state` locally and send the same
GraphQL mutation x.com (Twitter) already uses.

## Editor model

The article body is represented as a `content_state` object with two main
parts:

- `blocks`: ordered content blocks
- `entity_map`: supporting entities, especially code blocks

Important block types:

- `unstyled` — normal paragraph
- `header-two` — section subheading
- `ordered-list-item` — numbered list item
- `atomic` — embedded block like a markdown code block

Important entity type:

- `MARKDOWN` — used for code blocks, with the markdown fence stored in
  `entity_map[*].value.data.markdown`

Longer example `content_state`:

````json
{
  "blocks": [
    {
      "key": "k0",
      "text": "event sourcing for application state",
      "type": "header-two",
      "data": {},
      "entity_ranges": [],
      "inline_style_ranges": []
    },
    {
      "key": "k1",
      "text": "your clanker loves state",
      "type": "unstyled",
      "data": {},
      "entity_ranges": [],
      "inline_style_ranges": [
        { "offset": 19, "length": 5, "style": "Bold" }
      ]
    },
    {
      "key": "k2",
      "text": "doubles your final app state",
      "type": "ordered-list-item",
      "data": {},
      "entity_ranges": [],
      "inline_style_ranges": []
    },
    {
      "key": "k3",
      "text": "doubles your bugs",
      "type": "ordered-list-item",
      "data": {},
      "entity_ranges": [],
      "inline_style_ranges": []
    },
    {
      "key": "k4",
      "text": " ",
      "type": "atomic",
      "data": {},
      "entity_ranges": [
        { "key": 0, "offset": 0, "length": 1 }
      ],
      "inline_style_ranges": []
    },
    {
      "key": "k5",
      "text": "if you can derive it, don't store it.",
      "type": "unstyled",
      "data": {},
      "entity_ranges": [],
      "inline_style_ranges": [
        { "offset": 7, "length": 6, "style": "Bold" }
      ]
    }
  ],
  "entity_map": [
    {
      "key": "0",
      "value": {
        "type": "MARKDOWN",
        "mutability": "Mutable",
        "data": {
          "markdown": "```typescript\nfunction shouldShowFooter() {\n  return true\n}\n```"
        }
      }
    }
  ]
}
````

This is the minimum mental model:

- `blocks` is the article in order
- each paragraph, heading, and list item is a separate block
- code blocks are `atomic` blocks that point into `entity_map`
- inline bold lives in `inline_style_ranges`

## Recommended workflow

### 1. Open or locate the draft

Find the existing article editor page in the connected browser. The URL format
is:

```text
https://x.com/compose/articles/edit/<article_id>
```

Always parse and keep the numeric `article_id`. The content mutation needs it.

To create a **new** draft, open `https://x.com/compose/articles` and click the
`Write` link (`[data-testid="empty_state_button_text"]`). It fires
`ArticleEntityDraftCreate` and navigates to `/compose/articles/edit/<id>`. The
`create` button next to the `Articles` heading did not navigate in one test.
Use `Write`.

Set the title by typing into `getByRole("textbox", { name: "Add a title" })`.
That fires `ArticleEntityUpdateTitle` on its own, so a title never needs a
direct mutation.

Example Playwriter check:

```bash
playwriter session new
playwriter -s 1 -e '
state.page = context.pages().findLast((p) => {
  return p.url().includes("/compose/articles/edit/")
})
if (!state.page) {
  throw new Error("No article editor page found")
}
console.log(state.page.url())
'
```

### 2. Explore with small manual edits first

Use the UI to learn how the editor reacts before doing bulk updates. Good
exploration tasks:

- add one paragraph
- convert one block to `Sottotitolo`
- insert one code block
- bold one word in one paragraph

After each change, inspect the rendered HTML with `getCleanHTML()`.

Example validation command:

```bash
playwriter -s 1 -e '
state.page = context.pages().findLast((p) => {
  return p.url().includes("/compose/articles/edit/")
})
console.log(
  await getCleanHTML({
    locator: state.page.locator("[data-testid=\"composer\"]"),
    showDiffSinceLastCall: false,
  }),
)
'
```

### 3. Capture real network traffic

Watch GraphQL requests while making one tiny manual change. This gives you the
exact mutation names and payload shapes used by the current x.com (Twitter)
editor.

The two important mutations found in this session were:

- `ArticleEntityUpdateTitle`
- `ArticleEntityUpdateContent`

The content mutation URL looked like:

```text
https://x.com/i/api/graphql/<queryId>/ArticleEntityUpdateContent
```

The exact `queryId` can change over time. Do not hardcode it blindly without
first confirming it from a real request in the current session.

Example request logger:

```bash
playwriter -s 1 -e '
state.page = context.pages().findLast((p) => {
  return p.url().includes("/compose/articles/edit/")
})
state.requests = []
// never removeAllListeners(): it also drops playwriter's own listeners
if (state.onReq) state.page.off("request", state.onReq)
state.onReq = (req) => {
  if (req.url().includes("/graphql/") && req.method() === "POST") {
    state.requests.push({
      url: req.url(),
      headers: req.headers(),
      postData: req.postData(),
    })
  }
}
state.page.on("request", state.onReq)
console.log(
  "Ready: now make one tiny manual edit in the page, then rerun this command to inspect state.requests",
)
'
```

### 4. Use direct content updates for bulk work

Once you know the current mutation shape, generate the full `content_state`
locally and send the content update directly.

This is the reliable path for:

- full markdown import
- replacing large sections
- converting paragraphs to ordered lists
- adding one bold keyword per paragraph
- fixing code block languages

Concrete pattern:

1. build `content_state` in a local JSON file
2. take the captured `ArticleEntityUpdateContent` request, parse its
   `postData`, and replace only `variables.content_state`
3. send it to the captured URL with the captured headers
4. reload the page

**Replay the captured request. Do not rebuild the payload by hand.** The
`features` flags and `x-twitter-client-language` change per account and over
time. A hand-written flag set already drifted once
(`responsive_web_profile_redirect_enabled` flipped from `false` to `true`).
`x-client-transaction-id` is not needed; the replay returned 200 without it.

### 5. Reload and validate

After every direct mutation:

1. reload the article editor page
2. inspect `getCleanHTML()`
3. search for expected headings, list items, bold splits, and code labels

Do not trust the visual editor alone.

Example reload + search:

```bash
playwriter -s 1 -e '
state.page = context.pages().findLast((p) => {
  return p.url().includes("/compose/articles/edit/")
})
await state.page.reload({ waitUntil: "domcontentloaded" })
await waitForPageLoad({ page: state.page, timeout: 8000 })
console.log(
  await getCleanHTML({
    locator: state.page.locator("[data-testid=\"composer\"]"),
    search: /debugging with event streams|typescript|ordered-list-item/i,
    showDiffSinceLastCall: false,
  }),
)
'
```

## Block type cheatsheet

### Paragraphs

Use:

```json
{
  "type": "unstyled",
  "text": "your paragraph text"
}
```

### Subheadings

Use:

```json
{
  "type": "header-two",
  "text": "debugging with event streams"
}
```

### Numbered lists

Each item is its own block:

```json
{
  "type": "ordered-list-item",
  "text": "doubles your bug surface"
}
```

### Bullet lists

Same as numbered lists, with `unordered-list-item`. It renders as `<ul><li>`.

### Inline code

There is **no inline code style**. Strip markdown backticks and send plain
text.

### Code blocks

Code blocks are not plain text blocks. They are:

1. one `atomic` block in `blocks`
2. one `MARKDOWN` entity in `entity_map`

The atomic block points to the entity with `entity_ranges`.

The entity markdown should include the full fence, for example:

````text
```typescript
const x = 1
```
````

If you want the visible language label to say `typescript`, the stored fence
must be ` ```typescript `, not ` ```ts `.

## Inline styles

Bold text is represented with `inline_style_ranges` inside a block.

Important session learning:

- the style name is `Bold`
- not `BOLD`
- the **request** uses snake_case (`inline_style_ranges`, `entity_ranges`,
  `entity_map`). The **response** echoes camelCase (`inlineStyleRanges`).
  Always send snake_case

Example:

```json
{
  "text": "your clanker loves state",
  "inline_style_ranges": [
    { "offset": 19, "length": 5, "style": "Bold" }
  ]
}
```

Always calculate offsets against the raw block text exactly as stored.

## Known UI pitfalls

The manual editor flow has several traps:

### Heading inheritance

After creating a heading, pressing `Enter` once can keep the next block in the
same heading style. To reset to a paragraph, press `Enter` again.

### Post-code-block cursor placement

Typing after a code block is unreliable. The editor can:

- append text to the wrong block
- split text unexpectedly
- create stray headings
- leave part of a sentence in one block and the rest in another

For anything more than a tiny manual tweak, use direct content updates instead.

### Visual feedback is incomplete

The editor can look correct while the underlying block structure is wrong.
Always inspect the HTML or mutation payload.

### Playwriter sessions can reset

If the relay server restarts or the extension reconnects, Playwriter sessions
can disappear. If that happens, create a new Playwriter session and reattach to
the already-open article page.

Recovery command:

```bash
playwriter session new
playwriter -s 1 -e '
state.page = context.pages().findLast((p) => {
  return p.url().includes("/compose/articles/edit/")
})
if (!state.page) {
  throw new Error("No article editor page found")
}
console.log(state.page.url())
'
```

## Auth and request details

Direct content updates need proper auth headers. In this session, the direct
`fetch()` worked only after including:

- the X bearer token
- `x-csrf-token` from the `ct0` cookie
- the standard X active-user/auth/client-language headers

If you get `403`, inspect the successful browser request and match its headers.

In this session, the direct fetch succeeded only after matching:

- bearer token
- `x-csrf-token`
- `x-twitter-active-user`
- `x-twitter-auth-type`
- `x-twitter-client-language`

## Validation checklist

After updating an article, verify all of these:

1. correct title in the title field
2. headings appear as `header-two`
3. ordered lists appear as `ordered-list-item`
4. code blocks render as `markdown-code-block`
5. code block language labels say what you expect, for example `typescript`
6. bold keywords are split into separate styled spans in the HTML
7. no stray empty headings or broken split paragraphs remain

**Compare every block against the source JSON.** This catches split paragraphs
and lost code lines in one pass. Each block is a `[data-block=true]` element;
code blocks hold their text in a `<code>`:

```bash
playwriter -s 1 -e '
const fs = require("node:fs")
const expected = JSON.parse(fs.readFileSync("./tmp/x-article-content-state.json", "utf8"))
const got = await state.page.evaluate(() =>
  [...document.querySelectorAll("[data-testid=composer] [data-block=true]")].map((e) => {
    const code = e.querySelector("code")
    return { tag: e.tagName, text: code ? code.innerText : e.innerText }
  }),
)
console.log("blocks", got.length, "expected", expected.blocks.length)
expected.blocks.forEach((b, i) => {
  let want = b.text
  if (b.type === "atomic") {
    const md = expected.entity_map[b.entity_ranges[0].key].value.data.markdown
    want = md.split("\n").slice(1, -1).join("\n")
  }
  if (got[i]?.text.trim() !== want.trim()) console.log("MISMATCH", i, b.type, got[i]?.text.slice(0, 80))
})
'
```

For a visual check, open `/compose/articles/edit/<id>/preview`, take viewport
screenshots, and scroll with `mouse.wheel` between them. The article column
scrolls, not the document, so `scrollTop` does nothing.

- **read the PNG size before you crop.** `scale: "css"` can still return
  device pixels (a 1280px viewport came back 2560 or 5120 wide). A crop in CSS
  pixels then lands on the dark sidebar and looks like a black screenshot
- do not `locator.screenshot()` the whole composer. Playwriter sends
  `captureBeyondViewport: false`, so everything below the viewport is black

## Useful recipes

### Import a markdown article

`scripts/md-to-content-state.ts` in this skill folder does the conversion:
frontmatter and `#` title dropped, paragraphs to `unstyled`, `##` to
`header-two`, `-` and `1.` items to list blocks, fenced code to `atomic` +
`MARKDOWN` entities with `ts` renamed to `typescript`, inline backticks
stripped.

```bash
bun <skill-dir>/scripts/md-to-content-state.ts post.md ./tmp/x-article-content-state.json
```

It prints one line per block. Read it before pushing. Then:

1. type the title into the title field
2. push the JSON with the replay below
3. reload and run the block comparison from the validation checklist

### Bold one keyword per paragraph

1. choose one keyword per paragraph
2. compute exact `offset` and `length`
3. add `inline_style_ranges` with style `Bold`
4. push the updated `content_state`
5. reload and verify the HTML splits around the bold span

### Fix code language labels

Update the markdown entity fences. Example:

- bad: ` ```ts `
- good: ` ```typescript `

Then resend the full `content_state` and reload the editor.

## Minimal bulk update example

Run this after the request logger captured one `ArticleEntityUpdateContent`
(type one character in the body). It keeps every captured flag and header and
swaps only the content:

```bash
playwriter -s 1 -e '
const fs = require("node:fs")
const captured = state.requests.findLast((r) => r.url.includes("ArticleEntityUpdateContent"))
if (!captured) throw new Error("Type one character in the body first")
const payload = JSON.parse(captured.postData)
payload.variables.content_state = JSON.parse(
  fs.readFileSync("./tmp/x-article-content-state.json", "utf8"),
)
const headers = {}
for (const k of [
  "authorization",
  "content-type",
  "x-csrf-token",
  "x-twitter-active-user",
  "x-twitter-auth-type",
  "x-twitter-client-language",
]) headers[k] = captured.headers[k]
const response = await state.page.evaluate(async ({ url, headers, body }) => {
  const res = await fetch(url, { method: "POST", credentials: "include", headers, body })
  return { status: res.status, text: await res.text() }
}, { url: captured.url, headers, body: JSON.stringify(payload) })
console.log(response.status)
console.log(response.text.slice(0, 500))
'
```

A 200 response echoes the saved `content_state`. The editor does not update
until you reload the page.

## Default strategy

Use this default unless the task is tiny:

1. inspect the current draft in the browser
2. capture one real content mutation from X
3. generate the final `content_state` locally
4. update the draft with the same mutation shape
5. validate the result in the live editor HTML

That is the fastest path and the most likely to work in one shot.
