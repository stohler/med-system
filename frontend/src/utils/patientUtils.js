import dayjs from "dayjs";

export function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = dayjs(birthDate);
  if (!birth.isValid()) return null;
  const age = dayjs().diff(birth, "year");
  return age >= 0 ? age : null;
}

export function formatBirthDate(birthDate) {
  if (!birthDate) return null;
  const birth = dayjs(birthDate);
  return birth.isValid() ? birth.format("DD/MM/YYYY") : null;
}
