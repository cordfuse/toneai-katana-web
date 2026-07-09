// English — the source-of-truth locale. Every t() call passes its English
// string as the fallback, so this map can stay (largely) empty: any key not
// found here renders the inline fallback. Listed entries are reserved for
// strings that need a different rendering than the inline fallback (rare).
const en: Record<string, string> = {}
export default en
