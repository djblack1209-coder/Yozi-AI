import {
  SHENLUN_METHOD,
  SHENLUN_METHOD_V2,
  shenlunIntakeEligible,
  shenlunCoachPrompt,
  validateShenlunLiveOutput
} from './learning-shenlun-method.js';

// Curated subject definitions only. Model text cannot register code or methods.
const methods = Object.freeze([
  Object.freeze({
    ...SHENLUN_METHOD_V2,
    intakeEligible: shenlunIntakeEligible,
    prompt: shenlunCoachPrompt,
    validateLiveOutput: validateShenlunLiveOutput
  }),
  Object.freeze({
    ...SHENLUN_METHOD,
    intakeEligible: shenlunIntakeEligible,
    prompt: shenlunCoachPrompt,
    validateLiveOutput: validateShenlunLiveOutput
  })
]);
export const SUBJECT_COACH_METHODS = Object.freeze(methods.map((method) => method.contract));
export const subjectCoachMethod = (exam, contract) =>
  methods.find((method) => method.exam === exam && (contract === undefined || method.contract === contract)) || null;
export const subjectCoachMethodByContract = (contract) =>
  methods.find((method) => method.contract === contract) || null;
export const subjectCoachMethodForProfile = (profile) =>
  subjectCoachMethod(profile?.exam, profile?.methodContract) ||
  (!profile?.exam ? methods.find((method) => method.subjectId === profile?.subject) || null : null);
export const subjectCoachMethodForIntake = (intake, allowed = SUBJECT_COACH_METHODS) =>
  methods.find((method) => allowed.includes(method.contract) && method.intakeEligible(intake)) || null;
