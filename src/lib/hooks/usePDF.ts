import { useState, useCallback } from 'react';
import { TextChunk } from '../types';
import { PDFCleaner } from '../utils/pdfCleaner';

export const usePDF = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const processPDF = useCallback(async (file: File | ArrayBuffer, name: string, cleanReadingMode = true) => {
    setIsProcessing(true);
    setExtractionProgress(1);
    setFileName(name);
    
    let pdf: any = null;
    
    try {
      // 1. Load library and set worker
      const pdfjsLib = await import('pdfjs-dist');
      
      // Fix: Use a more robust way to find the worker path
      const isGitHubPages = window.location.hostname.includes('github.io');
      const basePath = isGitHubPages ? '/Saurabh-s-Audio-Reader' : '';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${basePath}/pdfjs/pdf.worker.min.mjs`;

      const data = file instanceof File ? await file.arrayBuffer() : file;
      const version = '5.7.284';
      
      const loadingTask = pdfjsLib.getDocument({ 
        data,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${version}/standard_fonts/`,
        disableFontFace: true,
      });

      pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      const rawPagesData: any[] = [];
      
      // Phase 1: Collect raw data for analysis (required for header/footer detection)
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        
        rawPagesData.push({
          items: textContent.items,
          pageNumber: i,
          viewportHeight: viewport.height
        });
        
        setExtractionProgress(Math.round((i / totalPages) * 30)); // First 30% is analysis
        (page as any).cleanup();
        await new Promise(r => setTimeout(r, 0));
      }

      // Phase 2: Analyze and Clean
      const cleaner = new PDFCleaner({ enabled: cleanReadingMode });
      cleaner.analyzePages(rawPagesData);
      
      const extractedChunks: TextChunk[] = [];
      
      // Better sentence segmenter (Polyfill-friendly approach)
      const segmentText = (text: string) => {
        if ('Segmenter' in Intl) {
          const segmenter = new (Intl as any).Segmenter('en', { granularity: 'sentence' });
          return Array.from(segmenter.segment(text)).map((s: any) => s.segment.trim());
        }
        // Fallback to improved regex if Segmenter is unavailable
        return text
          .replace(/([.?!])\s+(?=[A-Z])/g, "$1|")
          .split("|")
          .map(s => s.trim());
      };

      for (let i = 0; i < rawPagesData.length; i++) {
        const pageData = rawPagesData[i];
        const cleanedText = cleaner.cleanPageData(pageData);
        
        if (cleanedText.length > 5) {
          const sentences = segmentText(cleanedText);
          
          sentences.forEach((sentence) => {
            if (sentence.length > 5) {
              extractedChunks.push({
                id: `p${pageData.pageNumber}-c${extractedChunks.length}`,
                pageNumber: pageData.pageNumber,
                text: sentence
              });
            }
          });
        }
        
        setExtractionProgress(30 + Math.round(((i + 1) / totalPages) * 70));
        await new Promise(r => setTimeout(r, 0));
      }

      if (extractedChunks.length === 0) {
        throw new Error('No readable text found in PDF');
      }

      setChunks(extractedChunks);
      return extractedChunks;
    } catch (error: any) {
      console.error('Extraction Error:', error);
      throw error;
    } finally {
      // CRITICAL: Cleanup PDF document to prevent memory leaks
      if (pdf) {
        try {
          await pdf.destroy();
        } catch (e) {
          console.warn('PDF cleanup error:', e);
        }
      }
      setIsProcessing(false);
      setTimeout(() => setExtractionProgress(0), 500);
    }
  }, []);

  return { processPDF, chunks, setChunks, isProcessing, extractionProgress, fileName };
};

