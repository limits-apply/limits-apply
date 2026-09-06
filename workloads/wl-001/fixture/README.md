`slugify.mjs` produces bad slugs: `slugify("Hello, World!")` returns
`"hello-world-"` (trailing dash) and `slugify("Été à Paris")` returns
`"-t-paris"` (diacritics dropped). Fix `slugify` so slugs have no leading or
trailing separators and diacritics are transliterated to ASCII
(é→e, à→a, Æ→AE/ae, ¢→c). Only edit `slugify.mjs`. Check with `node grade.mjs`.
