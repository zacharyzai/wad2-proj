// Owner: Lokesh. How each kind of bill line looks: an icon + a colour tone, always shown with a text label (never colour alone).
// Keys are the contract enums (docs/scan-contract.md), so they match the i18n keys bill.category.* and bill.explain.*.
export const CATEGORY_STYLE = {
  consultation: { icon: 'user', tone: 'teal' },
  medication: { icon: 'pill', tone: 'blue' },
  investigation: { icon: 'zoom', tone: 'purple' },
  procedure: { icon: 'heart', tone: 'orange' },
  other: { icon: 'tag', tone: 'grey' },
}
export const SUBSIDY_STYLE = { icon: 'shield', tone: 'green' }
export const MEDISAVE_STYLE = { icon: 'wallet', tone: 'rose' }

// Money stays in integer cents for every sum; it only becomes dollars here, for display.
export const money = (cents) => '$' + (cents / 100).toFixed(2)
export const sumCents = (lines) => lines.reduce((total, line) => total + line.amountCents, 0)
