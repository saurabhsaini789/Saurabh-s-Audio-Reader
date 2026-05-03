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
      // Dynamically import PDF.js - version 5.x specific
      const pdfjsLib = await import('pdfjs-dist');
      
      // Use the standard worker from unpkg but try to be more robust
      const version = pdfjsLib.version || '5.7.284';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

      const data = file instanceof File ? await file.arrayBuffer() : file;
      
      const loadingTask = pdfjsLib.getDocument({ 
        data,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${version}/standard_fonts/`,
        disableFontFace: true, // Often helps on mobile to avoid font loading issues
      });

      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      const cleaner = new PDFCleaner({ enabled: cleanReadingMode, sampleLimit: 50 });

      // Pass 1: Analyze frequency (Sampling for large PDFs)
      const sampleRate = totalPages > 50 ? Math.floor(totalPages / 25) : 1;
      
      for (let i = 1; i <= totalPages; i += sampleRate) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1 });
          
          cleaner.analyzePage(textContent.items, i, viewport.height);
          
          // Progress for Pass 1 (0-30%)
          setExtractionProgress(Math.round((i / totalPages) * 30));
          
          // Cleanup page resources
          (page as any).cleanup();
        } catch (err) {
          console.warn(`Failed to analyze page ${i}:`, err);
        }
        
        if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Pass 2: Clean and Chunk
      const extractedChunks: TextChunk[] = [];
      
      for (let i = 1; i <= totalPages; i++) {
        try {
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
        } catch (err) {
          console.warn(`Failed to process page ${i}:`, err);
        }

        // Progress for Pass 2 (30-100%)
        setExtractionProgress(30 + Math.round((i / totalPages) * 70));
        
        // Yield more frequently for responsiveness
        if (i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 10)); // Slightly longer wait for mobile
      }

      if (extractedChunks.length === 0) {
        throw new Error('No readable text could be extracted from this PDF.');
      }

      setChunks(extractedChunks);
      return extractedChunks;
    } catch (error: any) {
      console.error('Error processing PDF:', error);
      throw new Error(`Failed to read PDF: ${error.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setExtractionProgress(0);
    }
  }, []);

  return { processPDF, chunks, setChunks, isProcessing, extractionProgress, fileName };
};

