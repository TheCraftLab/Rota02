import ExcelJS from "exceljs";
import type { RotationResult } from "@rota/core";
import { formatDisplayDate, formatWeekday } from "@rota/core";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

function getCellExportLabel(value: RotationResult["cells"][number] | null | undefined): string {
  return value?.assignedAgentName ?? "Non couvert";
}

export function buildRotationCsv(rotation: RotationResult): string {
  const headers = ["Heure", ...rotation.dates.map(formatDisplayDate)];
  const lines = [headers.join(";")];

  for (const slot of rotation.slots) {
    const row = [slot];
    for (const date of rotation.dates) {
      const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
      row.push(escapeCsv(getCellExportLabel(cell)));
    }
    lines.push(row.join(";"));
  }

  return lines.join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function buildRotationWorkbook(rotation: RotationResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rota Chat Generator";
  workbook.created = new Date();

  const planningSheet = workbook.addWorksheet("Rotation");
  planningSheet.columns = [
    { header: "Heure", width: 12 },
    ...rotation.dates.map((date) => ({
      header: formatDisplayDate(date),
      width: 24
    }))
  ];

  for (const slot of rotation.slots) {
    const row = [slot];
    for (const date of rotation.dates) {
      const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
      row.push(getCellExportLabel(cell));
    }
    planningSheet.addRow(row);
  }

  planningSheet.getRow(1).font = { bold: true };
  planningSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const slot = rotation.slots[rowNumber - 2];
    row.eachCell((worksheetCell, columnNumber) => {
      if (columnNumber === 1 || !slot) {
        return;
      }

      const date = rotation.dates[columnNumber - 2];
      const rotationCell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);

      if (rotationCell?.status === "disabled") {
        worksheetCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE6EAF0" }
        };
        return;
      }

      if (rotationCell?.status === "holiday") {
        worksheetCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF4E8C7" }
        };
        return;
      }

      if (rotationCell?.status === "manual") {
        worksheetCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9E3AE" }
        };
        return;
      }

      if (rotationCell?.status === "uncovered" || worksheetCell.value === "Non couvert") {
        worksheetCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2C9C9" }
        };
      }
    });
  });

  const summarySheet = workbook.addWorksheet("Controle");
  summarySheet.columns = [
    { header: "Agent", width: 28 },
    { header: "Total", width: 12 },
    { header: "Sursollicite", width: 14 },
    { header: "Detail jour", width: 46 }
  ];
  summarySheet.getRow(1).font = { bold: true };

  for (const item of rotation.summary.agentSummaries) {
    const detail = Object.entries(item.slotsByDate)
      .map(([date, count]) => `${formatDisplayDate(date)}: ${count}`)
      .join(" | ");

    summarySheet.addRow([item.agentName, item.totalSlots, item.overload ? "Oui" : "Non", detail]);
  }

  summarySheet.addRow([]);
  summarySheet.addRow(["Equite globale", rotation.summary.fairnessScore, "", ""]);
  summarySheet.addRow(["Creneaux non couverts", rotation.summary.uncoveredSlots, "", ""]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

interface ColumnLayout {
  key: string;
  label: string;
  width: number;
}

export async function buildRotationPdf(rotation: RotationResult): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const pageSlices = paginatePdf(rotation, pageWidth, pageHeight);

  for (const [index, slice] of pageSlices.entries()) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    drawModernPdfPage(page, rotation, slice, index + 1, pageSlices.length, boldFont, regularFont);
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

interface PdfSlice {
  dates: string[];
  slots: string[];
}

interface PdfLayout {
  scale: number;
  tableX: number;
  tableTopY: number;
  timeWidth: number;
  columnWidth: number;
  headerHeight: number;
  rowHeight: number;
  tableWidth: number;
}

const PDF_THEME = {
  ink: rgb(0.09, 0.14, 0.2),
  muted: rgb(0.36, 0.44, 0.52),
  line: rgb(0.84, 0.88, 0.92),
  surface: rgb(0.98, 0.985, 0.99),
  navy: rgb(0.12, 0.19, 0.29),
  navySoft: rgb(0.2, 0.31, 0.44),
  sand: rgb(0.95, 0.92, 0.86),
  mint: rgb(0.9, 0.97, 0.93),
  amber: rgb(0.98, 0.94, 0.84),
  coral: rgb(0.98, 0.91, 0.9),
  slate: rgb(0.92, 0.94, 0.97),
  white: rgb(1, 1, 1)
};

function paginatePdf(rotation: RotationResult, pageWidth: number, pageHeight: number): PdfSlice[] {
  const margin = 28;
  const headerHeight = 86;
  const metricsHeight = 62;
  const legendHeight = 22;
  const footerHeight = 18;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - headerHeight - metricsHeight - legendHeight - footerHeight - 22;

  const minimumScale = 0.6;
  const naturalTimeWidth = 92;
  const naturalColumnWidth = 118;
  const naturalHeaderHeight = 44;
  const naturalRowHeight = 30;

  const fullScale = Math.min(
    1,
    availableWidth / (naturalTimeWidth + rotation.dates.length * naturalColumnWidth),
    availableHeight / (naturalHeaderHeight + rotation.slots.length * naturalRowHeight)
  );

  if (fullScale >= minimumScale) {
    return [{ dates: rotation.dates, slots: rotation.slots }];
  }

  const maxDatesPerPage = Math.max(
    1,
    Math.floor((availableWidth / minimumScale - naturalTimeWidth) / naturalColumnWidth)
  );
  const maxSlotsPerPage = Math.max(
    1,
    Math.floor((availableHeight / minimumScale - naturalHeaderHeight) / naturalRowHeight)
  );

  const dateChunks = chunkList(rotation.dates, maxDatesPerPage);
  const slotChunks = chunkList(rotation.slots, maxSlotsPerPage);
  const slices: PdfSlice[] = [];

  for (const dates of dateChunks) {
    for (const slots of slotChunks) {
      slices.push({ dates, slots });
    }
  }

  return slices.length ? slices : [{ dates: rotation.dates, slots: rotation.slots }];
}

function chunkList<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function computePdfLayout(pageWidth: number, pageHeight: number, slice: PdfSlice): PdfLayout {
  const margin = 28;
  const headerHeight = 86;
  const metricsHeight = 62;
  const legendHeight = 22;
  const footerHeight = 18;
  const gap = 10;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - headerHeight - metricsHeight - legendHeight - footerHeight - 22;
  const naturalTimeWidth = 92;
  const naturalColumnWidth = 118;
  const naturalHeaderHeight = 44;
  const naturalRowHeight = 30;
  const scale = Math.min(
    1,
    availableWidth / (naturalTimeWidth + slice.dates.length * naturalColumnWidth),
    availableHeight / (naturalHeaderHeight + slice.slots.length * naturalRowHeight)
  );
  const timeWidth = naturalTimeWidth * scale;
  const columnWidth = naturalColumnWidth * scale;
  const headerRowHeight = naturalHeaderHeight * scale;
  const rowHeight = naturalRowHeight * scale;
  const tableWidth = timeWidth + slice.dates.length * columnWidth;
  const tableHeight = headerRowHeight + slice.slots.length * rowHeight;
  const tableX = margin + (availableWidth - tableWidth) / 2;
  const tableTopY = pageHeight - margin - headerHeight - metricsHeight - legendHeight - gap - (availableHeight - tableHeight) / 2;

  return {
    scale,
    tableX,
    tableTopY,
    timeWidth,
    columnWidth,
    headerHeight: headerRowHeight,
    rowHeight,
    tableWidth
  };
}

function drawModernPdfPage(
  page: PDFPage,
  rotation: RotationResult,
  slice: PdfSlice,
  pageNumber: number,
  totalPages: number,
  boldFont: PDFFont,
  regularFont: PDFFont
): void {
  const { width, height } = page.getSize();
  const margin = 28;
  const layout = computePdfLayout(width, height, slice);
  const manualCount = rotation.cells.filter((cell) => cell.status === "manual").length;
  const coveredCount = Math.max(rotation.summary.totalSlots - rotation.summary.uncoveredSlots, 0);
  const holidayCount = rotation.cells.filter((cell) => cell.status === "holiday").length;
  const dateRange =
    rotation.dates.length > 1
      ? `${formatDisplayDate(rotation.dates[0] ?? "")} - ${formatDisplayDate(rotation.dates[rotation.dates.length - 1] ?? "")}`
      : formatDisplayDate(rotation.dates[0] ?? "");

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: PDF_THEME.surface
  });

  page.drawRectangle({
    x: margin,
    y: height - margin - 84,
    width: width - margin * 2,
    height: 84,
    color: PDF_THEME.navy
  });

  page.drawRectangle({
    x: width - 230,
    y: height - margin - 84,
    width: 202,
    height: 84,
    color: PDF_THEME.navySoft
  });

  page.drawText("Planning Chat", {
    x: margin + 18,
    y: height - margin - 30,
    size: 24,
    font: boldFont,
    color: PDF_THEME.white
  });

  page.drawText(`Periode ${dateRange}`, {
    x: margin + 18,
    y: height - margin - 48,
    size: 10,
    font: regularFont,
    color: rgb(0.88, 0.92, 0.96)
  });

  page.drawText(`Generation ${rotation.settings.startTime}-${rotation.settings.endTime}`, {
    x: margin + 18,
    y: height - margin - 62,
    size: 10,
    font: regularFont,
    color: rgb(0.88, 0.92, 0.96)
  });

  page.drawText(totalPages === 1 ? "Version compacte" : `Page ${pageNumber} / ${totalPages}`, {
    x: width - 214,
    y: height - margin - 30,
    size: 12,
    font: boldFont,
    color: PDF_THEME.white
  });

  page.drawText(`${slice.dates.length} jour(s) · ${slice.slots.length} creneau(x)`, {
    x: width - 214,
    y: height - margin - 48,
    size: 10,
    font: regularFont,
    color: rgb(0.88, 0.92, 0.96)
  });

  drawMetricCard(page, margin, height - margin - 154, 176, 52, "Equite", `${rotation.summary.fairnessScore}%`, PDF_THEME.mint, boldFont, regularFont);
  drawMetricCard(page, margin + 188, height - margin - 154, 176, 52, "Couverts", `${coveredCount}`, PDF_THEME.sand, boldFont, regularFont);
  drawMetricCard(page, margin + 376, height - margin - 154, 176, 52, "Manuels", `${manualCount}`, PDF_THEME.amber, boldFont, regularFont);
  drawMetricCard(page, margin + 564, height - margin - 154, 176, 52, "Feries", `${holidayCount}`, PDF_THEME.slate, boldFont, regularFont);

  drawLegendPill(page, margin, height - margin - 176, "Affecte", PDF_THEME.mint, boldFont, regularFont);
  drawLegendPill(page, margin + 92, height - margin - 176, "Manuel", PDF_THEME.amber, boldFont, regularFont);
  drawLegendPill(page, margin + 184, height - margin - 176, "Non couvert", PDF_THEME.coral, boldFont, regularFont);
  drawLegendPill(page, margin + 298, height - margin - 176, "Ferie", PDF_THEME.sand, boldFont, regularFont);
  drawLegendPill(page, margin + 374, height - margin - 176, "Libere", PDF_THEME.slate, boldFont, regularFont);

  drawModernPdfTable(page, rotation, slice, layout, boldFont, regularFont);
  drawPdfFooter(page, margin, 14, regularFont, pageNumber);
}

function drawMetricCard(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  color: ReturnType<typeof rgb>,
  boldFont: PDFFont,
  regularFont: PDFFont
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    borderColor: PDF_THEME.line,
    borderWidth: 1
  });

  page.drawText(label, {
    x: x + 12,
    y: y + height - 16,
    size: 9,
    font: regularFont,
    color: PDF_THEME.muted
  });

  page.drawText(value, {
    x: x + 12,
    y: y + 14,
    size: 18,
    font: boldFont,
    color: PDF_THEME.ink
  });
}

function drawLegendPill(
  page: PDFPage,
  x: number,
  y: number,
  label: string,
  fill: ReturnType<typeof rgb>,
  boldFont: PDFFont,
  regularFont: PDFFont
): void {
  const width = 68 + label.length * 2.2;
  page.drawRectangle({
    x,
    y,
    width,
    height: 18,
    color: PDF_THEME.white,
    borderColor: PDF_THEME.line,
    borderWidth: 1
  });

  page.drawRectangle({
    x: x + 6,
    y: y + 4,
    width: 10,
    height: 10,
    color: fill
  });

  page.drawText(label, {
    x: x + 22,
    y: y + 5,
    size: 8,
    font: boldFont ?? regularFont,
    color: PDF_THEME.muted
  });
}

function drawModernPdfTable(
  page: PDFPage,
  rotation: RotationResult,
  slice: PdfSlice,
  layout: PdfLayout,
  boldFont: PDFFont,
  regularFont: PDFFont
): void {
  const columns: ColumnLayout[] = [
    {
      key: "time",
      label: "Heure",
      width: layout.timeWidth
    },
    ...slice.dates.map((date) => ({
      key: date,
      label: formatDisplayDate(date),
      width: layout.columnWidth
    }))
  ];
  const tableHeight = layout.headerHeight + slice.slots.length * layout.rowHeight;

  page.drawRectangle({
    x: layout.tableX - 2,
    y: layout.tableTopY - tableHeight - 2,
    width: layout.tableWidth + 4,
    height: tableHeight + 4,
    color: PDF_THEME.white,
    borderColor: PDF_THEME.line,
    borderWidth: 1
  });

  for (const column of columns) {
    page.drawRectangle({
      x: layout.tableX + columns.slice(0, columns.indexOf(column)).reduce((sum, item) => sum + item.width, 0),
      y: layout.tableTopY - layout.headerHeight,
      width: column.width,
      height: layout.headerHeight,
      color: column.key === "time" ? PDF_THEME.navySoft : PDF_THEME.navy,
      borderColor: PDF_THEME.navy,
      borderWidth: 1
    });
  }

  let headerX = layout.tableX;
  for (const column of columns) {
    if (column.key === "time") {
      page.drawText("Heure", {
        x: headerX + 10,
        y: layout.tableTopY - layout.headerHeight / 2 - 2,
        size: 9 * layout.scale,
        font: boldFont,
        color: PDF_THEME.white
      });
    } else {
      page.drawText(formatWeekday(column.key), {
        x: headerX + 10,
        y: layout.tableTopY - 16 * layout.scale,
        size: 7.5 * layout.scale,
        font: regularFont,
        color: rgb(0.86, 0.91, 0.96)
      });
      page.drawText(formatDisplayDate(column.key), {
        x: headerX + 10,
        y: layout.tableTopY - layout.headerHeight + 12 * layout.scale,
        size: 10 * layout.scale,
        font: boldFont,
        color: PDF_THEME.white
      });
    }
    headerX += column.width;
  }

  let rowY = layout.tableTopY - layout.headerHeight;

  for (const slot of slice.slots) {
    rowY -= layout.rowHeight;
    let rowX = layout.tableX;

    for (const column of columns) {
      const isTimeColumn = column.key === "time";
      const cell = isTimeColumn
        ? null
        : rotation.cells.find((item) => item.date === column.key && item.slotStart === slot);
      const value = isTimeColumn ? getSlotLabel(rotation, slot) : getCellExportLabel(cell);
      const isDisabled = !isTimeColumn && cell?.status === "disabled";
      const isHoliday = !isTimeColumn && cell?.status === "holiday";
      const isUncovered = !isTimeColumn && cell?.status === "uncovered";
      const isManual = !isTimeColumn && cell?.status === "manual";

      page.drawRectangle({
        x: rowX,
        y: rowY,
        width: column.width,
        height: layout.rowHeight,
        color: isTimeColumn
          ? PDF_THEME.white
          : isDisabled
            ? PDF_THEME.slate
            : isHoliday
              ? PDF_THEME.sand
              : isUncovered
                ? PDF_THEME.coral
                : isManual
                  ? PDF_THEME.amber
                  : PDF_THEME.mint,
        borderColor: PDF_THEME.line,
        borderWidth: 0.8
      });

      page.drawRectangle({
        x: rowX,
        y: rowY,
        width: column.width,
        height: layout.rowHeight,
        color: isTimeColumn
          ? PDF_THEME.white
          : isDisabled
            ? PDF_THEME.slate
            : isHoliday
              ? PDF_THEME.sand
              : isUncovered
                ? PDF_THEME.coral
                : isManual
                  ? PDF_THEME.amber
                  : PDF_THEME.mint,
        opacity: isTimeColumn ? 0 : 0.38
      });

      drawTextInCell(
        page,
        value,
        rowX + 8 * layout.scale,
        rowY + 6 * layout.scale,
        column.width - 16 * layout.scale,
        isTimeColumn ? boldFont : regularFont,
        isTimeColumn ? 8.3 * layout.scale : 8 * layout.scale
      );
      rowX += column.width;
    }
  }
}

function getSlotLabel(rotation: RotationResult, slotStart: string): string {
  const cell = rotation.cells.find((item) => item.slotStart === slotStart);
  return cell ? `${cell.slotStart} - ${cell.slotEnd}` : slotStart;
}

function drawPdfFooter(page: PDFPage, margin: number, footerHeight: number, font: PDFFont, pageNumber: number): void {
  page.drawText(`Page ${pageNumber}`, {
    x: margin,
    y: footerHeight,
    size: 8,
    font,
    color: PDF_THEME.muted
  });

  page.drawText("Atelier11.app", {
    x: page.getWidth() - margin - 58,
    y: footerHeight,
    size: 8,
    font,
    color: PDF_THEME.muted
  });
}

function drawTextInCell(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number
): void {
  const lines = splitTextToLines(text, font, size, maxWidth, 2);
  const lineHeight = Math.max(size + 1, 8);
  let lineY = y + (lines.length === 1 ? lineHeight * 0.6 : lineHeight * 1.2);

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: lineY,
      size,
      font,
      color: PDF_THEME.ink
    });
    lineY -= lineHeight;
  }
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color: ReturnType<typeof rgb>
): void {
  const lines = splitTextToLines(text, font, size, maxWidth, 4);
  let lineY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: lineY, size, font, color });
    lineY -= lineHeight;
  }
}

function splitTextToLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.length > 0) {
    const last = lines[maxLines - 1] ?? "";
    if (font.widthOfTextAtSize(last, size) > maxWidth) {
      lines[maxLines - 1] = trimToWidth(last, font, size, maxWidth);
    } else if (text !== lines.join(" ")) {
      lines[maxLines - 1] = trimToWidth(`${last}...`, font, size, maxWidth);
    }
  }

  return lines.length ? lines : [""];
}

function trimToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(value, size) > maxWidth) {
    value = `${value.slice(0, -4)}...`;
  }
  return value;
}
