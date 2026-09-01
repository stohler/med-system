import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import { calculateAge, formatBirthDate } from "./patientUtils";

describe("patientUtils", () => {
  describe("calculateAge", () => {
    it("returns null when birthDate is missing", () => {
      expect(calculateAge(null)).toBeNull();
      expect(calculateAge(undefined)).toBeNull();
    });

    it("returns null for invalid dates", () => {
      expect(calculateAge("invalid")).toBeNull();
    });

    it("calculates age in completed years", () => {
      const birthDate = dayjs().subtract(30, "year").subtract(1, "day").toISOString();
      expect(calculateAge(birthDate)).toBe(30);
    });
  });

  describe("formatBirthDate", () => {
    it("returns null when birthDate is missing", () => {
      expect(formatBirthDate(null)).toBeNull();
    });

    it("formats valid dates as DD/MM/YYYY", () => {
      expect(formatBirthDate("1990-05-15")).toBe("15/05/1990");
    });
  });
});
