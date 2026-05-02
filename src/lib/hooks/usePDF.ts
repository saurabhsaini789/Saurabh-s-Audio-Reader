import { useState, useCallback } from 'react';
import { TextChunk } from '../types';

export const usePDF = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunks, setChunks] = useState<TextChunk[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const processPDF = useCallback(async (file: File | ArrayBuffer, name: string) => {
    setIsProcessing(true);
    setFileName(name);
    
    try {
      // Dynamically import PDF.js to avoid SSR issues
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker source using unpkg (more reliable than cdnjs for mjs)
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const data = file instanceof File ? await file.arrayBuffer() : file;
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const extractedChunks: TextChunk[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        let pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');

        // Smart chunking: Split by double newlines or punctuation + space
        const paragraphs = pageText.split(/\.\s{1,}/).filter(p => p.trim().length > 10);
        
        if (paragraphs.length === 0 && pageText.trim().length > 0) {
          const sentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
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

      setChunks(extractedChunks);
      return extractedChunks;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { processPDF, chunks, setChunks, isProcessing, fileName };
};
