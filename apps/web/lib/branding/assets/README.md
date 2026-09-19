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
finalizing a TrueType subset. `patches/fontkit@2.0.4.patch` fixes that allocation with
`new Uint8Array(size + tail)` in the source and all four published bundles.

The encoder also fails to flush a final repeated-point flag count before
coordinate bytes. Outfit commas then have malformed embedded outlines even
though text extraction retains the comma. The same patch flushes that final
count. The output test compares the emitted comma outline bounds against the
bundled source; the five required Outfit weights also passed a subset round trip.
Preserve both corrections until an upstream release fixes them.

Font fallback uses whole grapheme clusters: Gujarati and Hindi script select
their real faces even inside English metadata. Latin retains the selected
language's primary face; metadata explicitly uses Outfit first. Shaped glyph 0
rejects generation. Legitimate Indic joiners remain intact.

Saved italic marks use a 14-degree synthetic oblique, matching the prior
browser fallback for these upright-only faces. Fitting includes slanted ink
overhang without changing run advances. Underlines are baseline-relative vector
strokes; bold continues to use the real bundled weights.

PDF.js can extract Indic marks in visual/decomposed order despite ActualText.
Embedded, selectable, visually shaped text does not imply exact logical-source
extraction.
