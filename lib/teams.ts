// World Cup national teams for basket construction.
// Flags are emoji for now (self-contained); real flag PNGs can swap in later.

export type Team = { code: string; name: string; flag: string };

export const TEAMS: Team[] = [
  { code: "ARG", name: "Argentina", flag: "🇦🇷" },
  { code: "BRA", name: "Brazil", flag: "🇧🇷" },
  { code: "FRA", name: "France", flag: "🇫🇷" },
  { code: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "ESP", name: "Spain", flag: "🇪🇸" },
  { code: "GER", name: "Germany", flag: "🇩🇪" },
  { code: "POR", name: "Portugal", flag: "🇵🇹" },
  { code: "NED", name: "Netherlands", flag: "🇳🇱" },
  { code: "BEL", name: "Belgium", flag: "🇧🇪" },
  { code: "ITA", name: "Italy", flag: "🇮🇹" },
  { code: "CRO", name: "Croatia", flag: "🇭🇷" },
  { code: "URU", name: "Uruguay", flag: "🇺🇾" },
  { code: "COL", name: "Colombia", flag: "🇨🇴" },
  { code: "MEX", name: "Mexico", flag: "🇲🇽" },
  { code: "USA", name: "United States", flag: "🇺🇸" },
  { code: "JPN", name: "Japan", flag: "🇯🇵" },
  { code: "KOR", name: "South Korea", flag: "🇰🇷" },
  { code: "SEN", name: "Senegal", flag: "🇸🇳" },
  { code: "MAR", name: "Morocco", flag: "🇲🇦" },
  { code: "SUI", name: "Switzerland", flag: "🇨🇭" },
  { code: "DEN", name: "Denmark", flag: "🇩🇰" },
  { code: "SRB", name: "Serbia", flag: "🇷🇸" },
  { code: "POL", name: "Poland", flag: "🇵🇱" },
  { code: "GHA", name: "Ghana", flag: "🇬🇭" },
  { code: "NGA", name: "Nigeria", flag: "🇳🇬" },
  { code: "CMR", name: "Cameroon", flag: "🇨🇲" },
  { code: "ECU", name: "Ecuador", flag: "🇪🇨" },
  { code: "AUS", name: "Australia", flag: "🇦🇺" },
  { code: "CAN", name: "Canada", flag: "🇨🇦" },
  { code: "SAU", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "IRN", name: "Iran", flag: "🇮🇷" },
  { code: "CPV", name: "Cape Verde", flag: "🇨🇻" },
];

export const teamByCode = (code: string) => TEAMS.find((t) => t.code === code);
