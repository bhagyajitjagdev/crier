import { useMemo } from "react"
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { html } from "@codemirror/lang-html"
import { json } from "@codemirror/lang-json"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import { cn } from "@/lib/utils"

const knownMark = Decoration.mark({ class: "cm-var-known" })
const unknownMark = Decoration.mark({ class: "cm-var-unknown" })

/** Highlights {{ variable }} — tinted when the variable exists in the sample
 * payload, red when it doesn't (it would fail the send). */
function variablePlugin(known: Set<string> | null) {
  const matcher = new MatchDecorator({
    regexp: /\{\{\s*([\w.]+)\s*\}\}/g,
    decoration: (match) =>
      known === null || known.has(match[1]) ? knownMark : unknownMark,
  })
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view)
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations)
      }
    },
    { decorations: (value) => value.decorations },
  )
}

// One theme for both modes: every color is an app token, so the editor
// re-skins itself when the .dark class flips — no bundled editor theme.
const crierTheme = EditorView.theme({
  "&": {
    fontSize: "0.8125rem",
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "'IBM Plex Mono', monospace",
    caretColor: "var(--foreground)",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "color-mix(in oklab, var(--muted-foreground) 65%, transparent)",
    border: "none",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--foreground) 4%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
})

const crierHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.tagName], color: "var(--cm-keyword)" },
  { tag: t.attributeName, color: "var(--cm-attribute)" },
  { tag: [t.string, t.attributeValue], color: "var(--cm-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--cm-number)" },
  { tag: t.comment, color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: t.propertyName, color: "var(--cm-property)" },
  { tag: [t.angleBracket, t.punctuation], color: "var(--muted-foreground)" },
])

export function CodeEditor({
  value,
  onChange,
  language,
  variables,
  placeholder,
  className,
  editable = true,
  editorRef,
}: {
  value: string
  onChange: (value: string) => void
  language: "html" | "json"
  /** Known payload variables; undefined = highlight all {{ }} neutrally. */
  variables?: string[]
  placeholder?: string
  className?: string
  editable?: boolean
  /** Exposes the CodeMirror instance, e.g. for insert-at-cursor. */
  editorRef?: React.Ref<ReactCodeMirrorRef>
}) {
  const extensions = useMemo(
    () => [
      language === "html" ? html() : json(),
      // Long unbroken content (base64 images!) must wrap, never widen the box.
      EditorView.lineWrapping,
      crierTheme,
      syntaxHighlighting(crierHighlight),
      variablePlugin(variables ? new Set(variables) : null),
    ],
    [language, variables],
  )

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      editable={editable}
      placeholder={placeholder}
      height="100%"
      className={cn("h-full overflow-hidden text-sm", className)}
    />
  )
}

/** Format button behavior for both editor flavors. Throws with a readable
 * message on invalid input — callers surface it as a toast. */
export async function formatCode(
  code: string,
  language: "html" | "json",
): Promise<string> {
  if (language === "json") {
    return JSON.stringify(JSON.parse(code), null, 2)
  }
  // Prettier only loads when someone actually clicks Format.
  const [prettier, htmlPlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/html"),
  ])
  return prettier.format(code, {
    parser: "html",
    plugins: [htmlPlugin.default],
    printWidth: 100,
  })
}
