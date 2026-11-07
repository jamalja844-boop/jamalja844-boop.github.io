import sanitizeHtml from "sanitize-html";

/**
 * Leveranciersbeschrijvingen zijn onbetrouwbare invoer en komen in je webshop terecht.
 * Daarom wordt HTML strikt gefilterd: geen scripts, iframes, event-handlers, inline stijlen
 * of externe afbeeldingen (afbeeldingen lopen via de beeldrechtencontrole).
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "span",
];

export function sanitizeDescription(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(input);
  const html = looksLikeHtml ? input : plainTextToHtml(input);
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    // Tekst binnen verwijderde script/style-tags ook weggooien
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe"],
  }).trim();
  return clean || null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
