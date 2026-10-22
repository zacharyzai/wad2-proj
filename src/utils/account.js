// Household income bands (the values the server and src/rules/subsidies.js use) and their i18n label keys (bill.q.incomes.*).
export const INCOMES = { upTo1500: 'low', '1501to2300': 'mid', above2300: 'high', unsure: 'unsure' }
export const isCitizen = (citizenship) => citizenship === 'birth' || citizenship === 'became'
export const incomeText = (t, user) => (user?.income ? t(`bill.q.incomes.${INCOMES[user.income]}`) : '—')

// Short words for the account's citizenship ("Singapore citizen since 1988"), used on Account and the Bill page.
export const citizenshipText = (t, user) =>
  user?.citizenship ? t(`auth.citizenships.${user.citizenship}`, { year: user.citizenSince ?? '' }) : '—'
