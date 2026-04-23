export type TaxRegion = {
  code: string;           // "US-TX", "MX-JAL"
  country: "US" | "MX";
  stateCode: string;      // "TX", "JAL"
  stateName: string;
  salesTaxRate: number;   // decimal: 0.0625 = 6.25%
  currency: "USD" | "MXN";
  minimumWageHourly?: number;   // USD/hr for US
  minimumWageDailyMXN?: number; // MXN/day for Mexico
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
  minimumWageDailyBorder: 374.89,    // MXN/day border zone (2024)
};

export const TAX_REGIONS: TaxRegion[] = [
  // ── United States (50 states + DC) ───────────────────────────────────────
  { code:"US-AL", country:"US", stateCode:"AL", stateName:"Alabama",        salesTaxRate:0.04,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 2–5%.", specialNotes:"County/city taxes add 0–7% locally." },
  { code:"US-AK", country:"US", stateCode:"AK", stateName:"Alaska",         salesTaxRate:0,       currency:"USD", minimumWageHourly:10.85, incomeTaxNote:"No state income tax.", specialNotes:"No state sales tax. Local jurisdictions may levy up to 7.5%." },
  { code:"US-AZ", country:"US", stateCode:"AZ", stateName:"Arizona",        salesTaxRate:0.056,   currency:"USD", minimumWageHourly:14.35, incomeTaxNote:"State income tax 2.5% flat.", specialNotes:"Combined rates with local tax average ~8.4%." },
  { code:"US-AR", country:"US", stateCode:"AR", stateName:"Arkansas",       salesTaxRate:0.065,   currency:"USD", minimumWageHourly:11.00, incomeTaxNote:"State income tax 2–4.7%.", specialNotes:"" },
  { code:"US-CA", country:"US", stateCode:"CA", stateName:"California",     salesTaxRate:0.0725,  currency:"USD", minimumWageHourly:16.00, incomeTaxNote:"State income tax 1–13.3%.", specialNotes:"Highest state minimum wage in the US." },
  { code:"US-CO", country:"US", stateCode:"CO", stateName:"Colorado",       salesTaxRate:0.029,   currency:"USD", minimumWageHourly:14.42, incomeTaxNote:"State income tax 4.4% flat.", specialNotes:"Local taxes typically add 4–5%." },
  { code:"US-CT", country:"US", stateCode:"CT", stateName:"Connecticut",    salesTaxRate:0.0635,  currency:"USD", minimumWageHourly:15.69, incomeTaxNote:"State income tax 2–6.99%.", specialNotes:"" },
  { code:"US-DE", country:"US", stateCode:"DE", stateName:"Delaware",       salesTaxRate:0,       currency:"USD", minimumWageHourly:13.25, incomeTaxNote:"State income tax 2.2–6.6%.", specialNotes:"No sales tax." },
  { code:"US-FL", country:"US", stateCode:"FL", stateName:"Florida",        salesTaxRate:0.06,    currency:"USD", minimumWageHourly:13.00, incomeTaxNote:"No state income tax.", specialNotes:"No personal income tax. County surtax adds 0–1.5%." },
  { code:"US-GA", country:"US", stateCode:"GA", stateName:"Georgia",        salesTaxRate:0.04,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 5.49% flat.", specialNotes:"Local taxes add 3–5%." },
  { code:"US-HI", country:"US", stateCode:"HI", stateName:"Hawaii",         salesTaxRate:0.04,    currency:"USD", minimumWageHourly:14.00, incomeTaxNote:"State income tax 1.4–11%.", specialNotes:"General Excise Tax (GET) applies broadly. Not a traditional sales tax." },
  { code:"US-ID", country:"US", stateCode:"ID", stateName:"Idaho",          salesTaxRate:0.06,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 5.8% flat.", specialNotes:"" },
  { code:"US-IL", country:"US", stateCode:"IL", stateName:"Illinois",       salesTaxRate:0.0625,  currency:"USD", minimumWageHourly:14.00, incomeTaxNote:"State income tax 4.95% flat.", specialNotes:"Chicago metro adds significant local taxes." },
  { code:"US-IN", country:"US", stateCode:"IN", stateName:"Indiana",        salesTaxRate:0.07,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 3.05% flat.", specialNotes:"" },
  { code:"US-IA", country:"US", stateCode:"IA", stateName:"Iowa",           salesTaxRate:0.06,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 4.4–6% (2024).", specialNotes:"" },
  { code:"US-KS", country:"US", stateCode:"KS", stateName:"Kansas",         salesTaxRate:0.065,   currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 3.1–5.7%.", specialNotes:"" },
  { code:"US-KY", country:"US", stateCode:"KY", stateName:"Kentucky",       salesTaxRate:0.06,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 4.5% flat.", specialNotes:"" },
  { code:"US-LA", country:"US", stateCode:"LA", stateName:"Louisiana",      salesTaxRate:0.0445,  currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 1.85–4.25%.", specialNotes:"High local rates bring combined average to ~9.5%." },
  { code:"US-ME", country:"US", stateCode:"ME", stateName:"Maine",          salesTaxRate:0.055,   currency:"USD", minimumWageHourly:14.15, incomeTaxNote:"State income tax 5.8–7.15%.", specialNotes:"" },
  { code:"US-MD", country:"US", stateCode:"MD", stateName:"Maryland",       salesTaxRate:0.06,    currency:"USD", minimumWageHourly:15.00, incomeTaxNote:"State income tax 2–5.75%.", specialNotes:"County income tax adds 2.25–3.2%." },
  { code:"US-MA", country:"US", stateCode:"MA", stateName:"Massachusetts",  salesTaxRate:0.0625,  currency:"USD", minimumWageHourly:15.00, incomeTaxNote:"State income tax 5% flat (9% for cap gains).", specialNotes:"" },
  { code:"US-MI", country:"US", stateCode:"MI", stateName:"Michigan",       salesTaxRate:0.06,    currency:"USD", minimumWageHourly:10.33, incomeTaxNote:"State income tax 4.25% flat.", specialNotes:"Some cities levy local income tax." },
  { code:"US-MN", country:"US", stateCode:"MN", stateName:"Minnesota",      salesTaxRate:0.06875, currency:"USD", minimumWageHourly:10.85, incomeTaxNote:"State income tax 5.35–9.85%.", specialNotes:"" },
  { code:"US-MS", country:"US", stateCode:"MS", stateName:"Mississippi",    salesTaxRate:0.07,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 5% flat.", specialNotes:"" },
  { code:"US-MO", country:"US", stateCode:"MO", stateName:"Missouri",       salesTaxRate:0.04225, currency:"USD", minimumWageHourly:12.30, incomeTaxNote:"State income tax 4.95% flat.", specialNotes:"High local rates bring combined average to ~8.3%." },
  { code:"US-MT", country:"US", stateCode:"MT", stateName:"Montana",        salesTaxRate:0,       currency:"USD", minimumWageHourly:10.30, incomeTaxNote:"State income tax 4.7–5.9%.", specialNotes:"No sales tax." },
  { code:"US-NE", country:"US", stateCode:"NE", stateName:"Nebraska",       salesTaxRate:0.055,   currency:"USD", minimumWageHourly:12.00, incomeTaxNote:"State income tax 2.46–5.84%.", specialNotes:"" },
  { code:"US-NV", country:"US", stateCode:"NV", stateName:"Nevada",         salesTaxRate:0.0685,  currency:"USD", minimumWageHourly:11.25, incomeTaxNote:"No state income tax.", specialNotes:"" },
  { code:"US-NH", country:"US", stateCode:"NH", stateName:"New Hampshire",  salesTaxRate:0,       currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"No wage income tax (interest/dividends taxed 3%).", specialNotes:"No sales tax." },
  { code:"US-NJ", country:"US", stateCode:"NJ", stateName:"New Jersey",     salesTaxRate:0.06625, currency:"USD", minimumWageHourly:15.49, incomeTaxNote:"State income tax 1.4–10.75%.", specialNotes:"" },
  { code:"US-NM", country:"US", stateCode:"NM", stateName:"New Mexico",     salesTaxRate:0.05,    currency:"USD", minimumWageHourly:12.00, incomeTaxNote:"State income tax 1.7–5.9%.", specialNotes:"Gross Receipts Tax applies to sellers, not purchasers." },
  { code:"US-NY", country:"US", stateCode:"NY", stateName:"New York",       salesTaxRate:0.04,    currency:"USD", minimumWageHourly:16.00, incomeTaxNote:"State income tax 4–10.9%.", specialNotes:"NYC adds 4.5% local rate. Combined NYC rate = 8.875%." },
  { code:"US-NC", country:"US", stateCode:"NC", stateName:"North Carolina", salesTaxRate:0.0475,  currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 4.5% flat.", specialNotes:"" },
  { code:"US-ND", country:"US", stateCode:"ND", stateName:"North Dakota",   salesTaxRate:0.05,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 1.1–2.9%.", specialNotes:"" },
  { code:"US-OH", country:"US", stateCode:"OH", stateName:"Ohio",           salesTaxRate:0.0575,  currency:"USD", minimumWageHourly:10.45, incomeTaxNote:"State income tax 2.765–3.99%.", specialNotes:"Municipal taxes vary widely." },
  { code:"US-OK", country:"US", stateCode:"OK", stateName:"Oklahoma",       salesTaxRate:0.045,   currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 0.25–4.75%.", specialNotes:"" },
  { code:"US-OR", country:"US", stateCode:"OR", stateName:"Oregon",         salesTaxRate:0,       currency:"USD", minimumWageHourly:14.70, incomeTaxNote:"State income tax 4.75–9.9%.", specialNotes:"No sales tax." },
  { code:"US-PA", country:"US", stateCode:"PA", stateName:"Pennsylvania",   salesTaxRate:0.06,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 3.07% flat.", specialNotes:"Philadelphia adds 2% local sales tax." },
  { code:"US-RI", country:"US", stateCode:"RI", stateName:"Rhode Island",   salesTaxRate:0.07,    currency:"USD", minimumWageHourly:14.00, incomeTaxNote:"State income tax 3.75–5.99%.", specialNotes:"" },
  { code:"US-SC", country:"US", stateCode:"SC", stateName:"South Carolina", salesTaxRate:0.06,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 3–6.4%.", specialNotes:"" },
  { code:"US-SD", country:"US", stateCode:"SD", stateName:"South Dakota",   salesTaxRate:0.045,   currency:"USD", minimumWageHourly:10.80, incomeTaxNote:"No state income tax.", specialNotes:"" },
  { code:"US-TN", country:"US", stateCode:"TN", stateName:"Tennessee",      salesTaxRate:0.07,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"No income tax on wages.", specialNotes:"Combined with local tax averages ~9.5%. Highest combined average in US." },
  { code:"US-TX", country:"US", stateCode:"TX", stateName:"Texas",          salesTaxRate:0.0625,  currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"No state income tax.", specialNotes:"Max combined rate 8.25%." },
  { code:"US-UT", country:"US", stateCode:"UT", stateName:"Utah",           salesTaxRate:0.061,   currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 4.65% flat.", specialNotes:"" },
  { code:"US-VT", country:"US", stateCode:"VT", stateName:"Vermont",        salesTaxRate:0.06,    currency:"USD", minimumWageHourly:13.67, incomeTaxNote:"State income tax 3.35–8.75%.", specialNotes:"" },
  { code:"US-VA", country:"US", stateCode:"VA", stateName:"Virginia",       salesTaxRate:0.053,   currency:"USD", minimumWageHourly:12.00, incomeTaxNote:"State income tax 2–5.75%.", specialNotes:"" },
  { code:"US-WA", country:"US", stateCode:"WA", stateName:"Washington",     salesTaxRate:0.065,   currency:"USD", minimumWageHourly:16.28, incomeTaxNote:"No state income tax.", specialNotes:"Combined rates with local tax average ~9.3%." },
  { code:"US-WV", country:"US", stateCode:"WV", stateName:"West Virginia",  salesTaxRate:0.06,    currency:"USD", minimumWageHourly:8.75,  incomeTaxNote:"State income tax 3–6.5%.", specialNotes:"" },
  { code:"US-WI", country:"US", stateCode:"WI", stateName:"Wisconsin",      salesTaxRate:0.05,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"State income tax 3.54–7.65%.", specialNotes:"" },
  { code:"US-WY", country:"US", stateCode:"WY", stateName:"Wyoming",        salesTaxRate:0.04,    currency:"USD", minimumWageHourly:7.25,  incomeTaxNote:"No state income tax.", specialNotes:"" },
  { code:"US-DC", country:"US", stateCode:"DC", stateName:"Washington D.C.",salesTaxRate:0.06,    currency:"USD", minimumWageHourly:17.50, incomeTaxNote:"Income tax 4–9.75%.", specialNotes:"Not a state but treated as one for tax purposes." },

  // ── México (31 estados + CDMX) ────────────────────────────────────────────
  // IVA federal = 16% applies in all states. ISR is federal. Salario mínimo 2024:
  // General = $248.93 MXN/day, Zona Libre Frontera Norte = $374.89 MXN/day
  { code:"MX-AGU", country:"MX", stateCode:"AGU", stateName:"Aguascalientes",          salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica. Pago provisional mensual requerido.", specialNotes:"IVA 16% federal." },
  { code:"MX-BCN", country:"MX", stateCode:"BCN", stateName:"Baja California",         salesTaxRate:0.08, currency:"MXN", minimumWageDailyMXN:374.89, incomeTaxNote:"ISR federal aplica.", specialNotes:"Zona Libre Frontera Norte: IVA 8%, salario fronterizo $374.89/día." },
  { code:"MX-BCS", country:"MX", stateCode:"BCS", stateName:"Baja California Sur",     salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-CAM", country:"MX", stateCode:"CAM", stateName:"Campeche",                salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-CHP", country:"MX", stateCode:"CHP", stateName:"Chiapas",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-CHH", country:"MX", stateCode:"CHH", stateName:"Chihuahua",               salesTaxRate:0.08, currency:"MXN", minimumWageDailyMXN:374.89, incomeTaxNote:"ISR federal aplica.", specialNotes:"Municipios fronterizos: IVA 8%, salario $374.89/día." },
  { code:"MX-COA", country:"MX", stateCode:"COA", stateName:"Coahuila",                salesTaxRate:0.08, currency:"MXN", minimumWageDailyMXN:374.89, incomeTaxNote:"ISR federal aplica.", specialNotes:"Municipios fronterizos: IVA 8%." },
  { code:"MX-COL", country:"MX", stateCode:"COL", stateName:"Colima",                  salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-CDMX",country:"MX", stateCode:"CDMX",stateName:"Ciudad de México (CDMX)", salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"Capital federal. IVA 16%." },
  { code:"MX-DGO", country:"MX", stateCode:"DGO", stateName:"Durango",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-GTO", country:"MX", stateCode:"GTO", stateName:"Guanajuato",              salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-GRO", country:"MX", stateCode:"GRO", stateName:"Guerrero",                salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-HGO", country:"MX", stateCode:"HGO", stateName:"Hidalgo",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-JAL", country:"MX", stateCode:"JAL", stateName:"Jalisco",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal. Guadalajara es la capital." },
  { code:"MX-MEX", country:"MX", stateCode:"MEX", stateName:"Estado de México",        salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal. Estado más poblado." },
  { code:"MX-MIC", country:"MX", stateCode:"MIC", stateName:"Michoacán",               salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-MOR", country:"MX", stateCode:"MOR", stateName:"Morelos",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-NAY", country:"MX", stateCode:"NAY", stateName:"Nayarit",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-NLE", country:"MX", stateCode:"NLE", stateName:"Nuevo León",              salesTaxRate:0.08, currency:"MXN", minimumWageDailyMXN:374.89, incomeTaxNote:"ISR federal aplica.", specialNotes:"Municipios fronterizos: IVA 8%." },
  { code:"MX-OAX", country:"MX", stateCode:"OAX", stateName:"Oaxaca",                  salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-PUE", country:"MX", stateCode:"PUE", stateName:"Puebla",                  salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-QRO", country:"MX", stateCode:"QRO", stateName:"Querétaro",               salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-ROO", country:"MX", stateCode:"ROO", stateName:"Quintana Roo",            salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal. Zona turística (Cancún, Tulum)." },
  { code:"MX-SLP", country:"MX", stateCode:"SLP", stateName:"San Luis Potosí",         salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-SIN", country:"MX", stateCode:"SIN", stateName:"Sinaloa",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-SON", country:"MX", stateCode:"SON", stateName:"Sonora",                  salesTaxRate:0.08, currency:"MXN", minimumWageDailyMXN:374.89, incomeTaxNote:"ISR federal aplica.", specialNotes:"Municipios fronterizos (Nogales, etc.): IVA 8%." },
  { code:"MX-TAB", country:"MX", stateCode:"TAB", stateName:"Tabasco",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-TAM", country:"MX", stateCode:"TAM", stateName:"Tamaulipas",              salesTaxRate:0.08, currency:"MXN", minimumWageDailyMXN:374.89, incomeTaxNote:"ISR federal aplica.", specialNotes:"Municipios fronterizos (Nuevo Laredo, Matamoros): IVA 8%." },
  { code:"MX-TLA", country:"MX", stateCode:"TLA", stateName:"Tlaxcala",                salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-VER", country:"MX", stateCode:"VER", stateName:"Veracruz",                salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
  { code:"MX-YUC", country:"MX", stateCode:"YUC", stateName:"Yucatán",                 salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal. Mérida es la capital." },
  { code:"MX-ZAC", country:"MX", stateCode:"ZAC", stateName:"Zacatecas",               salesTaxRate:0.16, currency:"MXN", minimumWageDailyMXN:248.93, incomeTaxNote:"ISR federal aplica.", specialNotes:"IVA 16% federal." },
];

export const US_REGIONS  = TAX_REGIONS.filter(r => r.country === "US");
export const MX_REGIONS  = TAX_REGIONS.filter(r => r.country === "MX");
export function getRegion(code: string) { return TAX_REGIONS.find(r => r.code === code); }
