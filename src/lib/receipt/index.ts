/** Receipt printing shared by the server and the kiosk page: the ESC/POS builder, the order receipt layout, the register's legal receipts, and a decoder for tests/simulation. */
export { CODE_PAGE_PC865, EscPosBuilder, encodePc865, type Align } from './escpos'
export { decodeEscPos, previewAsText, type PreviewLine, type ReceiptPreview } from './escposPreview'
export { DEFAULT_RECEIPT_LANGUAGE, resolveReceiptLanguage } from './receiptLanguage'
export { buildReportPrint, type ReportPrintContext } from './reportLayout'
export { buildLegalReceipt, formatOre, LEGAL_HEADINGS, type LegalReceiptData, type LegalReceiptKind } from './legalReceipt'
export { buildDrawerKick, buildReceipt, charsPerLine, formatKroner, formatReceiptDate, receiptOrderNumber, twoColumns, wrapText, type ReceiptOptions } from './receiptLayout'
