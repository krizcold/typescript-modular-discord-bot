/**
 * Compares two command definitions and returns true if they differ.
 *
 * @param existingCommand - The command as registered on Discord.
 * @param localCommand - The command defined in your local source.
 * @returns {boolean} True if differences are found.
 */
export default function areCommandsDifferent(existingCommand: any, localCommand: any): boolean {
  const areChoicesDifferent = (existingChoices: any[], localChoices: any[]): boolean => {
    for (const localChoice of localChoices) {
      const existingChoice = existingChoices?.find((choice) => choice.name === localChoice.name);
      if (!existingChoice) {
        return true;
      }
      if (localChoice.value !== existingChoice.value) {
        return true;
      }
    }
    return false;
  };

  const areOptionsDifferent = (existingOptions: any[], localOptions: any[]): boolean => {
    for (const localOption of localOptions) {
      const existingOption = existingOptions?.find((option) => option.name === localOption.name);
      if (!existingOption) {
        return true;
      }
      if (
        localOption.description !== existingOption.description ||
        localOption.type !== existingOption.type ||
        ((localOption.required || false) !== (existingOption.required || false)) ||
        ((localOption.choices?.length || 0) !== (existingOption.choices?.length || 0)) ||
        areChoicesDifferent(localOption.choices || [], existingOption.choices || [])
      ) {
        return true;
      }
    }
    return false;
  };

  if (
    (existingCommand.description !== localCommand.description &&
      existingCommand.description !== "[TEST] " + localCommand.description) ||
    ((existingCommand.options?.length || 0) !== (localCommand.options?.length || 0)) ||
    areOptionsDifferent(existingCommand.options || [], localCommand.options || [])
  ) {
    return true;
  }

  return false;
}
