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
        (field.includes("it") || field.includes("tech") || field.includes("computer")) &&
        (prog.includes("comp") || prog.includes("tech") || prog.includes("software") || prog.includes("engineer"))
      ) {
        score += 15;
      } else if (
        (field.includes("finance") || field.includes("account")) &&
        (prog.includes("finance") || prog.includes("account") || prog.includes("business") || prog.includes("econ"))
      ) {
        score += 15;
      } else if (
        (field.includes("market") || field.includes("media")) &&
        (prog.includes("market") || prog.includes("media") || prog.includes("comm") || prog.includes("design"))
      ) {
        score += 15;
      } else if (
        field.includes("engineer") &&
        prog.includes("engineer")
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
