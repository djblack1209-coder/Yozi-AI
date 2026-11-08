import { LEGAL_DOCS, LEGAL_LANGUAGES, LEGAL_VERSION, legalBlocks } from '../../website/legal.mjs';

// Bundle the same parsed Markdown and metadata as the site for offline reading.
export function readAppLegal() {
  const documents = {};
  for (const language of LEGAL_LANGUAGES) {
    documents[language] = {};
    for (const document of LEGAL_DOCS) documents[language][document] = legalBlocks(language, document);
  }
  return { version: LEGAL_VERSION, documents };
}
