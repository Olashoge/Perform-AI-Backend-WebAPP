export const EQUIPMENT_CATEGORIES: { category: string; items: string[] }[] = [
  { category: "Cardio", items: ["Treadmill", "Stationary bike", "Spin bike", "Rowing machine", "Elliptical", "Stair climber", "Ski erg", "Assault/air bike", "Jump rope"] },
  { category: "Free weights", items: ["Dumbbells", "Adjustable dumbbells", "Barbells", "EZ bar", "Kettlebells", "Weight plates", "Bench (flat)", "Bench (adjustable)"] },
  { category: "Racks & accessories", items: ["Squat rack", "Power rack", "Smith machine", "Pull-up bar", "Dip station", "Resistance bands", "Cable attachments"] },
  { category: "Machines", items: ["Cable machine / functional trainer", "Leg press", "Hack squat", "Leg extension", "Leg curl", "Lat pulldown", "Seated row", "Chest press machine", "Pec deck", "Shoulder press machine", "Calf raise machine", "Hip thrust machine", "Glute bridge machine", "Ab machine"] },
  { category: "Home / bodyweight / mobility", items: ["Yoga mat", "Foam roller", "Medicine ball", "Slam ball", "Stability ball", "TRX / suspension trainer", "Plyo box", "Step platform"] },
  { category: "Outdoors", items: ["Track access", "Hills/stairs", "Field", "Pool access"] },
];

export const GYM_PRESELECT = [
  "Treadmill", "Stationary bike", "Rowing machine", "Elliptical",
  "Dumbbells", "Barbells", "EZ bar", "Kettlebells", "Weight plates", "Bench (flat)", "Bench (adjustable)",
  "Squat rack", "Power rack", "Smith machine", "Pull-up bar", "Dip station", "Resistance bands", "Cable attachments",
  "Cable machine / functional trainer", "Leg press", "Leg extension", "Leg curl", "Lat pulldown", "Seated row", "Chest press machine", "Pec deck", "Shoulder press machine", "Calf raise machine",
  "Yoga mat", "Foam roller",
];

export const HOME_PRESELECT = [
  "Dumbbells", "Resistance bands", "Yoga mat", "Foam roller",
  "Jump rope", "Kettlebells", "Pull-up bar",
];

export const OUTDOORS_PRESELECT = ["Track access", "Hills/stairs", "Field", "Jump rope"];

export function getPreselectForLocation(location: string): string[] {
  if (location === "gym") return [...GYM_PRESELECT];
  if (location === "home") return [...HOME_PRESELECT];
  if (location === "outdoors") return [...OUTDOORS_PRESELECT];
  return [];
}

export function mapProfileLocationToFormLocation(profileLoc: string | null | undefined): "gym" | "home_equipment" | "outdoor" | "home_none" | "mixed" | undefined {
  if (!profileLoc) return undefined;
  if (profileLoc === "gym") return "gym";
  if (profileLoc === "home") return "home_equipment";
  if (profileLoc === "outdoors") return "outdoor";
  return undefined;
}

export function mapFormLocationToProfileLocation(formLoc: string): "gym" | "home" | "outdoors" | null {
  if (formLoc === "gym") return "gym";
  if (formLoc === "home_equipment" || formLoc === "home_none") return "home";
  if (formLoc === "outdoor") return "outdoors";
  if (formLoc === "mixed") return null;
  return null;
}

export function getPreselectForFormLocation(formLoc: string): string[] {
  const profileLoc = mapFormLocationToProfileLocation(formLoc);
  if (!profileLoc) return [];
  return getPreselectForLocation(profileLoc);
}
