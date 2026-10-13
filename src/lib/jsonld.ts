/**
 * Serialise a JSON-LD object for an inline `<script type="application/ld+json">`.
 *
 * JSON.stringify does not escape `<`, so a string value containing
 * `</script>` would end the data block and start executable markup. Creator
 * text (displayName, bio) flows into this object, so every `<` is written as
 * its JSON escape `<`. U+2028/U+2029 are escaped too: they are legal in
 * JSON but terminate lines in older script parsers.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
