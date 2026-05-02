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
    setExtractionProgress(0);
    setFileName(name);
    
    try {
      // Dynamically import PDF.js
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker source
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const data = file instanceof File ? await file.arrayBuffer() : file;
      
      const loadingTask = pdfjsLib.getDocument({ 
        data,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`
      });

      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      const cleaner = new PDFCleaner({ enabled: cleanReadingMode, sampleLimit: 50 });

      // Pass 1: Analyze frequency (Sampling for large PDFs)
      const sampleRate = totalPages > 100 ? Math.floor(totalPages / 50) : 1;
      
      for (let i = 1; i <= totalPages; i += sampleRate) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        
        cleaner.analyzePage(textContent.items, i, viewport.height);
        
        // Progress for Pass 1 (0-30%)
        setExtractionProgress(Math.round((i / totalPages) * 30));
        
        // Cleanup page resources
        (page as any).cleanup();
        
        if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Pass 2: Clean and Chunk
      const extractedChunks: TextChunk[] = [];
      
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        
        const cleanedText = cleaner.cleanPage(textContent.items, i, viewport.height);

        if (cleanedText) {
          // Smart chunking
          const paragraphs = cleanedText.split(/\.\s{1,}/).filter(p => p.trim().length > 10);
          
          if (paragraphs.length === 0 && cleanedText.trim().length > 0) {
            const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];
            for (let j = 0; j < sentences.length; j += 3) {
              const chunkText = sentences.slice(j, j + 3).join(' ').trim();
              if (chunkText) {
                extractedChunks.push({
                  id: `p${i}-c${extractedChunks.length}`,
                  pageNumber: i,
                  text: chunkText
                });
              }
            }
          } else {
            paragraphs.forEach((p, idx) => {
              const cleanText = p.trim() + (p.endsWith('.') ? '' : '.');
              extractedChunks.push({
                id: `p${i}-c${idx}`,
                pageNumber: i,
                text: cleanText
              });
            });
          }
        }

        // Cleanup page resources
        (page as any).cleanup();

        // Progress for Pass 2 (30-100%)
        setExtractionProgress(30 + Math.round((i / totalPages) * 70));
        
        // Yield more frequently for responsiveness
        if (i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      setChunks(extractedChunks);
      return extractedChunks;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    } finally {
      setIsProcessing(false);
      setExtractionProgress(0);
    }
  }, []);

  return { processPDF, chunks, setChunks, isProcessing, extractionProgress, fileName };
};

