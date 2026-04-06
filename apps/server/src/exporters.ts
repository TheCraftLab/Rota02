import ExcelJS from "exceljs";
import type { RotationResult } from "@rota/core";
import { formatDisplayDate } from "@rota/core";
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
  const margin = 28;
  const headerHeight = 78;
  const footerHeight = 20;
  const rowHeight = 24;
  const availableHeight = pageHeight - margin - headerHeight - footerHeight - 24;
  const rowsPerPage = Math.max(1, Math.floor(availableHeight / rowHeight));

  const dateChunks = chunkDates(rotation.dates, 4);

  for (const [chunkIndex, dates] of dateChunks.entries()) {
    const columns = buildColumns(dates);
    const slotPages = chunkSlots(rotation.slots, rowsPerPage);

    for (const [slotPageIndex, slotChunk] of slotPages.entries()) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      drawPdfHeader(page, rotation, chunkIndex, dateChunks.length, slotPageIndex, slotPages.length, boldFont, regularFont);
      drawPdfTable(page, rotation, slotChunk, columns, margin, pageHeight - margin - headerHeight, rowHeight, regularFont, boldFont);
      drawPdfFooter(page, margin, footerHeight, regularFont, pdf.getPageCount());
    }
  }

  const summaryPage = pdf.addPage([841.89, 595.28]);
  drawSummaryPage(summaryPage, rotation, boldFont, regularFont);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function chunkDates(dates: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < dates.length; index += chunkSize) {
    chunks.push(dates.slice(index, index + chunkSize));
  }
  return chunks.length ? chunks : [[]];
}

function chunkSlots(slots: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < slots.length; index += chunkSize) {
    chunks.push(slots.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildColumns(dates: string[]): ColumnLayout[] {
  return [
    {
      key: "time",
      label: "Heure",
      width: 72
    },
    ...dates.map((date) => ({
      key: date,
      label: formatDisplayDate(date),
      width: 172
    }))
  ];
}

function drawPdfHeader(
  page: PDFPage,
  rotation: RotationResult,
  chunkIndex: number,
  totalChunks: number,
  pageIndex: number,
  totalPages: number,
  boldFont: PDFFont,
  regularFont: PDFFont
): void {
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: 28,
    y: height - 70,
    width: width - 56,
    height: 46,
    color: rgb(0.95, 0.93, 0.89)
  });

  page.drawText("Rotation Chat", {
    x: 40,
    y: height - 48,
    size: 18,
    font: boldFont,
    color: rgb(0.07, 0.13, 0.18)
  });

  page.drawText(
    `Plage ${rotation.settings.startTime}-${rotation.settings.endTime} · Pas ${rotation.settings.slotMinutes} min`,
    {
      x: 40,
      y: height - 64,
      size: 9,
      font: regularFont,
      color: rgb(0.24, 0.36, 0.46)
    }
  );

  page.drawText(
    `Colonnes ${chunkIndex + 1}/${totalChunks} · Lignes ${pageIndex + 1}/${totalPages}`,
    {
      x: width - 210,
      y: height - 54,
      size: 9,
      font: regularFont,
      color: rgb(0.24, 0.36, 0.46)
    }
  );
}

function drawPdfTable(
  page: PDFPage,
  rotation: RotationResult,
  slotChunk: string[],
  columns: ColumnLayout[],
  startX: number,
  topY: number,
  rowHeight: number,
  regularFont: PDFFont,
  boldFont: PDFFont
): void {
  let x = startX;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  page.drawRectangle({
    x: startX,
    y: topY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.91, 0.95, 0.97),
    borderColor: rgb(0.8, 0.86, 0.9),
    borderWidth: 1
  });

  for (const column of columns) {
    page.drawRectangle({
      x,
      y: topY - rowHeight,
      width: column.width,
      height: rowHeight,
      borderColor: rgb(0.8, 0.86, 0.9),
      borderWidth: 1
    });

    page.drawText(column.label, {
      x: x + 8,
      y: topY - 16,
      size: 9,
      font: boldFont,
      color: rgb(0.07, 0.13, 0.18)
    });

    x += column.width;
  }

  let rowY = topY - rowHeight;

  for (const slot of slotChunk) {
    rowY -= rowHeight;
    let rowX = startX;

    for (const column of columns) {
      const isTimeColumn = column.key === "time";
      const cell = isTimeColumn
        ? null
        : rotation.cells.find((item) => item.date === column.key && item.slotStart === slot);
      const value = isTimeColumn ? slot : getCellExportLabel(cell);
      const isDisabled = !isTimeColumn && cell?.status === "disabled";
      const isHoliday = !isTimeColumn && cell?.status === "holiday";
      const isUncovered = !isTimeColumn && cell?.status === "uncovered";
      const isManual = !isTimeColumn && cell?.status === "manual";

      page.drawRectangle({
        x: rowX,
        y: rowY,
        width: column.width,
        height: rowHeight,
        color: isTimeColumn
          ? rgb(1, 1, 1)
          : isDisabled
            ? rgb(0.92, 0.94, 0.97)
          : isHoliday
            ? rgb(0.96, 0.92, 0.82)
          : isUncovered
            ? rgb(0.99, 0.93, 0.93)
            : isManual
              ? rgb(0.98, 0.95, 0.88)
              : rgb(0.94, 0.98, 0.96),
        borderColor: rgb(0.86, 0.9, 0.93),
        borderWidth: 1
      });

      drawTextInCell(page, value, rowX + 7, rowY + 7, column.width - 14, regularFont, isTimeColumn ? 9 : 8.5);
      rowX += column.width;
    }
  }
}

function drawPdfFooter(page: PDFPage, margin: number, footerHeight: number, font: PDFFont, pageNumber: number): void {
  page.drawText(`Page ${pageNumber}`, {
    x: margin,
    y: footerHeight,
    size: 8,
    font,
    color: rgb(0.35, 0.46, 0.55)
  });
}

function drawSummaryPage(page: PDFPage, rotation: RotationResult, boldFont: PDFFont, regularFont: PDFFont): void {
  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  page.drawText("Controle de la rotation", {
    x: margin,
    y,
    size: 20,
    font: boldFont,
    color: rgb(0.07, 0.13, 0.18)
  });
  y -= 24;

  page.drawText(
    `Equite globale: ${rotation.summary.fairnessScore}% · Creneaux non couverts: ${rotation.summary.uncoveredSlots}`,
    {
      x: margin,
      y,
      size: 10,
      font: regularFont,
      color: rgb(0.24, 0.36, 0.46)
    }
  );
  y -= 28;

  page.drawText("Repartition par agent", {
    x: margin,
    y,
    size: 13,
    font: boldFont,
    color: rgb(0.07, 0.13, 0.18)
  });
  y -= 18;

  for (const item of rotation.summary.agentSummaries) {
    const detail = Object.entries(item.slotsByDate)
      .map(([date, count]) => `${formatDisplayDate(date)}: ${count}`)
      .join(" | ");

    page.drawText(`${item.agentName} - ${item.totalSlots} creneau(x)${item.overload ? " - surveillance" : ""}`, {
      x: margin,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.07, 0.13, 0.18)
    });
    y -= 13;

    drawWrappedText(page, detail || "Aucun creneau", margin, y, width - margin * 2, regularFont, 9, 12, rgb(0.24, 0.36, 0.46));
    y -= 24;

    if (y < 80) {
      break;
    }
  }

  if (rotation.summary.alerts.length) {
    page.drawText("Alertes", {
      x: margin,
      y,
      size: 13,
      font: boldFont,
      color: rgb(0.07, 0.13, 0.18)
    });
    y -= 18;

    for (const alert of rotation.summary.alerts) {
      drawWrappedText(page, `- ${alert}`, margin, y, width - margin * 2, regularFont, 9, 12, rgb(0.62, 0.28, 0.2));
      y -= 16;
      if (y < 50) {
        break;
      }
    }
  }
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
  let lineY = y + (lines.length === 1 ? 4 : 8);

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: lineY,
      size,
      font,
      color: rgb(0.07, 0.13, 0.18)
    });
    lineY -= 9;
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
