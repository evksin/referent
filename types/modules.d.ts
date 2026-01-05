// Декларации типов для модулей без TypeScript определений
declare module "pdf-parse" {
  interface PDFInfo {
    Title?: string;
    CreationDate?: Date | string;
    [key: string]: any;
  }

  interface PDFData {
    text: string;
    info: PDFInfo;
    [key: string]: any;
  }

  function pdfParse(buffer: Buffer): Promise<PDFData>;
  export default pdfParse;
}

declare module "mammoth" {
  interface ExtractRawTextResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface Mammoth {
    extractRawText(options: { buffer: Buffer }): Promise<ExtractRawTextResult>;
  }

  const mammoth: Mammoth;
  export default mammoth;
}

declare module "xlsx" {
  interface WorkSheet {
    [key: string]: any;
  }

  interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheetName: string]: WorkSheet };
  }

  interface XLSX {
    read(data: Buffer, options: { type: string }): WorkBook;
    utils: {
      sheet_to_json(worksheet: WorkSheet, options: {
        header?: number;
        defval?: string;
      }): any[];
    };
  }

  const xlsx: XLSX;
  export = xlsx;
}

