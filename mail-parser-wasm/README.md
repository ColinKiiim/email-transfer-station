# Mail parser compatibility source

This directory preserves the Rust/WASM parser source inherited with the project.
The production frontend currently consumes the published `mail-parser-wasm` package;
the Worker package source is retained for compatibility and provenance review.

It is not an Email Transfer Station release surface. Do not publish either package
from this repository without a separate version, source, license, and compatibility
review.

For local parser development with an installed Rust and `wasm-pack` toolchain:

```bash
wasm-pack build --release
wasm-pack build --out-dir web --target web --release
```

The upstream package identities remain
[`mail-parser-wasm`](https://www.npmjs.com/package/mail-parser-wasm) and
[`mail-parser-wasm-worker`](https://www.npmjs.com/package/mail-parser-wasm-worker).
See the repository [NOTICE](../NOTICE) and [LICENSE](../LICENSE) for provenance.
