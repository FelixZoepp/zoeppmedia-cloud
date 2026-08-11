declare module 'pdf-parse' {
  interface TextResult {
    text: string;
    pages: Array<{ pageNumber: number; text: string }>;
  }

  interface LoadParameters {
    data: Buffer | Uint8Array;
    verbosity?: number;
    [key: string]: unknown;
  }

  class PDFParse {
    constructor(options: LoadParameters);
    getText(params?: Record<string, unknown>): Promise<TextResult>;
    getInfo(params?: Record<string, unknown>): Promise<unknown>;
    destroy(): Promise<void>;
  }

  const VerbosityLevel: { ERRORS: number; WARNINGS: number; INFOS: number };

  export { PDFParse, VerbosityLevel };
}
