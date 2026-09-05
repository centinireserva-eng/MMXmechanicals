// Relative density = molar mass of the gas / molar mass of dry air (28.97
// g/mol), at the same temperature and pressure (ideal-gas approximation) --
// this is exactly what SolverConfig.buoyancy_accel needs. Real accidental
// releases (e.g. refrigerated/pressurized gas boiling off cold) can behave
// heavier than this simple ratio suggests at first, but it is the standard
// starting point used by consequence-modeling tools for a first pass.
export interface GasPreset {
  id: string;
  name: string;
  formula: string;
  molarMass: number; // g/mol
  relativeDensity: number; // rho_gas / rho_air
  hazard: 'Inflamável' | 'Tóxico' | 'Asfixiante';
}

export const GAS_PRESETS: GasPreset[] = [
  { id: 'methane', name: 'Metano (gás natural)', formula: 'CH4', molarMass: 16.04, relativeDensity: 0.554, hazard: 'Inflamável' },
  { id: 'lpg', name: 'GLP / Propano', formula: 'C3H8', molarMass: 44.10, relativeDensity: 1.522, hazard: 'Inflamável' },
  { id: 'butane', name: 'Butano', formula: 'C4H10', molarMass: 58.12, relativeDensity: 2.006, hazard: 'Inflamável' },
  { id: 'hydrogen', name: 'Hidrogênio', formula: 'H2', molarMass: 2.02, relativeDensity: 0.070, hazard: 'Inflamável' },
  { id: 'ammonia', name: 'Amônia', formula: 'NH3', molarMass: 17.03, relativeDensity: 0.588, hazard: 'Tóxico' },
  { id: 'chlorine', name: 'Cloro', formula: 'Cl2', molarMass: 70.90, relativeDensity: 2.447, hazard: 'Tóxico' },
  { id: 'sulfur-dioxide', name: 'Dióxido de Enxofre', formula: 'SO2', molarMass: 64.07, relativeDensity: 2.211, hazard: 'Tóxico' },
  { id: 'carbon-monoxide', name: 'Monóxido de Carbono', formula: 'CO', molarMass: 28.01, relativeDensity: 0.967, hazard: 'Asfixiante' },
];

export function getGasPreset(id: string | null | undefined) {
  return GAS_PRESETS.find((gas) => gas.id === id);
}
