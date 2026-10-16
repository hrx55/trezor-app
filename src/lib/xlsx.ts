import { strToU8, zipSync } from "fflate";

export type CellValue = string | number | Date | null | undefined;
export type ColumnKind = "text" | "money" | "percent" | "int" | "date";

export interface Column {
  header: string;
  kind: ColumnKind;
  width: number;
  /** Zbroji stupac u zadnjem redu (SUM formula). */
  total?: boolean;
}

// Indeksi stilova u styles.xml (cellXfs)
const STYLE = { text: 0, header: 1, money: 2, percent: 3, int: 4, date: 5, totalLabel: 6, totalMoney: 7 } as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const colLetter = (i: number) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Excel datumski serijski broj (dani od 1899-12-30), računato u UTC da zona ne pomakne dan. */
const excelSerial = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + 25569;

function cellXml(ref: string, value: CellValue, kind: ColumnKind): string {
  if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${STYLE[kind]}"/>`;
  if (kind === "text") return `<c r="${ref}" s="${STYLE.text}" t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
  if (kind === "date") {
    const d = value instanceof Date ? value : new Date(String(value) + "T00:00:00");
    if (isNaN(d.getTime())) return `<c r="${ref}" s="${STYLE.text}"/>`;
    return `<c r="${ref}" s="${STYLE.date}"><v>${excelSerial(d)}</v></c>`;
  }
  const n = Number(value);
  if (!isFinite(n)) return `<c r="${ref}" s="${STYLE.text}"/>`;
  return `<c r="${ref}" s="${STYLE[kind]}"><v>${n}</v></c>`;
}

export function buildXlsx(sheetName: string, columns: Column[], rows: CellValue[][]): Uint8Array {
  const lastCol = colLetter(columns.length - 1);
  const hasTotals = columns.some((c) => c.total) && rows.length > 0;

  const headerRow =
    `<row r="1" ht="22" customHeight="1">` +
    columns
      .map((c, i) => `<c r="${colLetter(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${esc(c.header)}</t></is></c>`)
      .join("") +
    `</row>`;

  const dataRows = rows
    .map((row, r) => {
      const n = r + 2;
      return `<row r="${n}">` + columns.map((c, i) => cellXml(`${colLetter(i)}${n}`, row[i], c.kind)).join("") + `</row>`;
    })
    .join("");

  let totalRow = "";
  if (hasTotals) {
    const n = rows.length + 2;
    const first = 2;
    const last = rows.length + 1;
    totalRow =
      `<row r="${n}">` +
      columns
        .map((c, i) => {
          const ref = `${colLetter(i)}${n}`;
          if (i === 0) return `<c r="${ref}" s="${STYLE.totalLabel}" t="inlineStr"><is><t>UKUPNO</t></is></c>`;
          if (c.total) {
            const sum = Math.round(rows.reduce((s, r) => s + (Number(r[i]) || 0), 0) * 100) / 100;
            return `<c r="${ref}" s="${STYLE.totalMoney}"><f>SUM(${colLetter(i)}${first}:${colLetter(i)}${last})</f><v>${sum}</v></c>`;
          }
          return `<c r="${ref}" s="${STYLE.totalLabel}"/>`;
        })
        .join("") +
      `</row>`;
  }

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${headerRow}${dataRows}${totalRow}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${rows.length + 1}"/>` +
    `</worksheet>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="3">` +
    `<numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/>` +
    `<numFmt numFmtId="165" formatCode="0.00&quot; %&quot;"/>` +
    `<numFmt numFmtId="166" formatCode="dd\\.mm\\.yyyy\\."/>` +
    `</numFmts>` +
    `<fonts count="3">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="4">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF8A733F"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF3EBD6"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left/><right/><top style="medium"><color rgb="FF8A733F"/></top><bottom/><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="8">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>` +
    `<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const safeName = esc(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));

  const files = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `</Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`
    ),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };

  return zipSync(files);
}

export function downloadXlsx(filename: string, sheetName: string, columns: Column[], rows: CellValue[][]) {
  const bytes = buildXlsx(sheetName, columns, rows);
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
