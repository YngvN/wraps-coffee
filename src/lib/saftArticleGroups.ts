/**
 * The SAF-T Cash Register article group codes (type 04, "Varegruppekoder") an admin can give a product
 * category, from Skatteetaten's code list (github.com/Skatteetaten/saf-t, PredefinedBasicID-04) —
 * the ones that can apply to a café. Shared by the export (`server/saft/`) and Settings → Register.
 */
export const ARTICLE_GROUP_CODES: Record<string, string> = {
  '04003': 'Varesalg',
  '04006': 'Mat',
  '04007': 'Øl',
  '04008': 'Vin',
  '04009': 'Brennevin',
  '04010': 'Rusbrus/Cider',
  '04011': 'Mineralvann (brus)',
  '04012': 'Annen drikke (te, kaffe etc)',
  '04013': 'Tobakk',
  '04014': 'Andre varer',
  '04999': 'Øvrige',
}

/** The group a category gets when none is chosen: food, the café's main sale. */
export const DEFAULT_ARTICLE_GROUP = '04006'
