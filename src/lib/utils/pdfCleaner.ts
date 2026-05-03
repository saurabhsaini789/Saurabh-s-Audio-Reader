
export interface TextItem {
  text: string;
  y: number;
  pageNumber: number;
}

export interface RawPageData {
  items: any[];
  pageNumber: number;
  viewportHeight: number;
}

export interface PDFCleaningOptions {
  enabled: boolean;
  repetitionThreshold?: number;
  maxHeaderFooterLength?: number;
  sampleLimit?: number;
}

export class PDFCleaner {
  private lineFrequency = new Map<string, number>();
  private linePositions = new Map<string, Set<number>>();
  private analyzedPageCount = 0;

  constructor(private options: PDFCleaningOptions = { enabled: true, sampleLimit: 50 }) {}

  /**
   * Phase 1: Build frequency map from a collection of raw page data.
   */
  analyzePages(pages: RawPageData[]) {
    if (!this.options.enabled) return;

    // Use a subset if sampleLimit is set and exceeded
    const pagesToAnalyze = this.options.sampleLimit && pages.length > this.options.sampleLimit
      ? pages.filter((_, i) => i % Math.ceil(pages.length / this.options.sampleLimit!) === 0)
      : pages;

    this.analyzedPageCount = pagesToAnalyze.length;

    pagesToAnalyze.forEach(page => {
      const lines = this.processItemsIntoLines(page.items, page.pageNumber, page.viewportHeight);

      lines.forEach(line => {
        const text = line.text.trim();
        if (!text || text.length > (this.options.maxHeaderFooterLength || 80)) return;

        this.lineFrequency.set(text, (this.lineFrequency.get(text) || 0) + 1);
        
        if (!this.linePositions.has(text)) {
          this.linePositions.set(text, new Set());
        }
        this.linePositions.get(text)?.add(Math.round(line.y));
      });
    });
  }

  /**
   * Phase 2: Clean a single raw page using the built frequency map.
   */
  cleanPageData(page: RawPageData): string {
    const lines = this.processItemsIntoLines(page.items, page.pageNumber, page.viewportHeight);
    
    if (!this.options.enabled || this.analyzedPageCount === 0) {
      return lines.map(l => l.text).join(' ');
    }

    const threshold = this.options.repetitionThreshold || 0.5;
    const maxLength = this.options.maxHeaderFooterLength || 80;

    const filteredLines = lines.filter(line => {
      const text = line.text.trim();
      if (!text) return false;
      
      const freq = (this.lineFrequency.get(text) || 0) / this.analyzedPageCount;
      const isRepeated = this.analyzedPageCount > 1 && freq >= threshold;
      const isShort = text.length < maxLength;
      
      const isPageNumber = /^\d+$/.test(text) || 
                           /^page \d+$/i.test(text) || 
                           /^\d+\s*[\/-]\s*\d+$/.test(text) ||
                           /^[pP]\.?\s*\d+$/.test(text);
      
      const isNumericOnly = /^[0-9\s.,\/-]+$/.test(text) && text.length < 10;

      if (isPageNumber || isNumericOnly) return false;

      const positions = this.linePositions.get(text);
      let isInConsistentPosition = false;
      if (positions && positions.size > 0) {
        const avgY = Array.from(positions).reduce((a, b) => a + b, 0) / positions.size;
        const isNearTop = avgY > page.viewportHeight * 0.92;
        const isNearBottom = avgY < page.viewportHeight * 0.08;
        isInConsistentPosition = (isNearTop || isNearBottom) && (positions.size > 1 || this.analyzedPageCount > 5);
      }

      if (isRepeated && isShort) {
        if (isInConsistentPosition) return false;
        if (freq > 0.8 && this.analyzedPageCount > 2) return false;
      }

      return true;
    });

    if (filteredLines.length === 0 && lines.length > 0) {
      return lines
        .filter(l => !/^\d+$/.test(l.text.trim()))
        .map(l => l.text)
        .join(' ')
        .trim();
    }

    return filteredLines
      .map(line => {
        let t = line.text;
        t = t.replace(/\[\d+(?:,\s*\d+)*\]/g, '');
        t = t.replace(/\(\d+\)/g, '');
        return t;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Optimized item-to-line grouping
   */
  private processItemsIntoLines(items: any[], pageNumber: number, viewportHeight: number): TextItem[] {
    if (!items || items.length === 0) return [];

    // Pre-extract and filter valid text items to avoid crashes on marks/empty elements
    const mappedItems = items
      .filter(item => item && typeof item.str === 'string' && Array.isArray(item.transform))
      .map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5]
      }));

    if (mappedItems.length === 0) return [];

    // Sort by Y descending (top to bottom), then X ascending (left to right)
    mappedItems.sort((a, b) => {
      const yDiff = b.y - a.y;
      if (Math.abs(yDiff) < 4) return a.x - b.x; 
      return yDiff;
    });

    const lines: TextItem[] = [];
    if (mappedItems.length === 0) return lines;

    let currentLine: TextItem = { 
      text: mappedItems[0].str, 
      y: mappedItems[0].y, 
      pageNumber 
    };

    for (let i = 1; i < mappedItems.length; i++) {
      const item = mappedItems[i];
      if (Math.abs(currentLine.y - item.y) < 4) {
        currentLine.text += (currentLine.text.endsWith(' ') ? '' : ' ') + item.str;
      } else {
        lines.push(currentLine);
        currentLine = { text: item.str, y: item.y, pageNumber };
      }
    }
    lines.push(currentLine);
    
    return lines;
  }
}
