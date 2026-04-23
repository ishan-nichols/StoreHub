export type TaxRegion = {
  code: string;           // "US-TX", "MX-JAL"
  country: "US" | "MX";
  stateCode: string;      // "TX", "JAL"
  stateName: string;

  // ── Tax breakdown ──────────────────────────────────────────────────────────
  stateTaxRate: number;       // state-only rate  (decimal)
  countyTaxRate: number;      // avg county add-on (0 if none)
  cityTaxRate: number;        // avg city/local add-on (0 if none)
  combinedAvgRate: number;    // state + avg county + avg city  ← recommended default
  combinedMaxRate: number;    // worst-case maximum in this state

  /** @deprecated use combinedAvgRate — kept for backward compat */
  salesTaxRate: number;       // = combinedAvgRate

  currency: "USD" | "MXN";
  minimumWageHourly?: number;       // USD/hr for US
  minimumWageDailyMXN?: number;     // MXN/day for Mexico
  incomeTaxNote: string;
  specialNotes: string;
};

export const US_FEDERAL = {
  ficaRate: 0.0765,        // employer portion: 6.2% SS + 1.45% Medicare
  federalMinWage: 7.25,
  note: "Quarterly estimated income taxes required for self-employed. Federal corporate rate 21%. Individual rates 10–37% depending on income bracket.",
};

export const MX_FEDERAL = {
  ivaRate: 0.16,           // IVA federal
  borderIvaRate: 0.08,     // reduced IVA in border zones
  isrNote: "ISR (Impuesto Sobre la Renta) is federal in Mexico. Rates 1.92–35% for individuals, 30% corporate. Monthly provisional payments required.",
  minimumWageDailyGeneral: 248.93,   // MXN/day (2024)
  minimumWageDailyBorder:  374.89,   // MXN/day border zone (2024)
};

// ─── Helper to build a US region concisely ───────────────────────────────────
function us(
  stateCode: string, stateName: string,
  stateTax: number, countyTax: number, cityTax: number,
  maxRate: number,
  minWage: number,
  incomeTaxNote: string,
  specialNotes: string,
): TaxRegion {
  const combined = parseFloat((stateTax + countyTax + cityTax).toFixed(5));
  return {
    code: `US-${stateCode}`,
    country: "US",
    stateCode,
    stateName,
    stateTaxRate:    stateTax,
    countyTaxRate:   countyTax,
    cityTaxRate:     cityTax,
    combinedAvgRate: combined,
    combinedMaxRate: maxRate,
    salesTaxRate:    combined,    // backward compat
    currency: "USD",
    minimumWageHourly: minWage,
    incomeTaxNote,
    specialNotes,
  };
}

// ─── Helper to build a MX region ─────────────────────────────────────────────
function mx(
  stateCode: string, stateName: string,
  ivaRate: number,
  minWageDaily: number,
  incomeTaxNote: string,
  specialNotes: string,
): TaxRegion {
  return {
    code: `MX-${stateCode}`,
    country: "MX",
    stateCode,
    stateName,
    stateTaxRate:    ivaRate,
    countyTaxRate:   0,
    cityTaxRate:     0,
    combinedAvgRate: ivaRate,
    combinedMaxRate: ivaRate,
    salesTaxRate:    ivaRate,
    currency: "MXN",
    minimumWageDailyMXN: minWageDaily,
    incomeTaxNote,
    specialNotes,
  };
}

export const TAX_REGIONS: TaxRegion[] = [
  // ── United States (50 states + DC) ───────────────────────────────────────
  // Columns: stateCode, stateName, state%, county avg%, city avg%, max%, min wage, income tax note, special notes
  // Source: Tax Foundation 2024, Sales Tax Clearinghouse

  us("AL","Alabama",         0.04,   0.0510, 0.0018, 0.1350, 7.25,  "State income tax 2–5%.",                 "County/city taxes widely vary; max combined ~13.5% in some municipalities."),
  us("AK","Alaska",          0,      0.0135, 0.0041, 0.075,  10.85, "No state income tax.",                   "No state sales tax. Local borough & city taxes up to 7.5% (Juneau 5%, Kodiak 6%)."),
  us("AZ","Arizona",         0.056,  0.0047, 0.0248, 0.1120, 14.35, "State income tax 2.5% flat.",            "Cities impose transaction privilege tax (TPT). Phoenix 8.6%, Tucson 8.7%."),
  us("AR","Arkansas",        0.065,  0.0117, 0.0230, 0.1150, 11.00, "State income tax 2–4.7%.",               "County and city taxes stack; Fort Smith 9.75%, Little Rock 8.625%."),
  us("CA","California",      0.0725, 0.0116, 0.0041, 0.1075, 16.00, "State income tax 1–13.3%.",              "District taxes vary by county. LA County 10.25%, San Francisco 8.625%."),
  us("CO","Colorado",        0.029,  0.0068, 0.0422, 0.1120, 14.42, "State income tax 4.4% flat.",            "Denver 8.81%. Home-rule cities set their own rates independently of the state."),
  us("CT","Connecticut",     0.0635, 0,      0,      0.0635, 15.69, "State income tax 2–6.99%.",              "No county or local sales tax. Flat statewide rate."),
  us("DE","Delaware",        0,      0,      0,      0,      13.25, "State income tax 2.2–6.6%.",             "No sales tax at any level."),
  us("FL","Florida",         0.06,   0.0105, 0,      0.085,  13.00, "No state income tax.",                   "County discretionary surtax 0–1.5% (most counties 1%). Max combined 8.5%."),
  us("GA","Georgia",         0.04,   0.0283, 0.0063, 0.09,   7.25,  "State income tax 5.49% flat.",           "LOST & SPLOST local option taxes common; most counties 7–8% combined."),
  us("HI","Hawaii",          0.04,   0.0044, 0,      0.045,  14.00, "State income tax 1.4–11%.",              "General Excise Tax (GET), not a traditional retail sales tax. County surcharge 0.5%."),
  us("ID","Idaho",           0.06,   0.0001, 0.0001, 0.09,   7.25,  "State income tax 5.8% flat.",            "Minimal local taxes. Resort cities may add small amounts."),
  us("IL","Illinois",        0.0625, 0.0065, 0.0200, 0.1150, 14.00, "State income tax 4.95% flat.",           "Chicago 10.25%. Cook County 1.75%. High local variability in metro areas."),
  us("IN","Indiana",         0.07,   0,      0,      0.07,   7.25,  "State income tax 3.05% flat.",           "No county or city sales tax. Flat statewide rate."),
  us("IA","Iowa",            0.06,   0,      0.0097, 0.07,   7.25,  "State income tax 4.4–6%.",               "Local option sales tax (LOST) up to 1% in many cities; Des Moines 7%."),
  us("KS","Kansas",          0.065,  0.0117, 0.0203, 0.1150, 7.25,  "State income tax 3.1–5.7%.",             "Wichita 7.5%, Overland Park 9.1%. High local variability."),
  us("KY","Kentucky",        0.06,   0,      0,      0.06,   7.25,  "State income tax 4.5% flat.",            "No county or local sales tax. Flat statewide rate."),
  us("LA","Louisiana",       0.0445, 0.0464, 0.0046, 0.1295, 7.25,  "State income tax 1.85–4.25%.",           "Parish taxes among the highest in US. New Orleans 9.45%, Baton Rouge 9.95%."),
  us("ME","Maine",           0.055,  0,      0,      0.055,  14.15, "State income tax 5.8–7.15%.",            "No county or local sales tax. Flat statewide rate."),
  us("MD","Maryland",        0.06,   0,      0,      0.06,   15.00, "State income tax 2–5.75%.",              "No county sales tax (counties levy income tax instead, 2.25–3.2%)."),
  us("MA","Massachusetts",   0.0625, 0,      0,      0.0625, 15.00, "State income tax 5% flat (9% cap gains).","No county or local sales tax. Flat statewide rate."),
  us("MI","Michigan",        0.06,   0,      0,      0.06,   10.33, "State income tax 4.25% flat.",           "No county or local sales tax. Some cities levy local income tax separately."),
  us("MN","Minnesota",       0.06875,0.0014, 0.0052, 0.09875,10.85, "State income tax 5.35–9.85%.",          "Minneapolis 8.025%. Special local taxes fund transit and stadiums."),
  us("MS","Mississippi",     0.07,   0.0007, 0,      0.08,   7.25,  "State income tax 5% flat.",             "Minimal local taxes. Essentially flat statewide."),
  us("MO","Missouri",        0.04225,0.0173, 0.0239, 0.1199, 12.30, "State income tax 4.95% flat.",           "St. Louis 9.679%, Kansas City 8.6%. High local stacking."),
  us("MT","Montana",         0,      0,      0,      0,      10.30, "State income tax 4.7–5.9%.",             "No sales tax at any level."),
  us("NE","Nebraska",        0.055,  0,      0.0143, 0.075,  12.00, "State income tax 2.46–5.84%.",          "City taxes up to 2%. Omaha 7%, Lincoln 7.25%."),
  us("NV","Nevada",          0.0685, 0.0130, 0.0011, 0.08375,7.25,  "No state income tax.",                  "Clark County (Las Vegas) 8.375%. County rates dominate."),
  us("NH","New Hampshire",   0,      0,      0,      0,      7.25,  "No wage income tax (interest/dividends 3%).","No sales tax at any level."),
  us("NJ","New Jersey",      0.06625,0,      0,      0.06625,15.49, "State income tax 1.4–10.75%.",          "No county or city sales tax. Flat statewide rate. Urban Enterprise Zones 3.3125%."),
  us("NM","New Mexico",      0.05,   0.0106, 0.0176, 0.09063,12.00, "State income tax 1.7–5.9%.",            "Gross Receipts Tax (GRT) paid by sellers. Albuquerque 7.875%, Santa Fe 8.4375%."),
  us("NY","New York",        0.04,   0.0452, 0,      0.08875,16.00, "State income tax 4–10.9%.",             "NYC combined 8.875% (state 4% + NYC 4.5% + MCTD 0.375%). Most counties 7–8.5%."),
  us("NC","North Carolina",  0.0475, 0.0200, 0.0022, 0.075,  7.25,  "State income tax 4.5% flat.",           "County tax 2% (uniform). Some transit districts add 0.5%."),
  us("ND","North Dakota",    0.05,   0.0074, 0.0023, 0.08,   7.25,  "State income tax 1.1–2.9%.",            "Fargo 7.5%. Low local taxes overall."),
  us("OH","Ohio",            0.0575, 0.0140, 0.0005, 0.08,   10.45, "State income tax 2.765–3.99%.",         "County taxes 0.75–2.25%. Franklin County (Columbus) 7.5%. Cuyahoga (Cleveland) 8%."),
  us("OK","Oklahoma",        0.045,  0.0107, 0.0441, 0.1150, 7.25,  "State income tax 0.25–4.75%.",         "Oklahoma City 8.625%. Tulsa 8.517%. High city rates."),
  us("OR","Oregon",          0,      0,      0,      0,      14.70, "State income tax 4.75–9.9%.",           "No sales tax at any level."),
  us("PA","Pennsylvania",    0.06,   0.0034, 0,      0.08,   7.25,  "State income tax 3.07% flat.",          "Philadelphia 8% (state 6% + city 2%). Allegheny County 7%. Most areas 6%."),
  us("RI","Rhode Island",    0.07,   0,      0,      0.07,   14.00, "State income tax 3.75–5.99%.",         "No county or local sales tax. Flat statewide rate."),
  us("SC","South Carolina",  0.06,   0.0144, 0,      0.09,   7.25,  "State income tax 3–6.4%.",              "County taxes 1–3%. Charleston County 9%. Most counties 7–9%."),
  us("SD","South Dakota",    0.045,  0.019,  0,      0.065,  10.80, "No state income tax.",                  "Municipal taxes up to 2%. Sioux Falls 6.5%."),
  us("TN","Tennessee",       0.07,   0.0254, 0,      0.10,   7.25,  "No income tax on wages.",               "Highest combined average in US. Nashville 9.75%, Memphis 9.75%. County add-ons 2.25–2.75%."),
  us("TX","Texas",           0.0625, 0.0058, 0.0136, 0.0825, 7.25,  "No state income tax.",                  "Max combined rate capped at 8.25% by law. Houston 8.25%, Dallas 8.25%, Austin 8.25%."),
  us("UT","Utah",            0.061,  0.0017, 0.0090, 0.0905, 7.25,  "State income tax 4.65% flat.",          "Salt Lake County 7.25%. Local transit and highway districts add layers."),
  us("VT","Vermont",         0.06,   0,      0.0019, 0.07,   13.67, "State income tax 3.35–8.75%.",         "Local option tax 1% in some municipalities. Burlington 7%."),
  us("VA","Virginia",        0.053,  0,      0,      0.07,   12.00, "State income tax 2–5.75%.",             "State 4.3% + 1% regional + local transportation dist. 0.7%. Northern VA & Hampton Roads 6%."),
  us("WA","Washington",      0.065,  0.0048, 0.0232, 0.1040, 16.28, "No state income tax.",                  "Seattle 10.35%. Local rates vary widely. Destination-based sourcing rules apply."),
  us("WV","West Virginia",   0.06,   0,      0.0023, 0.07,   8.75,  "State income tax 3–6.5%.",              "Municipal taxes small. Charleston 7%."),
  us("WI","Wisconsin",       0.05,   0.0043, 0,      0.0675, 7.25,  "State income tax 3.54–7.65%.",         "County taxes 0.5% (most counties). Milwaukee County 5.6%."),
  us("WY","Wyoming",         0.04,   0.0128, 0.0013, 0.06,   7.25,  "No state income tax.",                  "County taxes 1–2%. Cheyenne 6%, Jackson 6%."),
  us("DC","DC",              0.06,   0,      0,      0.06,   17.50, "Income tax 4–10.75%.",                  "Not a state. Single jurisdiction, no county/local tax layer."),

  // ── México (31 estados + CDMX) ────────────────────────────────────────────
  // IVA federal = 16% applies in all states. ISR is federal. Salario mínimo 2024:
  // General = $248.93 MXN/day, Zona Libre Frontera Norte = $374.89 MXN/day
  mx("AGU", "Aguascalientes",          0.16, 248.93, "ISR federal aplica. Pago provisional mensual requerido.", "IVA 16% federal. Sin impuestos estatales de ventas adicionales."),
  mx("BCN", "Baja California",         0.08, 374.89, "ISR federal aplica.", "Zona Libre Frontera Norte: IVA reducido 8%, salario fronterizo $374.89/día."),
  mx("BCS", "Baja California Sur",     0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("CAM", "Campeche",                0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("CHP", "Chiapas",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("CHH", "Chihuahua",               0.08, 374.89, "ISR federal aplica.", "Municipios fronterizos (Ciudad Juárez): IVA 8%, salario $374.89/día."),
  mx("COA", "Coahuila",                0.08, 374.89, "ISR federal aplica.", "Municipios fronterizos (Piedras Negras, Acuña): IVA 8%."),
  mx("COL", "Colima",                  0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("CDMX","Ciudad de México (CDMX)", 0.16, 248.93, "ISR federal aplica.", "Capital federal. IVA 16%. Sin impuestos locales de ventas."),
  mx("DGO", "Durango",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("GTO", "Guanajuato",              0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("GRO", "Guerrero",                0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("HGO", "Hidalgo",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("JAL", "Jalisco",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal. Guadalajara es la capital."),
  mx("MEX", "Estado de México",        0.16, 248.93, "ISR federal aplica.", "IVA 16% federal. Estado más poblado."),
  mx("MIC", "Michoacán",               0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("MOR", "Morelos",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("NAY", "Nayarit",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("NLE", "Nuevo León",              0.08, 374.89, "ISR federal aplica.", "Municipios fronterizos (Nuevo Laredo del NL): IVA 8%. Monterrey interior: 16%."),
  mx("OAX", "Oaxaca",                  0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("PUE", "Puebla",                  0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("QRO", "Querétaro",               0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("ROO", "Quintana Roo",            0.16, 248.93, "ISR federal aplica.", "IVA 16% federal. Zona turística (Cancún, Tulum, Playa del Carmen)."),
  mx("SLP", "San Luis Potosí",         0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("SIN", "Sinaloa",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("SON", "Sonora",                  0.08, 374.89, "ISR federal aplica.", "Municipios fronterizos (Nogales, Agua Prieta): IVA 8%."),
  mx("TAB", "Tabasco",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("TAM", "Tamaulipas",              0.08, 374.89, "ISR federal aplica.", "Municipios fronterizos (Nuevo Laredo, Matamoros, Reynosa): IVA 8%."),
  mx("TLA", "Tlaxcala",                0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("VER", "Veracruz",                0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
  mx("YUC", "Yucatán",                 0.16, 248.93, "ISR federal aplica.", "IVA 16% federal. Mérida es la capital."),
  mx("ZAC", "Zacatecas",               0.16, 248.93, "ISR federal aplica.", "IVA 16% federal."),
];

export const US_REGIONS  = TAX_REGIONS.filter(r => r.country === "US");
export const MX_REGIONS  = TAX_REGIONS.filter(r => r.country === "MX");
export function getRegion(code: string) { return TAX_REGIONS.find(r => r.code === code); }

/** Format a decimal rate as "X.XX%" — drops trailing zeros after 2dp */
export function fmtRate(rate: number, decimals = 3): string {
  if (rate === 0) return "0%";
  const s = (rate * 100).toFixed(decimals).replace(/\.?0+$/, "");
  return `${s}%`;
}
