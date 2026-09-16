/**
 * Utility for generating truly random alphanumeric PINs / Passwords.
 * Both letters and numbers, truly random without meaningful words or prefixes.
 */

export function generateRandomPin(existingPins: string[] = [], length = 4): string {
  // Use clear characters (excluding confusing ones like uppercase O vs 0, lowercase l vs 1)
  const letters = 'abcdefghkmnpqrstuvwxyz';
  const numbers = '23456789';
  const allChars = 'abcdefghkmnpqrstuvwxyz23456789';

  const lowerExisting = new Set(existingPins.map((p) => p.toLowerCase().trim()));
  let result = '';
  let attempts = 0;

  do {
    // Guarantee at least 1 letter and at least 1 number
    const charArr: string[] = [];
    charArr.push(letters[Math.floor(Math.random() * letters.length)]);
    charArr.push(numbers[Math.floor(Math.random() * numbers.length)]);

    for (let i = 2; i < length; i++) {
      charArr.push(allChars[Math.floor(Math.random() * allChars.length)]);
    }

    // Shuffle the array
    for (let i = charArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [charArr[i], charArr[j]] = [charArr[j], charArr[i]];
    }

    result = charArr.join('');
    attempts++;
  } while (attempts < 100 && lowerExisting.has(result.toLowerCase()));

  return result;
}
