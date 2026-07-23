document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');
  const previewContainer = document.getElementById('preview-container');
  const canvas = document.getElementById('source-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  const changeImageBtn = document.getElementById('change-image-btn');
  const eyeDropperBtn = document.getElementById('eye-dropper-btn');
  const eyeDropperOverlay = document.getElementById('eye-dropper-overlay');
  const magnifier = document.getElementById('magnifier');
  
  const colorCountInput = document.getElementById('color-count');
  const colorCountValue = document.getElementById('color-count-value');
  const strategySelect = document.getElementById('extraction-strategy');
  const sortingSelect = document.getElementById('color-sorting');
  const lockAllBtn = document.getElementById('lock-all-btn');
  const paletteGrid = document.getElementById('palette-grid');
  
  const exportCard = document.getElementById('export-card');
  const exportTabBtns = document.querySelectorAll('.export-tab-btn');
  const exportCode = document.getElementById('export-code');
  const copyExportBtn = document.getElementById('copy-export-btn');
  const downloadActionWrapper = document.getElementById('download-action-wrapper');
  const downloadBtn = document.getElementById('download-btn');
  const toastContainer = document.getElementById('toast-container');

  // --- App State ---
  let loadedImage = null; // Image object
  let rawPixels = []; // Flat array of {r, g, b}
  let currentPalette = []; // Array of {hex, locked, rgbString, hslString, rgb, hsl}
  let isEyeDropperActive = false;
  let activeExportFormat = 'css';
  let activeSwatchIndex = null; // For pipette replacement selection
  let zoomFactor = 8; // Zoom level inside magnifier

  // Initialize Lucide Icons
  lucide.createIcons();

  // --- Event Listeners: Image Upload & Drag-Drop ---
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      processImageFile(files[0]);
    }
  });

  // Paste image from clipboard
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const blob = item.getAsFile();
        processImageFile(blob);
        break;
      }
    }
  });

  changeImageBtn.addEventListener('click', resetAppToUpload);

  // --- Image Processing & Canvas Render ---
  function handleFileSelect(e) {
    if (e.target.files.length > 0) {
      processImageFile(e.target.files[0]);
    }
  }

  function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload a valid image file.', 'fail');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        renderImageToCanvas();
        extractColors();
        
        // Show/Hide containers
        dropzone.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        exportCard.classList.remove('hidden');
        
        showToast('Image loaded successfully!', 'success');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderImageToCanvas() {
    if (!loadedImage) return;
    
    // Scale image to fit within bounds while maintaining aspect ratio
    const maxDimension = 500;
    let width = loadedImage.width;
    let height = loadedImage.height;

    if (width > height) {
      if (width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      }
    } else {
      if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(loadedImage, 0, 0, width, height);

    // Collect pixels for clustering (downsample to 100x100 for speed)
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 100;
    tempCanvas.height = 100;
    tempCtx.drawImage(loadedImage, 0, 0, 100, 100);
    const imgData = tempCtx.getImageData(0, 0, 100, 100).data;
    
    rawPixels = [];
    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i+1];
      const b = imgData[i+2];
      const a = imgData[i+3];
      
      // Skip transparent or near-transparent pixels
      if (a < 128) continue;
      
      // Filter out absolute white and absolute black to get cleaner accents
      // unless the image is highly monochromatic.
      rawPixels.push({ r, g, b });
    }
  }

  function resetAppToUpload() {
    loadedImage = null;
    rawPixels = [];
    currentPalette = [];
    isEyeDropperActive = false;
    activeSwatchIndex = null;
    eyeDropperBtn.classList.remove('btn-primary');
    eyeDropperBtn.classList.add('btn-secondary');
    magnifier.classList.add('hidden');
    
    dropzone.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    exportCard.classList.add('hidden');
    fileInput.value = '';
    
    // Empty state
    renderPaletteUI();
  }

  // --- Pipette Eye Dropper Code ---
  eyeDropperBtn.addEventListener('click', () => {
    isEyeDropperActive = !isEyeDropperActive;
    if (isEyeDropperActive) {
      eyeDropperBtn.classList.remove('btn-secondary');
      eyeDropperBtn.classList.add('btn-primary');
      showToast('Pipette mode active. Click image to select color.', 'success');
      // If there's no selected swatch, default to the first unlocked one
      if (activeSwatchIndex === null) {
        activeSwatchIndex = currentPalette.findIndex(s => !s.locked);
        if (activeSwatchIndex === -1) activeSwatchIndex = 0;
      }
      highlightActiveSwatch();
    } else {
      eyeDropperBtn.classList.remove('btn-primary');
      eyeDropperBtn.classList.add('btn-secondary');
      magnifier.classList.add('hidden');
      activeSwatchIndex = null;
      removeSwatchHighlights();
    }
  });

  // Track cursor position on image canvas overlay
  canvas.addEventListener('mousemove', (e) => {
    if (!isEyeDropperActive || !loadedImage) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    // Ensure within bounds
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      magnifier.classList.add('hidden');
      return;
    }

    // Get exact pixel color
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    const hex = rgbToHex(r, g, b);

    // Position & show magnifier
    magnifier.classList.remove('hidden');
    magnifier.style.left = `${x}px`;
    magnifier.style.top = `${y}px`;
    magnifier.style.borderColor = hex;

    // Draw magnifier content (zoomed image)
    const zoomSize = 120;
    const sourceSize = zoomSize / zoomFactor;
    
    // Clear & draw to magnifier internal style background if possible,
    // or draw inside it dynamically.
    // A clean approach is using canvas as a magnifier backgrounds
    // or creating an offscreen canvas and drawing to it, then setting as background-image of magnifier.
    const magnifierCanvas = document.createElement('canvas');
    magnifierCanvas.width = zoomSize;
    magnifierCanvas.height = zoomSize;
    const mCtx = magnifierCanvas.getContext('2d');
    
    // Disable smoothing for crisp retro pixel look
    mCtx.imageSmoothingEnabled = false;
    
    // Source bounding box
    const sx = Math.max(0, x - sourceSize / 2);
    const sy = Math.max(0, y - sourceSize / 2);
    
    mCtx.drawImage(
      canvas,
      sx, sy, sourceSize, sourceSize,
      0, 0, zoomSize, zoomSize
    );
    
    magnifier.style.backgroundImage = `url(${magnifierCanvas.toDataURL()})`;
  });

  canvas.addEventListener('mouseleave', () => {
    magnifier.classList.add('hidden');
  });

  canvas.addEventListener('click', (e) => {
    if (!isEyeDropperActive || !loadedImage) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      const r = pixel[0];
      const g = pixel[1];
      const b = pixel[2];
      const hex = rgbToHex(r, g, b);

      if (activeSwatchIndex !== null && activeSwatchIndex >= 0 && activeSwatchIndex < currentPalette.length) {
        updateSwatchColor(activeSwatchIndex, { r, g, b });
        showToast(`Color ${hex} assigned to swatch ${activeSwatchIndex + 1}!`, 'success');
      } else {
        // Add as a new color if possible or overwrite first unlocked
        const unlockedIndex = currentPalette.findIndex(s => !s.locked);
        if (unlockedIndex !== -1) {
          updateSwatchColor(unlockedIndex, { r, g, b });
          showToast(`Color ${hex} assigned!`, 'success');
        }
      }

      // Automatically advance to next unlocked swatch to make picking multiple colors swift
      let nextIndex = (activeSwatchIndex + 1) % currentPalette.length;
      let loops = 0;
      while (currentPalette[nextIndex].locked && loops < currentPalette.length) {
        nextIndex = (nextIndex + 1) % currentPalette.length;
        loops++;
      }
      if (loops < currentPalette.length) {
        activeSwatchIndex = nextIndex;
        highlightActiveSwatch();
      } else {
        // All locked, disable pipette mode
        isEyeDropperActive = false;
        eyeDropperBtn.classList.remove('btn-primary');
        eyeDropperBtn.classList.add('btn-secondary');
        magnifier.classList.add('hidden');
        activeSwatchIndex = null;
        removeSwatchHighlights();
      }
    }
  });

  function highlightActiveSwatch() {
    removeSwatchHighlights();
    if (activeSwatchIndex !== null) {
      const cards = paletteGrid.querySelectorAll('.swatch-card');
      if (cards[activeSwatchIndex]) {
        cards[activeSwatchIndex].style.outline = '3px solid var(--accent-color)';
        cards[activeSwatchIndex].style.outlineOffset = '2px';
      }
    }
  }

  function removeSwatchHighlights() {
    const cards = paletteGrid.querySelectorAll('.swatch-card');
    cards.forEach(card => {
      card.style.outline = 'none';
    });
  }

  // --- Palette Settings Inputs ---
  colorCountInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    colorCountValue.textContent = val;
    extractColors();
  });

  strategySelect.addEventListener('change', extractColors);
  sortingSelect.addEventListener('change', sortAndRenderPalette);
  
  lockAllBtn.addEventListener('click', () => {
    const anyUnlocked = currentPalette.some(s => !s.locked);
    currentPalette.forEach(s => s.locked = anyUnlocked);
    
    // Toggle button icon
    const lockIcon = lockAllBtn.querySelector('i');
    if (anyUnlocked) {
      lockIcon.setAttribute('data-lucide', 'lock');
      lockAllBtn.title = 'Unlock All';
    } else {
      lockIcon.setAttribute('data-lucide', 'unlock');
      lockAllBtn.title = 'Lock All';
    }
    lucide.createIcons();
    renderPaletteUI();
  });

  // --- Color Extraction Core (K-Means) ---
  function extractColors() {
    if (rawPixels.length === 0) return;

    const count = parseInt(colorCountInput.value, 10);
    const strategy = strategySelect.value;

    // Preserve locked colors
    const lockedColors = currentPalette.filter(s => s.locked);
    const numLocked = lockedColors.length;

    // If all are locked, do nothing
    if (numLocked >= count) {
      currentPalette = currentPalette.slice(0, count);
      sortAndRenderPalette();
      return;
    }

    const numToExtract = count - numLocked;
    
    // Run K-Means Clustering
    // Extract more clusters than needed first (e.g. 16) to find good mood variety
    const extractedColors = runKMeans(rawPixels, 16);
    
    // Filter and score the clusters according to the strategy/mood
    let scoredColors = scoreColorsByStrategy(extractedColors, strategy);

    // Merge locked colors back
    const newPalette = [];
    let extractedIdx = 0;

    for (let i = 0; i < count; i++) {
      // If we had a locked color at this index, keep it
      if (currentPalette[i] && currentPalette[i].locked) {
        newPalette.push(currentPalette[i]);
      } else {
        // Take the next best available scored color
        while (extractedIdx < scoredColors.length) {
          const cand = scoredColors[extractedIdx++];
          // Check if candidate is too similar to already added colors in newPalette
          const isTooSimilar = newPalette.some(existing => 
            colorDistance(existing.rgb, cand.rgb) < 15
          );
          if (!isTooSimilar) {
            newPalette.push({
              rgb: cand.rgb,
              hex: rgbToHex(cand.rgb.r, cand.rgb.g, cand.rgb.b),
              locked: false,
              dominance: cand.count
            });
            break;
          }
        }
        
        // Fallback if we run out of unique colors
        if (newPalette.length <= i && scoredColors[extractedIdx - 1]) {
          const cand = scoredColors[extractedIdx - 1];
          newPalette.push({
            rgb: cand.rgb,
            hex: rgbToHex(cand.rgb.r, cand.rgb.g, cand.rgb.b),
            locked: false,
            dominance: cand.count
          });
        }
      }
    }

    // Fill details
    currentPalette = newPalette.map(item => {
      const hsl = rgbToHsl(item.rgb.r, item.rgb.g, item.rgb.b);
      return {
        ...item,
        rgbString: `rgb(${item.rgb.r}, ${item.rgb.g}, ${item.rgb.b})`,
        hslString: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`,
        hsl: hsl
      };
    });

    sortAndRenderPalette();
  }

  // Pure K-means algorithm
  function runKMeans(pixels, k, maxIterations = 8) {
    if (pixels.length === 0) return [];
    
    // Initialize centroids smartly (spaced out pixels)
    let centroids = [];
    const step = Math.floor(pixels.length / k);
    for (let i = 0; i < k; i++) {
      centroids.push({ ...pixels[i * step] });
    }

    let assignments = new Array(pixels.length);
    let counts = new Array(k).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assignment step
      let changed = false;
      for (let p = 0; p < pixels.length; p++) {
        const pixel = pixels[p];
        let minDist = Infinity;
        let bestCentroidIdx = 0;
        
        for (let c = 0; c < k; c++) {
          const dist = colorDistance(pixel, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            bestCentroidIdx = c;
          }
        }
        
        if (assignments[p] !== bestCentroidIdx) {
          assignments[p] = bestCentroidIdx;
          changed = true;
        }
      }

      if (!changed) break;

      // Update centroids step
      const sumR = new Array(k).fill(0);
      const sumG = new Array(k).fill(0);
      const sumB = new Array(k).fill(0);
      counts.fill(0);

      for (let p = 0; p < pixels.length; p++) {
        const centroidIdx = assignments[p];
        const pixel = pixels[p];
        sumR[centroidIdx] += pixel.r;
        sumG[centroidIdx] += pixel.g;
        sumB[centroidIdx] += pixel.b;
        counts[centroidIdx]++;
      }

      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          centroids[c].r = Math.round(sumR[c] / counts[c]);
          centroids[c].g = Math.round(sumG[c] / counts[c]);
          centroids[c].b = Math.round(sumB[c] / counts[c]);
        }
      }
    }

    // Zip centroids with their counts
    return centroids.map((c, idx) => ({
      rgb: c,
      count: counts[idx]
    })).filter(c => c.count > 0);
  }

  // Score colors based on selection strategies (dominant, vibrant, pastel, muted, dark)
  function scoreColorsByStrategy(clusters, strategy) {
    return clusters.map(c => {
      const hsl = rgbToHsl(c.rgb.r, c.rgb.g, c.rgb.b);
      let score = c.count; // base score is dominance

      switch (strategy) {
        case 'vibrant':
          // Prioritize high saturation, medium brightness
          score = (hsl.s / 100) * (1 - Math.abs(hsl.l - 50) / 50) * 1000 + (c.count * 0.1);
          break;
        case 'muted':
          // Prioritize low-to-mid saturation, medium brightness
          const satDiff = Math.abs(hsl.s - 25) / 100; // ideal sat around 25%
          score = (1 - satDiff) * (1 - Math.abs(hsl.l - 50) / 50) * 1000 + (c.count * 0.1);
          break;
        case 'pastel':
          // Prioritize high brightness (e.g. 75-90%) and medium saturation
          const brightDiff = Math.abs(hsl.l - 85) / 100;
          score = (1 - brightDiff) * (hsl.s < 60 ? 1 : 0.2) * 1000 + (c.count * 0.1);
          break;
        case 'dark':
          // Prioritize very low brightness (e.g. 15-30%)
          const darkDiff = Math.abs(hsl.l - 20) / 100;
          score = (1 - darkDiff) * 1000 + (c.count * 0.1);
          break;
        case 'dominant':
        default:
          // Just dominance score
          break;
      }
      return { ...c, score, hsl };
    }).sort((a, b) => b.score - a.score);
  }

  // Euclidean distance in RGB space
  function colorDistance(c1, c2) {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }

  // --- Sort & Render Logic ---
  function sortAndRenderPalette() {
    const sorting = sortingSelect.value;
    
    // Sort array
    currentPalette.sort((a, b) => {
      // Locked items stay where they are or follow sorting?
      // Better: Sort everything.
      if (sorting === 'hue') {
        return a.hsl.h - b.hsl.h;
      } else if (sorting === 'saturation') {
        return b.hsl.s - a.hsl.s;
      } else if (sorting === 'luminance') {
        return b.hsl.l - a.hsl.l;
      } else {
        // default: dominance / original order
        return b.dominance - a.dominance;
      }
    });

    renderPaletteUI();
    generateExportCode();
    
    if (isEyeDropperActive) {
      highlightActiveSwatch();
    }
  }

  function renderPaletteUI() {
    paletteGrid.innerHTML = '';
    
    if (currentPalette.length === 0) {
      paletteGrid.innerHTML = `
        <div class="empty-state">
          <i data-lucide="image"></i>
          <p>Upload an image to extract color swatches</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    currentPalette.forEach((item, index) => {
      // Calculate accessibility contrast values
      // Lighter check: contrast with dark text (#1E293B) and light text (#FFFFFF)
      const contrastWithWhite = calculateContrast(item.rgb, { r: 255, g: 255, b: 255 });
      const contrastWithDark = calculateContrast(item.rgb, { r: 30, g: 41, b: 59 });
      
      const bestTextHex = contrastWithWhite > contrastWithDark ? '#FFFFFF' : '#1E293B';
      const maxContrast = Math.max(contrastWithWhite, contrastWithDark);
      
      // Accessibility pass flags (AA passes at 4.5:1, AAA at 7:1)
      const passesAA = maxContrast >= 4.5;
      const passText = passesAA ? (maxContrast >= 7 ? 'AAA' : 'AA') : 'Fail';
      const passClass = passesAA ? 'pass' : 'fail';
      const checkIcon = passesAA ? 'check' : 'x';

      const swatchCard = document.createElement('div');
      swatchCard.className = `swatch-card`;
      swatchCard.dataset.index = index;

      // Click card border highlights it for pipette input
      swatchCard.addEventListener('click', (e) => {
        if (e.target.closest('.swatch-color-fill') || e.target.closest('.swatch-btn') || e.target.closest('.swatch-color-picker-wrapper')) {
          // Handled elsewhere
          return;
        }
        if (isEyeDropperActive) {
          activeSwatchIndex = index;
          highlightActiveSwatch();
        }
      });

      // Swatch Fill element
      const colorFill = document.createElement('div');
      colorFill.className = 'swatch-color-fill';
      colorFill.style.backgroundColor = item.hex;
      colorFill.title = 'Click to Copy Hex';
      colorFill.addEventListener('click', () => {
        copyToClipboard(item.hex, `Hex ${item.hex} copied!`);
      });

      // Swatch Details info pane
      const swatchInfo = document.createElement('div');
      swatchInfo.className = 'swatch-info';

      // Hex row
      const hexRow = document.createElement('div');
      hexRow.className = 'swatch-hex';
      hexRow.innerHTML = `
        <span>${item.hex}</span>
        <span class="contrast-badge ${passClass}" title="Contrast ratio: ${maxContrast.toFixed(1)}:1 on ${bestTextHex === '#FFFFFF' ? 'White' : 'Dark'} text">
          <i data-lucide="${checkIcon}" style="width:10px;height:10px;"></i>
          ${passText}
        </span>
      `;

      // Formats row
      const formatsDiv = document.createElement('div');
      formatsDiv.className = 'swatch-formats';
      
      const rgbRow = document.createElement('div');
      rgbRow.className = 'swatch-format-row';
      rgbRow.innerHTML = `<span>RGB</span><span>${item.rgb.r},${item.rgb.g},${item.rgb.b}</span>`;
      rgbRow.addEventListener('click', () => copyToClipboard(item.rgbString, 'RGB copied!'));

      const hslRow = document.createElement('div');
      hslRow.className = 'swatch-format-row';
      hslRow.innerHTML = `<span>HSL</span><span>${Math.round(item.hsl.h)},${Math.round(item.hsl.s)}%,${Math.round(item.hsl.l)}%</span>`;
      hslRow.addEventListener('click', () => copyToClipboard(item.hslString, 'HSL copied!'));

      formatsDiv.appendChild(rgbRow);
      formatsDiv.appendChild(hslRow);

      // Actions row
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'swatch-actions';

      // Lock Swatch
      const lockBtn = document.createElement('button');
      lockBtn.className = `swatch-btn ${item.locked ? 'active' : ''}`;
      lockBtn.title = item.locked ? 'Unlock Color' : 'Lock Color';
      lockBtn.innerHTML = `<i data-lucide="${item.locked ? 'lock' : 'unlock'}"></i>`;
      lockBtn.addEventListener('click', () => {
        item.locked = !item.locked;
        renderPaletteUI();
      });

      // Manual Custom Picker
      const pickerWrapper = document.createElement('div');
      pickerWrapper.className = 'swatch-color-picker-wrapper';
      pickerWrapper.style.backgroundColor = item.hex;

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'swatch-color-input';
      colorInput.value = item.hex;
      colorInput.addEventListener('input', (e) => {
        const hex = e.target.value;
        const rgb = hexToRgb(hex);
        updateSwatchColor(index, rgb);
      });

      pickerWrapper.appendChild(colorInput);
      actionsDiv.appendChild(lockBtn);
      actionsDiv.appendChild(pickerWrapper);

      swatchInfo.appendChild(hexRow);
      swatchInfo.appendChild(formatsDiv);
      swatchInfo.appendChild(actionsDiv);

      swatchCard.appendChild(colorFill);
      swatchCard.appendChild(swatchInfo);
      
      paletteGrid.appendChild(swatchCard);
    });

    lucide.createIcons();
  }

  // Update a single swatch color and recalculate
  function updateSwatchColor(index, rgb) {
    if (index >= 0 && index < currentPalette.length) {
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      
      currentPalette[index].rgb = rgb;
      currentPalette[index].hex = hex;
      currentPalette[index].hsl = hsl;
      currentPalette[index].rgbString = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      currentPalette[index].hslString = `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
      
      renderPaletteUI();
      generateExportCode();
      
      if (isEyeDropperActive) {
        highlightActiveSwatch();
      }
    }
  }

  // --- Export Code Snippets ---
  exportTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      exportTabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeExportFormat = e.target.dataset.format;
      generateExportCode();
    });
  });

  copyExportBtn.addEventListener('click', () => {
    copyToClipboard(exportCode.textContent, 'Export code copied to clipboard!');
  });

  function generateExportCode() {
    if (currentPalette.length === 0) return;

    downloadActionWrapper.classList.add('hidden');
    
    let codeStr = '';
    
    switch (activeExportFormat) {
      case 'css':
        codeStr = `/* Spectrum Color Palette variables */\n:root {\n`;
        currentPalette.forEach((item, idx) => {
          codeStr += `  --color-palette-${idx + 1}: ${item.hex};\n`;
        });
        codeStr += `}`;
        break;
        
      case 'tailwind':
        codeStr = `// Tailwind CSS configuration snippet\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n        palette: {\n`;
        currentPalette.forEach((item, idx) => {
          codeStr += `          ${idx + 1}: '${item.hex}',\n`;
        });
        codeStr += `        }\n      }\n    }\n  }\n}`;
        break;
        
      case 'json':
        const cleanPalette = currentPalette.map((item, idx) => ({
          name: `color-${idx + 1}`,
          hex: item.hex,
          rgb: item.rgbString,
          hsl: item.hslString
        }));
        codeStr = JSON.stringify(cleanPalette, null, 2);
        break;
        
      case 'svg':
        downloadActionWrapper.classList.remove('hidden');
        codeStr = `<!-- Download the SVG palette or copy below -->\n`;
        codeStr += generateSVGBlobText();
        break;
    }

    exportCode.textContent = codeStr;
  }

  function generateSVGBlobText() {
    const swatchWidth = 100;
    const swatchHeight = 200;
    const totalWidth = currentPalette.length * swatchWidth;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${swatchHeight}" width="${totalWidth}" height="${swatchHeight}">\n`;
    currentPalette.forEach((item, idx) => {
      svg += `  <rect x="${idx * swatchWidth}" y="0" width="${swatchWidth}" height="${swatchHeight}" fill="${item.hex}" />\n`;
    });
    
    // Add text overlay labels at the bottom of the rectangles
    currentPalette.forEach((item, idx) => {
      // Check contrast for text fill color
      const contrastWithWhite = calculateContrast(item.rgb, { r: 255, g: 255, b: 255 });
      const contrastWithDark = calculateContrast(item.rgb, { r: 30, g: 41, b: 59 });
      const textFill = contrastWithWhite > contrastWithDark ? '#FFFFFF' : '#1E293B';
      
      svg += `  <text x="${idx * swatchWidth + swatchWidth / 2}" y="${swatchHeight - 20}" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="${textFill}">${item.hex}</text>\n`;
    });
    
    svg += `</svg>`;
    return svg;
  }

  // Download SVG Action
  downloadBtn.addEventListener('click', () => {
    const svgContent = generateSVGBlobText();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `spectrum-palette-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('SVG download started!', 'success');
  });

  // --- Accessibility contrast checker algorithm ---
  function calculateContrast(rgb1, rgb2) {
    const l1 = calculateLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = calculateLuminance(rgb2.r, rgb2.g, rgb2.b);
    
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    
    return (brightest + 0.05) / (darkest + 0.05);
  }

  function calculateLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }

  // --- Color Converters & Helper Functions ---
  function rgbToHex(r, g, b) {
    const toHexStr = (val) => {
      const hex = val.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return '#' + toHexStr(r) + toHexStr(g) + toHexStr(b);
  }

  function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: h * 360,
      s: s * 100,
      l: l * 100
    };
  }

  // --- Copy to Clipboard Toast Alert ---
  function copyToClipboard(text, successMsg) {
    if (!navigator.clipboard) {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        showToast(successMsg, 'success');
      } catch (err) {
        showToast('Unable to copy', 'fail');
      }
      document.body.removeChild(textArea);
      return;
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }, () => {
      showToast('Clipboard copy failed.', 'fail');
    });
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast`;
    
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    toast.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span class="toast-message">${message}</span>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    // Trigger animation frame for CSS transition
    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);

    // Fade out and remove
    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, 2500);
  }

  // --- Theme Toggle Action ---
  const themeToggleBtn = document.getElementById('theme-toggle');
  themeToggleBtn.addEventListener('click', () => {
    const body = document.body;
    if (body.classList.contains('dark-theme')) {
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
      localStorage.setItem('spectrum-theme', 'light');
    } else {
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
      localStorage.setItem('spectrum-theme', 'dark');
    }
  });

  // Restore stored theme
  const savedTheme = localStorage.getItem('spectrum-theme');
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }
});
