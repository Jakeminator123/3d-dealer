// Labbets steg: vad vart och ett heter i menyn, vad det är till för i en rad, och vilka av produktionens steg
// (docs/production.md: Scen → Identitet → Förlaga → Ankare → Film → Granska → Spela) det visar. Menyn, stegets rubrik
// och översikten läser härifrån; ingen annan lista över stegen finns.

/** Produktionens steg, i den ordning en dealer går dem (docs/production.md, Stegen). */
export const PATH = ['Scen', 'Identitet', 'Förlaga', 'Ankare', 'Film', 'Granska', 'Spela'] as const;
export type Stage = (typeof PATH)[number];

export type StepKey = 'oversikt' | 'scen' | 'kortplan' | 'dealer' | 'docka' | 'klipp' | 'granska';

export type Step = {
  key: StepKey;
  label: string;
  /** Två, tre ord under namnet i menyn: vad man ser där. */
  caption: string;
  /** En rad: vad steget är till för och vad man gör där. */
  line: string;
  /** Produktionens steg som steget visar eller arbetar med. */
  stages: Stage[];
  /** Menyns avdelning: steg i samma avdelning står intill varandra. */
  part: 'start' | 'scenen' | 'dealern' | 'doma';
};

/**
 * Stegen i menyns ordning. De följer vägen en dealer går: scenen hon står i, vad hon har och saknar, rörelsen som
 * filmerna görs efter, filmerna mot dockan, och omdömena. Spela är Casinot, ett eget läge med samma scen.
 */
export const STEPS: Step[] = [
  { key: 'oversikt', label: 'Översikt', caption: 'läget i dag', line: 'Vad som finns, vad som väntar på dig, och vart du går för att se det.', stages: [], part: 'start' },
  {
    key: 'scen',
    label: 'Scen',
    caption: 'bord, rum, hela given',
    line: 'Bordet, rummet och dealern så som de spelas. Välj bakgrund och vy, se hela given och döm bakgrunderna.',
    stages: ['Scen', 'Spela'],
    part: 'scenen',
  },
  {
    key: 'kortplan',
    label: 'Kortplan',
    caption: 'var korten ligger',
    line: 'Var korten ligger på bordet och hur fort klippen spelas. Dra i reglagen, se given medan du ställer, och spara.',
    stages: ['Scen'],
    part: 'scenen',
  },
  {
    key: 'dealer',
    label: 'Dealer',
    caption: 'vad hon har och saknar',
    line: 'Vad en spelbar dealer kräver och vad som finns: identitetsbilder, ankare och ett klipp per kort, och vad som är nästa steg.',
    stages: ['Identitet', 'Ankare', 'Film'],
    part: 'dealern',
  },
  {
    key: 'docka',
    label: 'Dockan',
    caption: 'rörelsen i 3D',
    line: 'Dockan gör dealerns rörelse, som filmerna görs efter. Välj rörelse och plats, spela, vrid kameran, ändra värdena och förbered en tagning.',
    stages: ['Förlaga', 'Film'],
    part: 'dealern',
  },
  {
    key: 'klipp',
    label: 'Klipp',
    caption: 'film mot docka',
    line: 'Varje tagning bredvid dockan den gjordes efter. Spela båda i takt, stega ruta för ruta, läs måtten och döm klippet med dina ord.',
    stages: ['Film', 'Granska'],
    part: 'dealern',
  },
  {
    key: 'granska',
    label: 'Granska',
    caption: 'omdömen',
    line: 'Allt i registret med sitt omdöme. Ett klick på ett omdöme, eller dina ord om en fil, sparas direkt.',
    stages: ['Granska'],
    part: 'doma',
  },
];

/** Steget man kommer till utan adress, och med en adress som inte pekar ut ett steg. */
export const START: StepKey = 'oversikt';

export const stepOf = (key: string | undefined): Step => STEPS.find((step) => step.key === key) ?? STEPS.find((step) => step.key === START)!;
