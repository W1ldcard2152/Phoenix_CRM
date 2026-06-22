// Curated list of vehicle makes the shop services — the single shared source for
// the vendor "Makes" multi-select (Settings) and the vehicle make autocomplete
// (VehicleForm + intake wizard), so vendor make tags cross-reference vehicle makes.
//
// Matching is case-insensitive everywhere it's used (see vendorRanking.vendorServesMake),
// so a VIN/AI-decoded make like "AUDI" still matches the curated "Audi" here. The
// make field stays free-text/autocomplete (not a hard dropdown) precisely so the
// VIN decoder and AI registration extractor can override with any NHTSA value.
//
// German marques first (shop specialty), then common US/Asian/other makes.
export const VEHICLE_MAKES = [
  'Audi',
  'BMW',
  'Mercedes-Benz',
  'MINI',
  'Porsche',
  'Volkswagen',
  'Volvo',
  'Acura',
  'Alfa Romeo',
  'Buick',
  'Cadillac',
  'Chevrolet',
  'Chrysler',
  'Dodge',
  'Fiat',
  'Ford',
  'Genesis',
  'GMC',
  'Honda',
  'Hyundai',
  'Infiniti',
  'Jaguar',
  'Jeep',
  'Kia',
  'Land Rover',
  'Lexus',
  'Lincoln',
  'Maserati',
  'Mazda',
  'Mitsubishi',
  'Nissan',
  'Ram',
  'Subaru',
  'Tesla',
  'Toyota',
];

export default VEHICLE_MAKES;
