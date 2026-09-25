// Tests for mapping Open Food Facts allergen tags onto our own codes.
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mapOffAllergens } from './allergenMap'

test('maps the EU allergens and merges fish with crustaceans', () => {
  const result = mapOffAllergens(['en:milk', 'en:gluten', 'en:fish', 'en:crustaceans', 'en:sesame-seeds', 'EN:Sulphur-dioxide-and-sulphites'])
  assert.deepEqual(result.allergens.sort(), ['F', 'G', 'M', 'SE', 'SU'])
  assert.deepEqual(result.allergensToCheck, [])
})

test('anything unclear is flagged, not guessed', () => {
  const result = mapOffAllergens(['en:milk', 'fr:lait', 'en:wheat', 'no:nøtter', 'en:none', ''])
  assert.deepEqual(result.allergens, ['M'])
  assert.deepEqual(result.allergensToCheck, ['fr:lait', 'en:wheat', 'no:nøtter'])
})

test('tolerates missing or malformed input', () => {
  assert.deepEqual(mapOffAllergens(undefined), { allergens: [], allergensToCheck: [] })
  assert.deepEqual(mapOffAllergens([1, null, 'en:eggs']), { allergens: ['E'], allergensToCheck: [] })
})
