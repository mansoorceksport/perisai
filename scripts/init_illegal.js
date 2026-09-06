import fs from 'fs';
import path from 'path';

// We write the structured dataset for illegal lenders
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outputPath = path.join(dataDir, 'illegal-lenders.json');

// Base metadata
const base = {
  source: "OJK/Satgas PASTI — Lampiran Siaran Pers: Daftar Pinjaman Online Ilegal dan Investasi Ilegal",
  source_file: "Daftar_Pinjaman_Online_Ilegal_dan_Investasi_Ilegal_April_2026.pdf",
  as_of: "2026-04",
  notes: [
    "Source data from OJK/Satgas PASTI published blocklist.",
    "Filtered according to rule C3: channel != 'facebook' && !name_is_placeholder."
  ],
  totals: {
    illegal_lending: 951,
    illegal_investment: 2
  },
  illegal_lending: []
};

fs.writeFileSync(outputPath, JSON.stringify(base, null, 2));
console.log("Initialized illegal-lenders.json");
