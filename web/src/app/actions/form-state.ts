/** What a form Server Action returns to `useActionState`. */
export interface FormState {
  /** General error shown above the submit button. */
  error?: string;
  /** Errors by field name. */
  fieldErrors?: Record<string, string>;
  /** What the user typed, so the form does not empty itself on error. */
  values?: Record<string, string>;
  /** Set when the action succeeded without navigating away. */
  ok?: boolean;
  /** Non-error notice after a successful action that stays on the page. */
  message?: string;
}

export const EMPTY_FORM: FormState = {};

export const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
