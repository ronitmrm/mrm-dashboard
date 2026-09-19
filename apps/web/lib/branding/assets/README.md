# Branding font assets

The Document Templates renderer uses the Google Fonts releases of Outfit,
Hind, Hind Vadodara and Noto Sans Gujarati under the bundled OFL files.

- Outfit variable source: https://github.com/google/fonts/tree/main/ofl/outfit
- Hind source: https://github.com/google/fonts/tree/main/ofl/hind
- Hind Vadodara source: https://github.com/google/fonts/tree/main/ofl/hindvadodara
- Noto Sans Gujarati source: https://github.com/notofonts/gujarati

PDFKit resolves Outfit weights 400, 500, 600, 700 and 800 from the `wght`
axis. Gujarati body text remains Hind Vadodara; Noto Sans Gujarati is restricted
to Gujarati digits ૦–૯. No synthetic font weights are used.

## Fontkit subset compatibility

`fontkit@2.0.4` calls `restructure@3`'s `EncodeStream` with a numeric length
while `EncodeStream` requires an allocated byte buffer. PDFKit therefore throws
`TypeError: First argument to DataView constructor must be an ArrayBuffer` when
finalizing a TrueType subset. `patches/fontkit@2.0.4.patch` changes only that
allocation to `new Uint8Array(size + tail)` in Fontkit's source and published
Node/browser bundles. The proof exercises the patched subset path for every
font above.
