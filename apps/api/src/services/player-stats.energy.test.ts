import { calculateRoundEnergyRecovery } from './player-stats.service';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const dnpRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 24,
  stamina: 75,
  currentEnergy: 80,
});
assert(
  dnpRecovery >= 19 && dnpRecovery <= 20,
  'DNP recovery should be near full reset range',
);

const mediumRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 60,
  age: 27,
  stamina: 70,
  currentEnergy: 70,
});
const heavyRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 90,
  age: 27,
  stamina: 70,
  currentEnergy: 70,
});
const lightRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 30,
  age: 27,
  stamina: 70,
  currentEnergy: 70,
});
const dnpSameBaseline = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 27,
  stamina: 70,
  currentEnergy: 70,
});
assert(
  heavyRecovery < mediumRecovery,
  'Players should recover less after heavy minutes',
);
assert(
  mediumRecovery < lightRecovery,
  'Recovery should be higher after lighter workloads',
);
assert(
  lightRecovery < dnpSameBaseline,
  'Resting should recover more than playing minutes',
);

const youngFitRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 24,
  stamina: 85,
  currentEnergy: 90,
});
const oldLowStaminaRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 37,
  stamina: 50,
  currentEnergy: 90,
});
assert(
  oldLowStaminaRecovery < youngFitRecovery,
  'Age and stamina should influence recovery quality',
);

const youngDnpRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 20,
  stamina: 80,
  currentEnergy: 90,
});
const primeDnpRecovery = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 27,
  stamina: 80,
  currentEnergy: 90,
});
assert(
  youngDnpRecovery === primeDnpRecovery,
  'Up to age 30, resting players should fully recover missing energy',
);

const fullResetYoung = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 30,
  stamina: 70,
  currentEnergy: 50,
});
assert(
  fullResetYoung === 50,
  'A 30-year-old at 50% should fully recover when resting the whole match',
);

const age31HighStamina = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 31,
  stamina: 85,
  currentEnergy: 90,
});
const age37LowStamina = calculateRoundEnergyRecovery({
  minutesPlayed: 0,
  age: 37,
  stamina: 50,
  currentEnergy: 90,
});
assert(
  age31HighStamina > age37LowStamina,
  'Recovery above 30 should decline with age and improve with stamina',
);

const playedPrime = calculateRoundEnergyRecovery({
  minutesPlayed: 75,
  age: 27,
  stamina: 75,
  currentEnergy: 70,
});
const playedOlderLowStamina = calculateRoundEnergyRecovery({
  minutesPlayed: 75,
  age: 36,
  stamina: 52,
  currentEnergy: 70,
});
assert(
  playedOlderLowStamina < playedPrime,
  'For equal workload, older low-stamina players should recover less',
);
