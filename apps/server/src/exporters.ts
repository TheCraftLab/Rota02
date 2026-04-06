import ExcelJS from "exceljs";
import type { RotationResult } from "@rota/core";
import { formatDisplayDate } from "@rota/core";

export function buildRotationCsv(rotation: RotationResult): string {
  const headers = ["Heure", ...rotation.dates.map(formatDisplayDate)];
  const lines = [headers.join(";")];

  for (const slot of rotation.slots) {
    const row = [slot];
    for (const date of rotation.dates) {
      const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
      row.push(escapeCsv(cell?.assignedAgentName ?? ""));
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
      row.push(cell?.assignedAgentName ?? "Non couvert");
    }
    planningSheet.addRow(row);
  }

  planningSheet.getRow(1).font = { bold: true };
  planningSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    row.eachCell((cell) => {
      if (cell.value === "Non couvert") {
        cell.fill = {
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

