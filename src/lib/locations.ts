/**
 * Static location reference data for the property address form. Bundled (no
 * external geocoding service), so typing an address never sends anything off
 * the device.
 */

/** The 28 states and 8 union territories of India. */
export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

/** Cities grouped by state — the source for the city search suggestions. */
const CITIES_BY_STATE: Record<(typeof INDIAN_STATES)[number], string[]> = {
  "Andhra Pradesh": [
    "Visakhapatnam",
    "Vijayawada",
    "Guntur",
    "Nellore",
    "Kurnool",
    "Tirupati",
    "Kakinada",
    "Rajahmundry",
    "Kadapa",
    "Anantapur",
    "Eluru",
    "Ongole",
    "Amaravati",
    "Srikakulam",
    "Vizianagaram",
  ],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang"],
  Assam: ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur", "Nagaon", "Tinsukia", "Dispur"],
  Bihar: [
    "Patna",
    "Gaya",
    "Bhagalpur",
    "Muzaffarpur",
    "Darbhanga",
    "Purnia",
    "Arrah",
    "Begusarai",
    "Bihar Sharif",
    "Hajipur",
  ],
  Chhattisgarh: [
    "Raipur",
    "Bhilai",
    "Bilaspur",
    "Durg",
    "Korba",
    "Rajnandgaon",
    "Jagdalpur",
    "Ambikapur",
  ],
  Goa: ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"],
  Gujarat: [
    "Ahmedabad",
    "Surat",
    "Vadodara",
    "Rajkot",
    "Gandhinagar",
    "Bhavnagar",
    "Jamnagar",
    "Junagadh",
    "Anand",
    "Navsari",
    "Morbi",
    "Mehsana",
    "Bharuch",
    "Vapi",
    "Gandhidham",
  ],
  Haryana: [
    "Gurugram",
    "Faridabad",
    "Panipat",
    "Ambala",
    "Hisar",
    "Rohtak",
    "Karnal",
    "Sonipat",
    "Panchkula",
    "Yamunanagar",
    "Kurukshetra",
    "Rewari",
    "Bhiwani",
    "Sirsa",
  ],
  "Himachal Pradesh": ["Shimla", "Dharamshala", "Mandi", "Solan", "Kullu", "Manali", "Hamirpur"],
  Jharkhand: [
    "Ranchi",
    "Jamshedpur",
    "Dhanbad",
    "Bokaro Steel City",
    "Hazaribagh",
    "Deoghar",
    "Giridih",
  ],
  Karnataka: [
    "Bengaluru",
    "Mysuru",
    "Mangaluru",
    "Hubballi",
    "Dharwad",
    "Belagavi",
    "Kalaburagi",
    "Davanagere",
    "Ballari",
    "Shivamogga",
    "Tumakuru",
    "Udupi",
    "Manipal",
    "Vijayapura",
    "Hassan",
  ],
  Kerala: [
    "Thiruvananthapuram",
    "Kochi",
    "Kozhikode",
    "Thrissur",
    "Kollam",
    "Kannur",
    "Alappuzha",
    "Palakkad",
    "Kottayam",
    "Malappuram",
  ],
  "Madhya Pradesh": [
    "Indore",
    "Bhopal",
    "Jabalpur",
    "Gwalior",
    "Ujjain",
    "Sagar",
    "Rewa",
    "Satna",
    "Ratlam",
    "Dewas",
    "Katni",
    "Chhindwara",
  ],
  Maharashtra: [
    "Mumbai",
    "Pune",
    "Nagpur",
    "Nashik",
    "Thane",
    "Navi Mumbai",
    "Aurangabad",
    "Solapur",
    "Kolhapur",
    "Amravati",
    "Latur",
    "Nanded",
    "Akola",
    "Jalgaon",
    "Sangli",
    "Satara",
    "Ahmednagar",
    "Panvel",
    "Kalyan",
    "Pimpri-Chinchwad",
  ],
  Manipur: ["Imphal"],
  Meghalaya: ["Shillong", "Tura"],
  Mizoram: ["Aizawl", "Lunglei"],
  Nagaland: ["Kohima", "Dimapur"],
  Odisha: [
    "Bhubaneswar",
    "Cuttack",
    "Rourkela",
    "Berhampur",
    "Sambalpur",
    "Puri",
    "Balasore",
    "Bhadrak",
  ],
  Punjab: [
    "Ludhiana",
    "Amritsar",
    "Jalandhar",
    "Patiala",
    "Bathinda",
    "Mohali",
    "Pathankot",
    "Hoshiarpur",
    "Moga",
    "Phagwara",
  ],
  Rajasthan: [
    "Jaipur",
    "Kota",
    "Jodhpur",
    "Udaipur",
    "Ajmer",
    "Bikaner",
    "Alwar",
    "Bhilwara",
    "Sikar",
    "Sri Ganganagar",
    "Bharatpur",
    "Pali",
    "Tonk",
    "Chittorgarh",
    "Jhunjhunu",
    "Pilani",
  ],
  Sikkim: ["Gangtok", "Namchi"],
  "Tamil Nadu": [
    "Chennai",
    "Coimbatore",
    "Madurai",
    "Tiruchirappalli",
    "Salem",
    "Tirunelveli",
    "Vellore",
    "Erode",
    "Tiruppur",
    "Thoothukudi",
    "Thanjavur",
    "Dindigul",
    "Kanchipuram",
    "Hosur",
    "Nagercoil",
  ],
  Telangana: [
    "Hyderabad",
    "Warangal",
    "Nizamabad",
    "Karimnagar",
    "Khammam",
    "Secunderabad",
    "Mahbubnagar",
    "Nalgonda",
    "Siddipet",
  ],
  Tripura: ["Agartala"],
  "Uttar Pradesh": [
    "Lucknow",
    "Kanpur",
    "Ghaziabad",
    "Agra",
    "Varanasi",
    "Prayagraj",
    "Meerut",
    "Noida",
    "Greater Noida",
    "Bareilly",
    "Aligarh",
    "Moradabad",
    "Saharanpur",
    "Gorakhpur",
    "Jhansi",
    "Mathura",
    "Firozabad",
    "Ayodhya",
    "Muzaffarnagar",
    "Shahjahanpur",
  ],
  Uttarakhand: [
    "Dehradun",
    "Haridwar",
    "Roorkee",
    "Haldwani",
    "Rishikesh",
    "Nainital",
    "Rudrapur",
    "Kashipur",
  ],
  "West Bengal": [
    "Kolkata",
    "Howrah",
    "Durgapur",
    "Asansol",
    "Siliguri",
    "Kharagpur",
    "Bardhaman",
    "Haldia",
    "Darjeeling",
    "Malda",
  ],
  "Andaman and Nicobar Islands": ["Port Blair"],
  Chandigarh: ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Silvassa", "Diu"],
  Delhi: ["New Delhi", "Delhi"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Katra"],
  Ladakh: ["Leh", "Kargil"],
  Lakshadweep: ["Kavaratti"],
  Puducherry: ["Puducherry", "Karaikal"],
};

export interface CitySuggestion {
  city: string;
  state: string;
}

export const INDIAN_CITY_SUGGESTIONS: CitySuggestion[] = Object.entries(CITIES_BY_STATE)
  .flatMap(([state, cities]) => cities.map((city) => ({ city, state })))
  .sort((a, b) => a.city.localeCompare(b.city));

/**
 * Case-insensitive city search: prefix matches first, then matches anywhere in
 * the city or state name.
 */
export function searchIndianCities(query: string, limit = 8): CitySuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix: CitySuggestion[] = [];
  const contains: CitySuggestion[] = [];
  for (const s of INDIAN_CITY_SUGGESTIONS) {
    const city = s.city.toLowerCase();
    if (city.startsWith(q)) prefix.push(s);
    else if (city.includes(q) || s.state.toLowerCase().startsWith(q)) contains.push(s);
  }
  return [...prefix, ...contains].slice(0, limit);
}

/** ISO 3166-1 alpha-2 codes; display names come from Intl.DisplayNames. */
export const COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every IANA time zone the runtime knows (the standard list), with a small fallback. */
export function allTimeZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const zones = intl.supportedValuesOf?.("timeZone");
    if (zones && zones.length > 0) {
      return zones.includes("UTC") ? zones : [...zones, "UTC"];
    }
  } catch {
    // fall through
  }
  return [
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Europe/London",
    "America/New_York",
    "UTC",
  ];
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "GMT+5:30" for a zone, at the current date. */
export function timeZoneOffsetLabel(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * Time zones used in a country, where the browser can tell (Intl.Locale
 * timeZones — Chromium/Safari). Empty when unknown, so callers keep the
 * current choice instead of guessing.
 */
export function timeZonesForCountry(code: string): string[] {
  try {
    const locale = new Intl.Locale(`und-${code}`) as Intl.Locale & {
      getTimeZones?: () => string[];
      timeZones?: string[];
    };
    return locale.getTimeZones?.() ?? locale.timeZones ?? [];
  } catch {
    return [];
  }
}

/** Best guess of the user's country and time zone from this device's settings. */
export function detectDeviceLocation(): { countryCode: string; timeZone: string } {
  let timeZone = "Asia/Kolkata";
  let countryCode = "IN";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimeZone(tz)) timeZone = tz;
  } catch {
    // keep default
  }
  try {
    const languages = typeof navigator !== "undefined" ? navigator.languages : [];
    for (const lang of languages ?? []) {
      // Only an explicit region ("en-IN"), never one guessed from the language alone.
      const region = new Intl.Locale(lang).region;
      if (region && (COUNTRY_CODES as readonly string[]).includes(region)) {
        countryCode = region;
        break;
      }
    }
  } catch {
    // keep default
  }
  // The device zone is the stronger signal: Asia/Kolkata means India even on an en-US browser.
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") {
    countryCode = "IN";
    timeZone = "Asia/Kolkata";
  }
  return { countryCode, timeZone };
}
