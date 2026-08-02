import type { LeadImportRow } from "@/lib/app-types";

type LeadField = keyof LeadImportRow;

const aliases: Record<LeadField, string[]> = {
  businessName: ["business_name", "business", "company_name", "company", "organization", "name"],
  website: ["website", "website_url", "company_website", "domain", "url"],
  email: ["email", "email_address", "work_email", "company_email"],
  phone: ["phone", "phone_number", "telephone", "mobile", "company_phone"],
  location: ["location", "city", "address", "company_location", "headquarters"],
  sourceRef: ["source_ref", "source_url", "linkedin_url", "profile_url", "company_url"],
  notes: ["notes", "note", "description", "comments"],
};

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseMatrix(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((item) => item.some(Boolean));
}

export interface LeadCsvPreview {
  rows: LeadImportRow[];
  headers: string[];
  recognizedFields: LeadField[];
  errors: string[];
  totalRows: number;
}

export function parseLeadCsv(input: string): LeadCsvPreview {
  const matrix = parseMatrix(input);
  if (matrix.length === 0) {
    return { rows: [], headers: [], recognizedFields: [], errors: [], totalRows: 0 };
  }
  const headers = matrix[0].map(normalizeHeader);
  const fieldIndexes = new Map<LeadField, number>();
  (Object.keys(aliases) as LeadField[]).forEach((field) => {
    const index = headers.findIndex((header) => aliases[field].includes(header));
    if (index >= 0) fieldIndexes.set(field, index);
  });
  if (fieldIndexes.size === 0) {
    return {
      rows: [],
      headers,
      recognizedFields: [],
      errors: ["No supported columns found. Add company, website, email, or phone headers."],
      totalRows: Math.max(matrix.length - 1, 0),
    };
  }

  const rows: LeadImportRow[] = [];
  const errors: string[] = [];
  const dataRows = matrix.slice(1);
  dataRows.slice(0, 1_000).forEach((values, index) => {
    const read = (field: LeadField) => values[fieldIndexes.get(field) ?? -1]?.trim() ?? "";
    const lead: LeadImportRow = {
      businessName: read("businessName").slice(0, 200),
      website: read("website").slice(0, 2_048),
      email: read("email").slice(0, 320),
      phone: read("phone").slice(0, 80),
      location: read("location").slice(0, 500),
      sourceRef: read("sourceRef").slice(0, 2_048),
      notes: read("notes").slice(0, 4_000),
    };
    if (!lead.businessName && !lead.website && !lead.email && !lead.phone) {
      if (errors.length < 20) errors.push(`Row ${index + 2} has no usable lead identity and was skipped.`);
      return;
    }
    rows.push(lead);
  });
  if (dataRows.length > 1_000) {
    errors.push(`${dataRows.length - 1_000} rows exceed the 1,000-row import limit.`);
  }
  return {
    rows,
    headers,
    recognizedFields: [...fieldIndexes.keys()],
    errors,
    totalRows: dataRows.length,
  };
}
