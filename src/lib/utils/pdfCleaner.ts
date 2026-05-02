
export interface TextItem {
  text: string;
  y: number;
  pageNumber: number;
}

export interface PDFCleaningOptions {
  enabled: boolean;
  repetitionThreshold?: number;
  maxHeaderFooterLength?: number;
  // Performance options
  sampleLimit?: number; // Max pages to analyze for frequency map
}

export class PDFCleaner {
  private pageCount = 0;
  private lineFrequency = new Map<string, number>();
  private linePositions = new Map<string, Set<number>>();
  
  // To save memory, we can store pages as arrays of line indices or just raw text if preferred
  // For now, let's keep the lines but be mindful of total count
  private pages: { lines: TextItem[]; viewportHeight: number }[] = [];
  
  private analyzedPageCount = 0;

  constructor(private options: PDFCleaningOptions = { enabled: true, sampleLimit: 50 }) {}

  /**
   * Phase 1: Build the frequency map. 
   * For performance, we might only call this for a subset of pages.
   */
  analyzePage(items: any[], pageNumber: number, viewportHeight: number) {
    if (!this.options.enabled) return;
    
    this.analyzedPageCount++;
    const lines = this.processItemsIntoLines(items, pageNumber, viewportHeight);

    lines.forEach(line => {
      const text = line.text.trim();
      if (!text || text.length > (this.options.maxHeaderFooterLength || 80)) return;

      this.lineFrequency.set(text, (this.lineFrequency.get(text) || 0) + 1);
      
      if (!this.linePositions.has(text)) {
        this.linePositions.set(text, new Set());
      }
      this.linePositions.get(text)?.add(Math.round(line.y));
    });
  }

  /**
   * Phase 2: Process a page for actual extraction using the frequency map.
   */
  cleanPage(items: any[], pageNumber: number, viewportHeight: number): string {
    const lines = this.processItemsIntoLines(items, pageNumber, viewportHeight);
    
    if (!this.options.enabled) {
      return lines.map(l => l.text).join(' ');
    }

    const threshold = this.options.repetitionThreshold || 0.5;
    const maxLength = this.options.maxHeaderFooterLength || 80;

    const filteredLines = lines.filter(line => {
      const text = line.text.trim();
      
      // 1. Repetition detection
      const freq = (this.lineFrequency.get(text) || 0) / this.analyzedPageCount;
      const isRepeated = freq >= threshold;
      const isShort = text.length < maxLength;
      
      // 2. Pattern-based filtering
      const isPageNumber = /^\d+$/.test(text) || 
                           /^page \d+$/i.test(text) || 
                           /^\d+\s*\/\s*\d+$/.test(text);
      
      const isNumericOnly = /^[0-9\s.,/-]+$/.test(text) && text.length < 10;

      if (isPageNumber || isNumericOnly) return false;

      // 3. Positional confidence
      const positions = this.linePositions.get(text);
      let isInConsistentPosition = false;
      if (positions && positions.size <= 3) {
        const avgY = Array.from(positions).reduce((a, b) => a + b, 0) / positions.size;
        const isNearTop = avgY > viewportHeight * 0.85;
        const isNearBottom = avgY < viewportHeight * 0.15;
        isInConsistentPosition = isNearTop || isNearBottom;
      }

      // 4. Final decision
      if (isRepeated && isShort) {
        if (isInConsistentPosition) return false;
        if (freq > 0.8) return false;
      }

      return true;
    });

    // Inline reference cleanup
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

  private processItemsIntoLines(items: any[], pageNumber: number, viewportHeight: number): TextItem[] {
    if (items.length === 0) return [];

    // Faster grouping: Use a Map for Y-coordinates to avoid full sort if possible
    // But since lines can have slight variations in Y, we still need some sorting.
    const sortedItems = [...items].sort((a, b) => {
      const yA = a.transform[5];
      const yB = b.transform[5];
      if (Math.abs(yA - yB) < 5) return a.transform[4] - b.transform[4];
      return yB - yA;
    });

    const lines: TextItem[] = [];
    let currentLine: TextItem | null = null;

    for (const item of sortedItems) {
      const text = item.str;
      const y = item.transform[5];

      if (!currentLine || Math.abs(currentLine.y - y) > 5) {
        if (currentLine) lines.push(currentLine);
        currentLine = { text, y, pageNumber };
      } else {
        currentLine.text += (currentLine.text.endsWith(' ') ? '' : ' ') + text;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
