(() => {
  const PRODUCT_RULES = [
    { name: '550-002 Type B Fence', patterns: [/550[- ]?002/i, /type\s*b\s*fence/i, /chain[ -]?link\s+fence/i] },
    { name: '550-003 Gate', patterns: [/550[- ]?003/i, /\bgates?\b/i, /double\s+leaf/i, /single\s+leaf/i] },
    { name: '870 Aluminum Two-Rail', patterns: [/\b870\b/i, /515[- ]?070/i, /alumin(?:um|ium).{0,20}(?:two|2)[ -]?rail/i] },
    { name: '880 Steel Two-Rail', patterns: [/\b880\b/i, /515[- ]?080/i, /steel.{0,20}(?:two|2)[ -]?rail/i] },
    { name: '862 Type 1 Picket', patterns: [/\b862\b/i, /515[- ]?062/i, /type\s*1\s*picket/i, /alumin(?:um|ium)\s+picket/i] },
    { name: '822 Bullet Rail', patterns: [/\b822\b/i, /bullet\s+rail/i] },
    { name: 'Removal', patterns: [/\bremove\b/i, /\bdemolition\b/i, /\bexisting.{0,20}(?:fence|rail|gate)/i] }
  ];
  const SHEET_RULES = [
    { type: 'Plan / layout', patterns: [/\bplan\b/i, /\blayout\b/i, /\boverall\b/i, /\bstation\b/i] },
    { type: 'Railing / fence', patterns: [/\brailing\b/i, /\bfence\b/i, /\bguardrail\b/i, /\bhandrail\b/i] },
    { type: 'Details', patterns: [/\bdetail\b/i, /\bsection\b/i, /\belevation\b/i, /\btypical\b/i] },
    { type: 'Schedule / quantities', patterns: [/\bschedule\b/i, /\bquantity\b/i, /\bbill of materials\b/i, /\bsummary of quantities\b/i] },
    { type: 'Notes / specifications', patterns: [/\bgeneral notes\b/i, /\bspecification/i, /\bfinish\b/i, /\bcoating\b/i] }
  ];
  const IMPORTANT_RULES = [
    { type: 'Expansion joints', patterns: [/expansion\s+joint/i, /movement\s+joint/i], detail: 'Expansion joints found. Solid rail pieces must break and sleeve at each crossing.' },
    { type: 'Revisions', patterns: [/revision\s+cloud/i, /\brevised\b/i, /\baddendum\b/i, /\bdelta\b/i], detail: 'Revision language found. Confirm the latest revision before finalizing quantities.' },
    { type: 'Finish / coating', patterns: [/powder\s+coat/i, /galvani[sz]ed/i, /anodi[sz]ed/i, /\bcolor\b/i], detail: 'Finish or coating requirements found. Keep these with the product takeoff.' },
    { type: 'Openings / transitions', patterns: [/\bopening\b/i, /\bcrossover\b/i, /\bstair\b/i, /\btransition\b/i], detail: 'Openings or transitions found. Verify run breaks instead of carrying rail straight through.' }
  ];

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const countMatches = (text, patterns) => patterns.reduce((sum, pattern) => sum + (text.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`)) || []).length, 0);
  const evidence = (text, patterns) => {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (!match) continue;
      const start = Math.max(0, match.index - 55), end = Math.min(text.length, match.index + match[0].length + 75);
      return clean(text.slice(start, end));
    }
    return '';
  };
  const confidence = hits => hits >= 4 ? 0.96 : hits === 3 ? 0.9 : hits === 2 ? 0.82 : 0.68;

  async function extractPlanSet(docs, onProgress = () => {}) {
    const sheets = [];
    let done = 0;
    const total = docs.reduce((sum, doc) => sum + (doc.pdf ? doc.pages : 0), 0);
    for (const doc of docs) {
      if (!doc.pdf) continue;
      for (let pageNumber = 1; pageNumber <= doc.pages; pageNumber++) {
        let text = '';
        try {
          const page = await doc.pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          text = clean(content.items.map(item => item.str).join(' '));
        } catch (error) {
          text = '';
        }
        const scores = SHEET_RULES.map(rule => ({ type: rule.type, hits: countMatches(text, rule.patterns) })).sort((a, b) => b.hits - a.hits);
        sheets.push({
          document: doc.file,
          page: pageNumber,
          text,
          classification: scores[0]?.hits ? scores[0].type : (text ? 'Other drawing' : 'Scanned / no searchable text'),
          confidence: scores[0]?.hits ? confidence(scores[0].hits) : (text ? 0.45 : 0.15)
        });
        done++;
        onProgress({ done, total, document: doc.file, page: pageNumber });
      }
    }
    return sheets;
  }

  async function analyzePlanSet(docs, options = {}) {
    if (typeof options.remoteAnalyze === 'function') return options.remoteAnalyze(docs, options);
    const sheets = await extractPlanSet(docs, options.onProgress);
    const findings = [];
    const productScores = new Map();
    for (const sheet of sheets) {
      for (const rule of PRODUCT_RULES) {
        const hits = countMatches(sheet.text, rule.patterns);
        if (!hits) continue;
        const prior = productScores.get(rule.name) || { name: rule.name, hits: 0, evidence: [] };
        prior.hits += hits;
        prior.evidence.push({ document: sheet.document, page: sheet.page, quote: evidence(sheet.text, rule.patterns) });
        productScores.set(rule.name, prior);
      }
      for (const rule of IMPORTANT_RULES) {
        const hits = countMatches(sheet.text, rule.patterns);
        if (!hits) continue;
        findings.push({ id: `${rule.type}-${sheet.document}-${sheet.page}`, type: rule.type, title: rule.type, detail: rule.detail, confidence: confidence(hits), evidence: [{ document: sheet.document, page: sheet.page, quote: evidence(sheet.text, rule.patterns) }] });
      }
    }
    const products = [...productScores.values()].sort((a, b) => b.hits - a.hits).map(item => ({
      id: `product-${item.name}`,
      type: 'Detected scope',
      title: item.name,
      detail: `Likely takeoff category found across ${new Set(item.evidence.map(e => `${e.document}:${e.page}`)).size} sheet${item.evidence.length === 1 ? '' : 's'}.`,
      confidence: confidence(item.hits),
      evidence: item.evidence.slice(0, 3)
    }));
    const colors = options.palette || ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308'];
    const fallback = options.currentItems || [];
    const suggestedNames = products.map(item => item.title).slice(0, 6);
    for (const item of fallback) if (suggestedNames.length < 6 && item.group && !suggestedNames.includes(item.group)) suggestedNames.push(item.group);
    const textSheets = sheets.filter(sheet => sheet.text.length > 20).length;
    const warnings = [];
    if (!sheets.length) warnings.push('Open at least one PDF before starting Athena analysis.');
    if (sheets.length && !textSheets) warnings.push('These PDFs appear scanned. Athena can organize the set, but visual AI/OCR is needed for automatic symbol recognition.');
    else if (sheets.length - textSheets) warnings.push(`${sheets.length - textSheets} page${sheets.length - textSheets === 1 ? '' : 's'} had little or no searchable text and may need visual review.`);
    if (!options.scaleReady) warnings.push('Plan scale is not calibrated yet. Confirm scale before accepting quantities.');
    return {
      engine: 'athena-local-kickoff-v1',
      generatedAt: new Date().toISOString(),
      summary: products.length ? `Athena found ${products.length} likely scope categor${products.length === 1 ? 'y' : 'ies'} in ${sheets.length} PDF page${sheets.length === 1 ? '' : 's'}.` : `Athena reviewed ${sheets.length} PDF page${sheets.length === 1 ? '' : 's'} and needs your confirmation of the takeoff scope.`,
      stats: { documents: docs.filter(doc => doc.pdf).length, pages: sheets.length, textPages: textSheets, scannedPages: sheets.length - textSheets },
      sheets: sheets.map(({ text, ...sheet }) => ({ ...sheet, textPreview: text.slice(0, 180) })),
      findings: [...products, ...findings],
      suggestedItems: suggestedNames.map((name, index) => ({ name, group: name, color: colors[index] })),
      warnings
    };
  }

  window.AtlasAthenaModule = { version: '0.1.0', analyzePlanSet, extractPlanSet };
})();
