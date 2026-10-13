export interface Guide {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  sections: { h: string; p: string[] }[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'shrink-a-pdf-without-ruining-it',
    title: 'Shrinking a PDF without ruining it',
    summary: 'Why some files shrink by half and others do not move at all, and how to tell which one you have.',
    minutes: 4,
    sections: [
      {
        h: 'Where the weight lives',
        p: [
          'Most of a large PDF is images. Scans and photos are stored as pixel data, and that is what compression targets. A text-only contract is usually already small, so there is little to remove.',
          'If your file is mostly text and vector drawings, expect a small saving or none. A good tool reports that honestly instead of pretending.',
        ],
      },
      {
        h: 'Read the numbers',
        p: [
          'After processing, compare the original and output sizes. If the output is the same or larger, keep your original. A larger result means the file was already efficiently packed.',
        ],
      },
      {
        h: 'Check the result before you send it',
        p: [
          'Open the compressed copy and look at the pages with photos, stamps and signatures. Lower image quality is the trade for a smaller file, and only you can judge whether it is acceptable.',
        ],
      },
    ],
  },
  {
    slug: 'merge-and-reorder-pages-safely',
    title: 'Merging and reordering pages safely',
    summary: 'A short routine for combining documents so nothing ends up out of order or missing.',
    minutes: 3,
    sections: [
      {
        h: 'Name files so the order is obvious',
        p: [
          'Prefix files with 01, 02, 03 before you upload. You can reorder inside the tool, but clear names make mistakes easy to spot.',
        ],
      },
      {
        h: 'Page ranges in plain terms',
        p: [
          'Page options accept comma-separated 1-based numbers and ranges, such as 1,3,5-8. Page 1 is the first page. A range includes both ends.',
          'Previews only show the first pages of a long document, but the page numbers you type apply to the whole file.',
        ],
      },
      {
        h: 'Verify the page count',
        p: [
          'The result reports a page count. Add up the pages from your inputs and compare. If the numbers disagree, something was dropped and you should not send the file.',
        ],
      },
    ],
  },
  {
    slug: 'locked-pdfs-and-passwords',
    title: 'Working with password-protected PDFs',
    summary: 'What a password does and does not do, and what to expect when a tool asks for one.',
    minutes: 3,
    sections: [
      {
        h: 'Two kinds of passwords',
        p: [
          'An open password stops anyone from viewing the file. A permissions password restricts printing or copying. Tools need the open password to read an encrypted file at all.',
        ],
      },
      {
        h: 'If you forgot it',
        p: [
          'KTAS Tools cannot recover passwords you do not know. Only unlock documents you own or are authorised to open.',
        ],
      },
      {
        h: 'Handle the unlocked copy with care',
        p: [
          'An unlocked copy has no protection. Delete it when you are done and do not email it unprotected if the contents are sensitive.',
        ],
      },
    ],
  },
  {
    slug: 'basic-e-signatures-explained',
    title: 'Basic e-signatures: what they are and are not',
    summary: 'Placing a typed or drawn signature on a page is useful, but it is not a certificate-based digital signature.',
    minutes: 4,
    sections: [
      {
        h: 'Visual signature versus digital signature',
        p: [
          'A basic e-signature puts your name or a signature image on the page. A certificate-based digital signature cryptographically binds your identity to the file and shows tampering. The tools here do the first, not the second.',
        ],
      },
      {
        h: 'When a basic signature is enough',
        p: [
          'Many everyday forms, such as internal approvals, rental viewings or permission slips, only need a visible mark. If a contract or regulator requires a certified signature, check with the recipient first.',
        ],
      },
      {
        h: 'Positioning with coordinates',
        p: [
          'Placement uses PDF points measured on the page, 72 points to an inch. Page previews show the page size so you can estimate where a mark will land. Check the output after placing it.',
        ],
      },
    ],
  },
  {
    slug: 'converting-documents-what-to-expect',
    title: 'Converting documents: what to expect',
    summary: 'Layout will not always survive a format change. Here is how to judge the result quickly.',
    minutes: 4,
    sections: [
      {
        h: 'PDF is a picture of a page',
        p: [
          'PDFs describe where each glyph sits on a page, not how paragraphs flow. Converting to an editable format means guessing the structure, so complex layouts such as columns, tables and forms can shift.',
        ],
      },
      {
        h: 'Scanned pages are images',
        p: [
          'If a PDF came from a scanner, its text is a picture. Text extraction on such files may return little or nothing unless the tool performs character recognition. Read each tool\'s limitations note.',
        ],
      },
      {
        h: 'A quick review checklist',
        p: [
          'Check headings, tables, special characters and page breaks. Fix what you need in the converted file rather than assuming it is exact.',
        ],
      },
    ],
  },
  {
    slug: 'sharing-documents-without-oversharing',
    title: 'Sharing documents without oversharing',
    summary: 'Metadata, hidden pages and leftover form data can travel with a file. A few habits keep them out.',
    minutes: 3,
    sections: [
      {
        h: 'Look beyond the visible page',
        p: [
          'Files can carry author names, document properties, form field values and extra pages you forgot about. Check page count and form fields before you send.',
        ],
      },
      {
        h: 'Send only the pages needed',
        p: [
          'If a recipient needs two pages out of forty, extract those two. It is smaller, faster to review and exposes less.',
        ],
      },
      {
        h: 'Summaries are extracts, not rewrites',
        p: [
          'Smart PDF Summary ranks sentences that already exist in your document and returns the highest-scoring ones. It does not write new text, so it cannot invent facts, but it can miss context. Read the source for anything important.',
        ],
      },
    ],
  },
];
