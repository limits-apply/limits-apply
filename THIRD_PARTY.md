# Third-party data and assets

The Apache License 2.0 in this repository covers Limits Apply's original source code,
documentation, schemas, formulas, original transformations, and original measurement data submitted
for inclusion unless a file says otherwise. It does not relicense material owned by third parties.

**Attribution is not permission.** This file records whose terms govern each bundled file. Whether
that file may be redistributed is a separate question, answered per file in the
[third-party review register](docs/third-party-review.md). Check the register before redistributing
anything from this repository.

## Data

What each bundled file is, and whose terms apply to it. Everything under `data/` is third-party
payload we did not author; `src/data/plans.json` is our own record of provider facts.

- `data/artificial-analysis-*.json` — attributed snapshots derived from Artificial Analysis:
  the model index, the coding-agents table, and the small open-weights tier. Reuse is subject to
  Artificial Analysis's applicable API and data terms. Attribution to
  <https://artificialanalysis.ai/> must be preserved.
- `data/model-releases-*.json` — derived from the MIT-licensed
  [models.dev](https://github.com/anomalyco/models.dev) catalogue, preserving upstream model links.
  The MIT notice is reproduced at the end of this file.
- `data/fx-rates-*.json` — a normalized snapshot of European Central Bank reference rates. The
  ECB is the source; reuse must follow its
  [copyright conditions](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html),
  including its attribution, modification-disclosure, commercial-notice, and no-framing rules.
- `data/opencode-go-*.json` — facts collected from the source named inside the file, which
  remains that source's material.
- `src/data/plans.json` — factual pricing and quota observations. Each row carries its source URL
  and verification date. The underlying provider pages remain the providers' material.
- Community observations link to their original reports. Linked traces, posts, and attachments
  remain under their authors' terms unless a contribution explicitly grants broader rights.

Facts, original selection, original normalization code, and original commentary may have different
copyright status in different jurisdictions. This file does not grant rights that Limits Apply does
not own.

## Names, logos, and icons

Files under `src/assets/icons/` identify providers and products discussed by the benchmark. Provider
names, product names, logos, and trademarks belong to their respective owners. Their presence does
not imply endorsement and they are excluded from the Apache License 2.0 grant.

## Contributions

Do not submit copied pricing pages, proprietary benchmark exports, private account data, or other
material you cannot lawfully share. Prefer source URLs, short factual extracts, hashes, and your own
reproducible measurements. See [Data contributions](docs/data-contributions.md).

A contribution that adds a bundled third-party file also needs an entry in the
[third-party review register](docs/third-party-review.md), which decides whether it may ship.

## models.dev licence notice

The notice below applies to material derived from models.dev:

> MIT License
>
> Copyright (c) 2025 models.dev
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
