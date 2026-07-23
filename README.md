# Spectrum 🎨

A privacy-focused, client-side color palette generator and custom palette extractor. Generate cohesive color schemes instantly from your own images, fine-tune individual colors, and check WCAG text accessibility contrast ratios—all without uploading any data to a server.

## Features
- **Local Color Extraction**: Processes images directly in the browser using HTML5 Canvas and an optimized client-side K-Means clustering algorithm.
- **Palette Style Modes**: Extract colors tailored to specific aesthetics:
  - *Dominant (Clustered)*
  - *Vibrant & Colorful*
  - *Soft & Muted*
  - *Light & Pastel*
  - *Deep & Dark*
- **Interactive Pipette Color Picker**: Pixel-precise selection directly from your image with a visual magnifying glass zoom reticle.
- **Accessibility Verification**: Automated WCAG contrast ratio analysis against black and white text.
- **Swatch Controls**: Manual fine-tuning using color pickers and locking features to retain colors during re-generations.
- **Developer Exports**: Instant copies of CSS Custom Properties, Tailwind CSS configuration objects, raw JSON formats, or downloads of SVG palettes.

## Tech Stack
- **Structure**: Vanilla HTML5
- **Style**: Custom Vanilla CSS (featuring glassmorphic theme styling)
- **Logic**: Vanilla JavaScript
- **Icons**: Lucide Icons (via CDN)
- **Fonts**: Outfit & Plus Jakarta Sans (via Google Fonts)

## Usage
Simply double-click the `index.html` file to open it in any modern browser, or serve it locally using a simple HTTP server (e.g. `npx serve` or `python -m http.server`).

## License
MIT License. Feel free to use, modify, and distribute as needed.
