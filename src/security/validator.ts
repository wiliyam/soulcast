import { resolve } from "node:path";

const DANGEROUS_PATTERNS = [
  /\.\.\//,
  /;\s*(rm|dd|mkfs|shutdown|reboot)\b/,
  /&&\s*(rm|dd|mkfs)\b/,
  /\$\(/,
  /`[^`]*`/,
  />\s*\/dev\//,
];

const SECRET_PATTERNS = [
  /\.env$/,
  /\.env\..+$/,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
  /credentials\.json$/,
  /\.ssh\//,
];

export class SecurityValidator {
  constructor(private approvedDirectory: string) {}

  validatePath(filePath: string): { valid: boolean; reason?: string } {
    const resolved = resolve(filePath);
    const approved = resolve(this.approvedDirectory);

    if (!resolved.startsWith(approved)) {
      return {
        valid: false,
        reason: `Path ${filePath} is outside approved directory`,
      };
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(resolved)) {
        return {
          valid: false,
          reason: `Access to secret file blocked: ${filePath}`,
        };
      }
    }

    return { valid: true };
  }

  validateInput(input: string): { valid: boolean; reason?: string } {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        return {
          valid: false,
          reason: "Input contains potentially dangerous pattern",
        };
      }
    }
    return { valid: true };
  }
}
