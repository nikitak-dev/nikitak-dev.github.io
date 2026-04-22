/* DEV-only visual QA harness for media tiles. Loaded via dynamic import from
   chat/index.ts when ?mock=1 is present and import.meta.env.DEV is true; Vite
   DCEs both the import callsite and this module from prod builds. Renders one
   sample assistant message: working image, broken image (→ LOAD_FAILED card),
   PDF card. */

import type { ChatResponse } from './types';

export function renderMock(addAssistantMsg: (data: ChatResponse) => void): void {
  addAssistantMsg({
    answer: '**Mock response** for visual QA of media tiles. Image tile should render pristine (no scanline overlay). The broken tile should fall back to the error-card fallback with scanlines. The PDF tile should keep scanlines.',
    sources: [
      { filename: 'encryption_basics.txt', score: 0.56 },
      { filename: 'symmetric-encryption.png', score: 0.14 },
      { filename: 'doc.pdf', score: 0.10 },
    ],
    media: [
      {
        filename: 'symmetric-encryption.png',
        type: 'image',
        driveFileId: '1KkNVWVwyptgloZvwLqeP0gz4A9P8akah',
        url: 'https://drive.google.com/thumbnail?id=1KkNVWVwyptgloZvwLqeP0gz4A9P8akah&sz=w800',
      },
      {
        filename: 'broken.png',
        type: 'image',
        driveFileId: 'mockbrokenid',
        url: 'https://drive.google.com/thumbnail?id=mockbrokenid&sz=w800',
      },
      {
        filename: 'doc.pdf',
        type: 'pdf',
        driveFileId: 'mockpdfid',
        url: 'https://drive.google.com/file/d/mockpdfid/preview',
      },
    ],
  });
}
