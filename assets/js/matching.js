/**
 * InternConnect - Skill-Based Matching Engine
 * Computes dynamic match scores between student profiles and internship postings.
 */

const SkillMatcher = {
  // Normalize and parse comma/space/pipe separated skill strings
  parseSkills(skillInput) {
    if (!skillInput) return [];
    if (Array.isArray(skillInput)) return skillInput.map(s => s.trim().toLowerCase()).filter(Boolean);
    return skillInput
      .split(/[,|\n;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  },

  /**
   * Calculate match percentage between student and internship
   * @param {string|Array} studentSkills
   * @param {string|Array} requiredSkills
   * @param {string} studentProgramme
   * @param {string} internshipField
   * @returns {{ score: number, matchedSkills: string[], missingSkills: string[] }}
   */
  calculateMatch(studentSkills, requiredSkills, studentProgramme = "", internshipField = "") {
    const student = this.parseSkills(studentSkills);
    const required = this.parseSkills(requiredSkills);

    if (required.length === 0) {
      return { score: 75, matchedSkills: [], missingSkills: [] };
    }

    if (student.length === 0) {
      return { score: 30, matchedSkills: [], missingSkills: required };
    }

    const matched = [];
    const missing = [];

    required.forEach(req => {
      // Check for exact or substring match
      const isMatch = student.some(stu => 
        stu === req || 
        stu.includes(req) || 
        req.includes(stu)
      );

      if (isMatch) {
        matched.push(req);
      } else {
        missing.push(req);
      }
    });

    const skillRatio = matched.length / required.length;
    let score = Math.round(skillRatio * 85); // Up to 85% based on direct skills

    // Programme & Field relevance bonus (up to 15%)
    if (studentProgramme && internshipField) {
      const prog = studentProgramme.toLowerCase();
      const field = internshipField.toLowerCase();
      if (
        (field.includes("it") || field.includes("tech") || field.includes("computer") || field.includes("information")) &&
        (prog.includes("comp") || prog.includes("tech") || prog.includes("software") || prog.includes("network") || prog.includes("system") || prog.includes("cyber") || prog.includes("data"))
      ) {
        score += 15;
      } else if (
        (field.includes("finance") || field.includes("account") || field.includes("banking") || field.includes("audit")) &&
        (prog.includes("finance") || prog.includes("account") || prog.includes("business") || prog.includes("econ") || prog.includes("audit") || prog.includes("commerce") || prog.includes("acca") || prog.includes("cima"))
      ) {
        score += 15;
      } else if (
        (field.includes("engineer") || field.includes("mining") || field.includes("civil") || field.includes("electrical") || field.includes("mechanical") || field.includes("geotech")) &&
        (prog.includes("engineer") || prog.includes("mining") || prog.includes("civil") || prog.includes("electrical") || prog.includes("mechanical") || prog.includes("geology") || prog.includes("geotech") || prog.includes("cad"))
      ) {
        score += 15;
      } else if (
        (field.includes("agri") || field.includes("crop") || field.includes("food") || field.includes("animal")) &&
        (prog.includes("agri") || prog.includes("crop") || prog.includes("food") || prog.includes("animal") || prog.includes("natural") || prog.includes("soil") || prog.includes("bio") || prog.includes("buan"))
      ) {
        score += 15;
      } else if (
        (field.includes("health") || field.includes("med") || field.includes("bio") || field.includes("pharm")) &&
        (prog.includes("health") || prog.includes("med") || prog.includes("bio") || prog.includes("pharm") || prog.includes("nurs") || prog.includes("lab"))
      ) {
        score += 15;
      } else if (
        (field.includes("market") || field.includes("media") || field.includes("broadcast") || field.includes("film") || field.includes("design")) &&
        (prog.includes("market") || prog.includes("media") || prog.includes("comm") || prog.includes("design") || prog.includes("broadcast") || prog.includes("film") || prog.includes("art") || prog.includes("pr"))
      ) {
        score += 15;
      } else if (
        (field.includes("tour") || field.includes("environ") || field.includes("ecol") || field.includes("wildlife")) &&
        (prog.includes("tour") || prog.includes("environ") || prog.includes("ecol") || prog.includes("wildlife") || prog.includes("hosp") || prog.includes("natural"))
      ) {
        score += 15;
      } else {
        score += 5;
      }
    } else {
      score += 5;
    }

    // Clamp between 15% and 98%
    score = Math.max(15, Math.min(98, score));

    return {
      score,
      matchedSkills: matched,
      missingSkills: missing
    };
  }
};

window.SkillMatcher = SkillMatcher;
